import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useClient } from "sanity";
import { useRouter } from "sanity/router";
import { sanityConfig } from "@/lib/sanity";
import { groupPost, groupStatus, type FacebookGroup } from "@/lib/groupPosts";
import { primaryButton, secondaryButton, shortDay } from "./SlotPicker";

/**
 * «Посты в группы» — today's posts for the Facebook groups Kristina has
 * joined, one tap each.
 *
 * Facebook lets no site post to a group (its Groups API closed in April
 * 2024), and a bot in her account would put the account at risk. So this
 * does everything up to the last click: it knows each group's rules (see
 * «Группы Facebook»), shows the ones that allow a post today, and has the
 * post written — her voice, today's job, the page's prices, a link that
 * names the group. She copies it, opens the group, pastes, publishes, and
 * presses «Опубликовала», which rests the group until its rules allow the
 * next one.
 */

// Hoisted: useClient memoises on the options object's reference — see dashboardTool
const CLIENT_OPTIONS = { apiVersion: sanityConfig.apiVersion };

const GROUPS_QUERY = `*[_type == "facebookGroup" && !(_id in path("drafts.**"))] | order(name asc) {
  _id, name, url, active, days, everyDays, links, area, rules, lastPostedAt
}`;

const card: CSSProperties = {
  border: "1px solid rgba(128,128,128,0.3)",
  borderRadius: 10,
  padding: 16,
  display: "grid",
  gap: 12,
};

const muted: CSSProperties = { fontSize: 13, opacity: 0.75, margin: 0, lineHeight: 1.5 };

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; groups: FacebookGroup[] };

export function FacebookGroupsPane() {
  const client = useClient(CLIENT_OPTIONS);
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let abandoned = false;
    client
      .fetch<FacebookGroup[]>(GROUPS_QUERY)
      .then((groups) => {
        if (!abandoned) setLoad({ state: "ready", groups });
      })
      .catch(() => {
        if (!abandoned) setLoad({ state: "error" });
      });
    return () => {
      abandoned = true;
    };
  }, [client, attempt]);

  const readAgain = useCallback(() => setAttempt((n) => n + 1), []);

  const copy = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      setNotice("Не получилось скопировать — выделите текст в окошке и скопируйте вручную.");
    }
  }, []);

  /**
   * "I've posted it": the group rests until its rules allow the next post.
   * A draft of the group, if she has one open, gets the same date, or
   * publishing the draft later would bring the old one back.
   */
  const markPosted = useCallback(
    async (group: FacebookGroup) => {
      if (!group._id) return;
      setSaving(group._id);
      const at = new Date().toISOString();
      try {
        const draftId = `drafts.${group._id}`;
        const hasDraft = await client.fetch<number>(`count(*[_id == $id])`, { id: draftId });
        const tx = client.transaction().patch(group._id, (p) => p.set({ lastPostedAt: at }));
        if (hasDraft) tx.patch(draftId, (p) => p.set({ lastPostedAt: at }));
        await tx.commit();
        const next = groupStatus({ ...group, lastPostedAt: at }, new Date()).next;
        setNotice(`«${group.name}»: отмечено.${next ? ` Следующий пост сюда — ${shortDay(next)}.` : ""}`);
        setAttempt((n) => n + 1);
      } catch {
        setNotice(`«${group.name}»: не получилось отметить. Попробуйте ещё раз.`);
      } finally {
        setSaving(null);
      }
    },
    [client]
  );

  const now = new Date();
  const groups = load.state === "ready" ? load.groups : [];
  const withStatus = groups.map((group) => ({ group, status: groupStatus(group, now) }));
  const today = withStatus.filter((g) => g.status.state === "today");
  const later = withStatus
    .filter((g) => g.status.state === "later")
    .sort((a, b) => (a.status.next ?? "").localeCompare(b.status.next ?? ""));
  const paused = withStatus.filter((g) => g.status.state === "paused");

  const edit = (group: FacebookGroup) =>
    group._id && router.navigateIntent("edit", { id: group._id, type: "facebookGroup" });

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "24px 20px 64px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", display: "grid", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Посты в группы на сегодня</h1>
          <button type="button" style={secondaryButton} onClick={() => router.navigateIntent("create", { type: "facebookGroup" })}>
            + Добавить группу
          </button>
        </div>
        <p style={muted}>
          Facebook не разрешает сайтам публиковать в группах, поэтому последний шаг ваш: скопировать текст, открыть группу,
          вставить и опубликовать. Потом нажать «Опубликовала» — группа отдохнёт столько, сколько просят её правила.
        </p>

        {notice && (
          <p role="status" style={{ ...muted, opacity: 1, padding: "10px 12px", borderRadius: 8, background: "rgba(128,128,128,0.12)" }}>
            {notice}
          </p>
        )}

        {load.state === "loading" && <p style={muted}>Загружаю группы…</p>}
        {load.state === "error" && (
          <p style={muted}>
            Не получилось загрузить группы.{" "}
            <button type="button" style={secondaryButton} onClick={readAgain}>
              Попробовать ещё раз
            </button>
          </p>
        )}

        {load.state === "ready" && groups.length === 0 && (
          <div style={card}>
            <strong>Групп пока нет</strong>
            <p style={muted}>
              Нажмите «Добавить группу»: название, ссылка и правила — в какие дни можно рекламу и как часто. Группа появится
              здесь после «Опубликовать».
            </p>
          </div>
        )}

        {load.state === "ready" && groups.length > 0 && (
          <section style={{ display: "grid", gap: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              {today.length ? `Сегодня можно — ${today.length}` : "Сегодня постить некуда"}
            </h2>
            {today.length === 0 && (
              <p style={muted}>
                Правила всех групп на сегодня выполнены.{later[0]?.status.next ? ` Ближайший пост — ${shortDay(later[0].status.next)}.` : ""}
              </p>
            )}
            {today.map(({ group, status }) => {
              const post = groupPost(group, now);
              const id = group._id ?? group.name;
              return (
                <article key={id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 15 }}>{group.name}</strong>
                    <button type="button" style={{ ...secondaryButton, padding: "4px 8px", fontSize: 12 }} onClick={() => edit(group)}>
                      Правила
                    </button>
                  </div>
                  <p style={muted}>
                    {status.why}
                    {group.links === false ? " · ссылки здесь нельзя, в тексте WhatsApp" : ""}
                  </p>
                  {group.rules && <p style={{ ...muted, fontStyle: "italic" }}>{group.rules}</p>}
                  <textarea
                    readOnly
                    value={post.text}
                    rows={Math.min(14, post.text.split("\n").length + 3)}
                    aria-label={`Текст поста для «${group.name}»`}
                    onFocus={(e) => e.currentTarget.select()}
                    style={{
                      font: "inherit",
                      fontSize: 14,
                      lineHeight: 1.5,
                      padding: 12,
                      borderRadius: 8,
                      border: "1px solid rgba(128,128,128,0.35)",
                      background: "transparent",
                      color: "inherit",
                      width: "100%",
                      boxSizing: "border-box",
                      resize: "vertical",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" style={primaryButton(true)} onClick={() => copy(id, post.text)}>
                      {copied === id ? "Скопировано ✓" : "1. Скопировать текст"}
                    </button>
                    {group.url && (
                      <a href={group.url} target="_blank" rel="noopener noreferrer" style={{ ...secondaryButton, textDecoration: "none" }}>
                        2. Открыть группу ↗
                      </a>
                    )}
                    <button
                      type="button"
                      style={{ ...secondaryButton, opacity: saving === group._id ? 0.5 : 1 }}
                      disabled={saving === group._id}
                      onClick={() => markPosted(group)}
                    >
                      3. Опубликовала
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {later.length > 0 && (
          <section style={{ display: "grid", gap: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Позже</h2>
            {later.map(({ group, status }) => (
              <button
                key={group._id ?? group.name}
                type="button"
                onClick={() => edit(group)}
                style={{ ...card, gap: 4, textAlign: "left", font: "inherit", color: "inherit", background: "transparent", cursor: "pointer" }}
              >
                <span style={{ fontWeight: 600 }}>
                  {group.name}
                  {status.next ? ` — можно ${shortDay(status.next)}` : ""}
                </span>
                <span style={muted}>{status.why}</span>
              </button>
            ))}
          </section>
        )}

        {paused.length > 0 && (
          <section style={{ display: "grid", gap: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>На паузе</h2>
            <p style={muted}>
              {paused.map(({ group }) => group.name).join(", ")} — чтобы вернуть, откройте группу в «Группы Facebook» и
              поставьте «Публикуем в этой группе».
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
