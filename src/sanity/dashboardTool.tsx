import { useCallback, useEffect, useState } from "react";
import { useClient } from "sanity";
import type { Tool } from "sanity";
import { sanityConfig } from "@/lib/sanity";
import { studioToken } from "./studioToken";
import {
  agrees,
  channelInRussian,
  isDashboard,
  plural,
  type Dashboard,
  type StatLine,
  type Traffic,
} from "@/lib/studioStats";

/**
 * "Панель" (the Dashboard) — the first thing Kristina sees when she opens the
 * Studio. Every word on it is Russian, as is the rest of the Studio; the words
 * themselves are built in @/lib/studioStats, where they are tested.
 *
 * She runs the shop on her own. Before this, finding out how it was doing
 * meant three sites and two more passwords: Vercel for visitors, Google
 * Analytics for where they came from, and the Studio for everything else. In
 * practice it meant the Studio and nothing else, so nobody was looking at
 * whether anyone was visiting at all.
 *
 * Rules this page is written under, learned from the version of it she
 * ignored:
 *   - every number says what it means underneath, in a sentence, with no
 *     words from analytics. Not "conversion rate" — "of the people who came,
 *     none have bought yet";
 *   - a number she can do something about carries the something, spelled out
 *     as the click to make;
 *   - only things that are genuinely waiting on her are marked as urgent. A
 *     page where everything shouts is a page nobody reads twice.
 *
 * 🚨 Nothing here decrypts anything, and nothing here may. This file is
 * reachable from sanity.config.ts, which makes it browser code, and the key
 * that unseals customer details must never be browser code. It asks
 * /api/studio-stats and renders numbers, and that is the only shape it is
 * allowed to have. Importing @/lib/pii or @/lib/secrets here would ship the
 * unsealing machinery into a public JavaScript chunk — measured, and it
 * builds without one warning while doing it. The guard is the test named
 * "nothing the Studio can reach can decrypt a customer" in studioStats.test.ts,
 * which walks the imports out of sanity.config.ts and fails on that reach.
 *
 * Why the styling is inline: @sanity/ui is not a dependency of this project.
 * It exists only nested inside `sanity` itself, and installing a second copy
 * alongside it is the classic way to break the Studio's theme and context.
 * revealAction.tsx solved this the same way, so this file matches it.
 * Everything below leans on `currentColor` and translucency rather than fixed
 * greys, so it reads correctly whether the Studio is in its light theme or
 * its dark one.
 */

/* ─── Small pieces ─── */

const CARD: React.CSSProperties = {
  border: "1px solid rgba(128,128,128,0.25)",
  borderRadius: 6,
  padding: "14px 16px",
  marginBottom: 10,
};

function ChartIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </svg>
  );
}

function Line({ line }: { line: StatLine }) {
  const urgent = line.tone === "needs-you";
  return (
    <div
      style={{
        ...CARD,
        borderLeft: `3px solid ${
          urgent ? "#e0544e" : line.tone === "good" ? "#3fa06a" : "rgba(128,128,128,0.35)"
        }`,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{line.value}</span>
        <span style={{ fontSize: 15, opacity: 0.85 }}>{line.label}</span>
      </div>
      <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6, lineHeight: 1.5 }}>{line.meaning}</div>
      {line.action && (
        <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5, opacity: 0.95 }}>
          <strong style={{ fontWeight: 600 }}>Что сделать: </strong>
          {line.action}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        opacity: 0.55,
        margin: "26px 0 10px",
      }}
    >
      {children}
    </h2>
  );
}

/**
 * The visitors block.
 *
 * "Not connected" is a state this page is expected to spend time in, not an
 * error — reading Google needs a key that somebody has to create by hand — so
 * it says what is missing and who fixes it, and the rest of the page carries
 * on regardless.
 */
function Visitors({ traffic }: { traffic: Traffic }) {
  if (traffic.state === "not-connected") {
    return (
      <div style={{ ...CARD, borderStyle: "dashed" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Статистика посещений пока не подключена</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6, lineHeight: 1.5 }}>
          Когда её подключат, здесь будет видно, сколько людей зашло в магазин за неделю и
          откуда — из Google, из Instagram или по чьей-то ссылке. Всё остальное на этой
          странице работает и без неё.
        </div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>Попросите Сафара подключить Google Analytics.</div>
      </div>
    );
  }

  if (traffic.state === "error") {
    return (
      <div style={{ ...CARD, borderStyle: "dashed" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Google сейчас не ответил</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6, lineHeight: 1.5 }}>
          С остальной страницей всё в порядке — не хватает только статистики посещений. Если
          завтра её всё ещё не будет, покажите Сафару эту строку: {traffic.detail}
        </div>
      </div>
    );
  }

  const total = traffic.sources.reduce((sum, source) => sum + source.visitors, 0);

  return (
    <>
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 600 }}>
            {traffic.visitors.toLocaleString("ru-RU")}{" "}
            {plural(traffic.visitors, "человек", "человека", "человек")}
          </span>
          <span style={{ fontSize: 15, opacity: 0.85 }}>
            {agrees(traffic.visitors, "зашёл", "зашли")} в магазин за последние 7 дней
          </span>
        </div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6, lineHeight: 1.5 }}>
          Всего просмотров страниц: {traffic.views.toLocaleString("ru-RU")}. Здесь считаются
          только те, кто принял баннер о cookie, поэтому на самом деле людей чуть больше — с
          Vercel эти цифры никогда не совпадут точно, и это нормально.
        </div>
      </div>

      {traffic.sources.length > 0 && (
        <div style={CARD}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
            Откуда пришли на этой неделе
          </div>
          {traffic.sources.map((source) => {
            const share = total > 0 ? Math.round((source.visitors / total) * 100) : 0;
            return (
              <div key={source.name} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    marginBottom: 4,
                    gap: 12,
                  }}
                >
                  <span>{channelInRussian(source.name)}</span>
                  <span style={{ opacity: 0.7, whiteSpace: "nowrap" }}>
                    {source.visitors.toLocaleString("ru-RU")}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(128,128,128,0.2)" }}>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      width: `${share}%`,
                      minWidth: share > 0 ? 4 : 0,
                      background: "currentColor",
                      opacity: 0.55,
                    }}
                  />
                </div>
              </div>
            );
          })}
          {/* These come from a second reading, counted per route and cut to the
              top five, so they neither add up to the headline number nor to
              each other — the page explains why Google disagrees with Vercel
              and used to leave this one for her to spot on her own. */}
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 10, lineHeight: 1.5 }}>
            В сумме это не совпадёт с числом выше: кто заходил дважды разными путями, посчитан в
            обоих. Самая длинная полоса — то, откуда скорее всего придёт ваш следующий клиент; а
            если какая-то почти пустая, именно над ней и стоит поработать.
          </div>
        </div>
      )}
    </>
  );
}

/* ─── The page ─── */

type Load =
  | { state: "loading" }
  | { state: "ready"; data: Dashboard }
  | { state: "failed"; message: string };

/**
 * Asks the site for the numbers and comes back with whatever should be on
 * screen, including the failures.
 *
 * Written to always await before it decides anything, so that the effect
 * below never sets state while it is still running — React treats that as a
 * cascading render, and the lint rule that says so is right.
 *
 * None of the three failures may reach Kristina as an English stack trace, so
 * each one is answered here, in Russian, in words that say whether the shop is
 * broken.
 */
async function readDashboard(token: string | null, fresh: boolean): Promise<Load> {
  if (!token) {
    return {
      state: "failed",
      message:
        "Не удалось найти ваш вход в Studio. Выйдите из Studio, войдите снова и откройте эту страницу ещё раз.",
    };
  }

  try {
    const res = await fetch("/api/studio-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `fresh` is what "Check again" means: skip the site's own ninety-second
      // cache. She presses it straight after answering somebody, and a button
      // that hands back the same page while looking busy is how she learns to
      // stop believing the page.
      body: JSON.stringify({ token, fresh }),
    });
    const body: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const said = (body as { error?: unknown } | null)?.error;
      return {
        state: "failed",
        message:
          typeof said === "string" && said
            ? said
            : "Сейчас не получилось загрузить цифры магазина. Попробуйте через минуту.",
      };
    }
    if (!isDashboard(body)) {
      return {
        state: "failed",
        message:
          "Цифры магазина пришли в виде, который эта страница не поняла. Попробуйте через минуту, а если это повторяется — скажите Сафару.",
      };
    }
    return { state: "ready", data: body };
  } catch {
    // Almost always the laptop's wifi rather than the shop, and saying so
    // saves a worried message to Safar about the site being down.
    return {
      state: "failed",
      message: "Не удалось связаться с магазином. Проверьте интернет и попробуйте ещё раз.",
    };
  }
}

/**
 * Hoisted, and that is the whole point.
 *
 * `useClient` memoises on the *reference* of the options object, not on what
 * is inside it. Built inline, a fresh literal every render missed the cache
 * every render and handed back a new client, the client sat in the effect's
 * dependencies, the effect re-read the numbers, the state changed, and the
 * panel asked the site for the shop's takings again — without pause, for as
 * long as the tab stayed open. The dependency below is the token string
 * rather than the client for the same reason: a value React can compare.
 */
const CLIENT_OPTIONS = { apiVersion: sanityConfig.apiVersion };

function DashboardPanel() {
  const client = useClient(CLIENT_OPTIONS);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  // Bumped by "Check again". The read lives in the effect rather than in the
  // button so that both ways of asking take exactly the same path.
  const [attempt, setAttempt] = useState(0);

  const token = studioToken(client.config().token);

  useEffect(() => {
    let abandoned = false;
    // The first read of the session may be served from the site's short cache;
    // every press of "Check again" (attempt > 0) asks for the numbers as they
    // are this second.
    void readDashboard(token, attempt > 0).then((next) => {
      // She may have clicked away, or clicked again, while Google was slow.
      if (!abandoned) setLoad(next);
    });
    return () => {
      abandoned = true;
    };
  }, [token, attempt]);

  const readAgain = useCallback(() => {
    setLoad({ state: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 24px 64px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Как дела у магазина</h1>
          <button
            type="button"
            onClick={readAgain}
            disabled={load.state === "loading"}
            style={{
              font: "inherit",
              fontSize: 13,
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid rgba(128,128,128,0.4)",
              background: "transparent",
              color: "inherit",
              cursor: load.state === "loading" ? "default" : "pointer",
              opacity: load.state === "loading" ? 0.5 : 1,
            }}
          >
            {load.state === "loading" ? "Загрузка…" : "Обновить"}
          </button>
        </div>

        {load.state === "loading" && (
          <p style={{ fontSize: 15, opacity: 0.7, marginTop: 24 }}>
            Загружаем цифры магазина — это займёт несколько секунд.
          </p>
        )}

        {load.state === "failed" && (
          <div style={{ ...CARD, marginTop: 24, borderLeft: "3px solid #e0544e" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Не удалось загрузить цифры</div>
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6, lineHeight: 1.5 }}>{load.message}</div>
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>
              Сам магазин работает — просто эта страница не смогла получить свои цифры.
            </div>
          </div>
        )}

        {load.state === "ready" && (
          <>
            <p style={{ fontSize: 17, lineHeight: 1.5, margin: "14px 0 4px" }}>{load.data.headline}</p>

            {load.data.sections.map((section) => (
              <section key={section.key}>
                <SectionTitle>{section.title}</SectionTitle>
                {section.lines.map((line) => (
                  <Line key={line.key} line={line} />
                ))}
              </section>
            ))}

            <SectionTitle>Кто заходит на сайт</SectionTitle>
            <Visitors traffic={load.data.traffic} />

            <p style={{ fontSize: 12, opacity: 0.5, marginTop: 24, lineHeight: 1.5 }}>
              Обновлено{" "}
              {new Date(load.data.measuredAt).toLocaleString("ru-RU", {
                dateStyle: "long",
                timeStyle: "short",
                // The atelier's clock, wherever the laptop happens to be.
                timeZone: "Europe/London",
              })}
              . Здесь только количества и суммы — имена, адреса и почта клиентов на этой странице
              не показываются никогда.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Registered first in sanity.config.ts, so it is the page the Studio opens on.
 */
export const dashboardTool: Tool = {
  name: "dashboard",
  title: "Панель",
  icon: ChartIcon,
  component: DashboardPanel,
};
