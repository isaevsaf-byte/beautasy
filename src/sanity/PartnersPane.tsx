import { useEffect, useState, type CSSProperties } from "react";
import {
  PARTNER_KINDS,
  defaultCommission,
  isPartnerSlug,
  judgePartner,
  kindTitle,
  partnerCardPath,
  partnerLinkShown,
  shiftMonth,
  slugFrom,
  whatsappNumberFrom,
  type CreditState,
  type PartnerKind,
  type PartnerTotals,
  type StatementLine,
} from "@/lib/partners";
import { dayTitle, formatPounds, monthTitle } from "@/lib/ledger";
import { useDiaryToken } from "./diaryClient";
import { pounds } from "@/lib/friendsLink";
import { askPartners, detailsOf, errorOf, offerOf, rowsOf, type Offer, type PartnerDetails, type PartnerRow } from "./partnersClient";
import { primaryButton, secondaryButton } from "./SlotPicker";

/**
 * «Партнёры» — salons and shops that send Kristina their clients.
 *
 * A partner gets a link worth printing (/p/the-hair-lounge), a card for the
 * counter in two clicks, and a statement for any month: who came, what they
 * paid, the credit the partner earned and, for a bridal salon, its
 * percentage. The rules are in @/lib/partners; the money runs through
 * Beautasy Friends, so the £5 off and the £5 credit happen by themselves.
 *
 * 🚨 This is browser code. Partners' contacts are sealed and their clients'
 * payments are in «Касса», so everything is asked of /api/studio/partners,
 * which holds the key. Nothing here may import @/lib/secrets, @/lib/pii or
 * @/lib/partnerStore — studioStats.test.ts walks the imports out of
 * sanity.config.ts and fails on that reach.
 *
 * Styling is inline, as in LedgerPane: @sanity/ui is not a dependency.
 */

const IN = "#2f8a57";
const OUT = "#c0392b";
const LINE = "1px solid rgba(128,128,128,0.25)";
const muted: CSSProperties = { opacity: 0.7 };

const inputStyle: CSSProperties = {
  font: "inherit",
  fontSize: 14,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid rgba(128,128,128,0.4)",
  background: "transparent",
  color: "inherit",
  width: "100%",
  boxSizing: "border-box",
};
const labelStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 13 };
const hintStyle: CSSProperties = { fontSize: 12, ...muted, lineHeight: 1.45 };

/* ─── The form ─── */

export interface PartnerForm {
  /** Set when changing a partner already made */
  id?: string;
  name: string;
  slug: string;
  /** Once she types the link herself, the name stops rewriting it */
  slugTouched: boolean;
  kind: PartnerKind;
  commission: string;
  commissionTouched: boolean;
  contactName: string;
  email: string;
  phone: string;
  active: boolean;
}

export function blankPartnerForm(): PartnerForm {
  return {
    name: "",
    slug: "",
    slugTouched: false,
    kind: "salon",
    commission: "0",
    commissionTouched: false,
    contactName: "",
    email: "",
    phone: "",
    active: true,
  };
}

export function formFromDetails(details: PartnerDetails): PartnerForm {
  const p = details.partner;
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    slugTouched: true,
    kind: p.kind,
    commission: String(p.commissionPercent),
    commissionTouched: true,
    contactName: p.contactName ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    active: p.active,
  };
}

/** A change to one field, with the two the name and the kind fill in until she takes them over. */
export function editForm(form: PartnerForm, change: Partial<PartnerForm>): PartnerForm {
  const next = { ...form, ...change };
  if (change.name !== undefined && !form.id && !next.slugTouched) next.slug = slugFrom(change.name);
  if (change.kind !== undefined && !next.commissionTouched) next.commission = String(defaultCommission(change.kind));
  return next;
}

export function partnerPayload(form: PartnerForm): Record<string, unknown> {
  return {
    name: form.name,
    slug: form.slug,
    kind: form.kind,
    commissionPercent: form.commission,
    contactName: form.contactName,
    email: form.email,
    phone: form.phone,
    active: form.active,
  };
}

export function PartnerFormView({
  form,
  busy,
  error,
  onChange,
  onSave,
  onCancel,
}: {
  form: PartnerForm;
  busy: boolean;
  error: string | null;
  onChange: (form: PartnerForm) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const creating = !form.id;
  // The same judgement the server makes, said before she presses the button
  const verdict = judgePartner(partnerPayload(form));
  const typed = form.name.trim().length >= 2;
  const canSave = !busy && verdict.ok;
  const set = (change: Partial<PartnerForm>) => onChange(editForm(form, change));

  return (
    <div style={{ display: "grid", gap: 14, padding: 16, border: LINE, borderRadius: 8 }}>
      <h2 style={{ fontSize: 17, margin: 0 }}>{creating ? "Новый партнёр" : `Изменить: ${form.name || "партнёр"}`}</h2>

      <label style={labelStyle}>
        Название салона
        <input style={inputStyle} value={form.name} maxLength={60} placeholder="The Hair Lounge" onChange={(e) => set({ name: e.target.value })} />
        <span style={hintStyle}>Как на вывеске — по-английски. Его увидят клиентки на странице и на карточке.</span>
      </label>

      {creating ? (
        <label style={labelStyle}>
          Ссылка
          <input
            style={inputStyle}
            value={form.slug}
            maxLength={30}
            placeholder="the-hair-lounge"
            onChange={(e) => set({ slug: e.target.value.toLowerCase(), slugTouched: true })}
          />
          <span style={hintStyle}>
            {isPartnerSlug(form.slug) ? (
              <>
                Будет: <strong>{partnerLinkShown(form.slug)}</strong>. Её напечатают на карточках, поэтому потом она не
                меняется.
              </>
            ) : (
              "Латинские буквы и цифры через дефис, например the-hair-lounge."
            )}
          </span>
        </label>
      ) : (
        <p style={{ ...hintStyle, margin: 0 }}>
          Ссылка: <strong>{partnerLinkShown(form.slug)}</strong> — она напечатана на карточках, поэтому не меняется.
        </p>
      )}

      <label style={labelStyle}>
        Кто это
        <select style={inputStyle} value={form.kind} onChange={(e) => set({ kind: e.target.value as PartnerKind })}>
          {PARTNER_KINDS.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.title}
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Комиссия деньгами, %
        <input
          style={inputStyle}
          value={form.commission}
          inputMode="decimal"
          maxLength={5}
          onChange={(e) => set({ commission: e.target.value, commissionTouched: true })}
        />
        <span style={hintStyle}>
          Процент от того, что заплатили клиентки этого салона, — сверх £5 кредита за каждую. Обычно только свадебным
          салонам (10%). Без комиссии — 0. Платить — только по договорённости с владелицей салона. Хранится
          зашифрованной: другие салоны её не увидят.
        </span>
      </label>

      <label style={labelStyle}>
        Имя владелицы
        <input style={inputStyle} value={form.contactName} maxLength={40} placeholder="Emma" onChange={(e) => set({ contactName: e.target.value })} />
        <span style={hintStyle}>Только имя — для «Hi Emma» в отчёте. Хранится зашифрованным.</span>
      </label>

      <label style={labelStyle}>
        Эл. почта салона
        <input style={inputStyle} type="email" value={form.email} maxLength={200} onChange={(e) => set({ email: e.target.value })} />
        <span style={hintStyle}>Сюда сайт сам пришлёт код кредита, когда клиентка салона закончит работу. Хранится зашифрованной.</span>
      </label>

      <label style={labelStyle}>
        Телефон для WhatsApp
        <input style={inputStyle} type="tel" value={form.phone} maxLength={30} placeholder="07700 900123" onChange={(e) => set({ phone: e.target.value })} />
        <span style={hintStyle}>Чтобы отправить салону отчёт за месяц одной кнопкой. Хранится зашифрованным.</span>
      </label>

      {!creating && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
          Партнёр работает
          <span style={hintStyle}>— снимите, чтобы поставить на паузу: ссылка перестанет давать скидку и кредит.</span>
        </label>
      )}

      {typed && !verdict.ok && <p style={{ color: OUT, fontSize: 13, margin: 0 }}>{verdict.error}</p>}
      {error && (
        <p role="alert" style={{ color: OUT, fontSize: 14, margin: 0 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={primaryButton(canSave)} disabled={!canSave} onClick={onSave}>
          {busy ? "Сохраняем…" : creating ? "Создать партнёра" : "Сохранить"}
        </button>
        <button type="button" style={secondaryButton} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}

/* ─── Small pieces ─── */

function CardButtons({ slug }: { slug: string }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <a style={{ ...secondaryButton, textDecoration: "none" }} href={partnerCardPath(slug, "card")} target="_blank" rel="noreferrer">
        🖨 Визитка для печати
      </a>
      <a style={{ ...secondaryButton, textDecoration: "none" }} href={partnerCardPath(slug, "a6")} target="_blank" rel="noreferrer">
        🖨 Табличка A6 на стойку
      </a>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      style={secondaryButton}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => setDone(true),
          () => setDone(false)
        );
      }}
    >
      {done ? "✓ Скопировано" : label}
    </button>
  );
}

function MonthNav({ month, thisMonth, onMonth }: { month: string; thisMonth: string; onMonth: (month: string) => void }) {
  const latest = month >= thisMonth;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button type="button" style={secondaryButton} aria-label="Предыдущий месяц" onClick={() => onMonth(shiftMonth(month, -1))}>
        ‹
      </button>
      <strong style={{ fontSize: 15, minWidth: 130, textAlign: "center" }}>{monthTitle(month)}</strong>
      <button
        type="button"
        style={{ ...secondaryButton, opacity: latest ? 0.4 : 1 }}
        aria-label="Следующий месяц"
        disabled={latest}
        onClick={() => onMonth(shiftMonth(month, 1))}
      >
        ›
      </button>
    </div>
  );
}

/** "клиенток 5, оплатили £300.00, кредита салону £25.00, комиссия £30.00" */
export function allTimeText(t: PartnerTotals, commissionPercent: number): string {
  const parts = [`клиенток ${t.clients}`, `оплатили ${formatPounds(t.paid)}`, `кредита салону ${formatPounds(t.credit)}`];
  if (commissionPercent > 0) parts.push(`комиссия ${formatPounds(t.commission)}`);
  return parts.join(", ");
}

/** "Клиенток: 2 · Оплатили: £85.00 · Кредит салону: £10.00 · Комиссия 10%: £8.50" */
export function totalsText(t: PartnerTotals, commissionPercent: number): string {
  const parts = [`Новых клиенток: ${t.clients}`, `Оплатили: ${formatPounds(t.paid)}`, `Кредит салону: ${formatPounds(t.credit)}`];
  if (commissionPercent > 0) parts.push(`Комиссия ${commissionPercent}%: ${formatPounds(t.commission)}`);
  return parts.join(" · ");
}

const CREDIT_WORDS: Record<CreditState, string> = {
  rewarded: "✓ начислен",
  pending: "начисляется",
  reversed: "отозван — был возврат",
  waiting: "после «Выполнена»",
  soon: "начислится утром",
  none: "—",
};

/* ─── The list ─── */

export function PartnerListView({
  rows,
  offer,
  month,
  thisMonth,
  onMonth,
  onOpen,
  onNew,
}: {
  rows: PartnerRow[];
  offer: Offer | null;
  month: string;
  thisMonth: string;
  onMonth: (month: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <MonthNav month={month} thisMonth={thisMonth} onMonth={onMonth} />
        <button type="button" style={primaryButton(true)} onClick={onNew}>
          + Новый партнёр
        </button>
      </div>

      {offer && !offer.enabled && (
        <p role="alert" style={{ fontSize: 14, margin: 0, color: OUT }}>
          Программа «Beautasy Friends» выключена в разделе «Сайт и настройки» → «Настройки сайта», поэтому все партнёрские ссылки сейчас на паузе.
        </p>
      )}

      {rows.length === 0 ? (
        <div style={{ padding: 16, border: LINE, borderRadius: 8, display: "grid", gap: 8 }}>
          <p style={{ fontSize: 14, margin: 0, lineHeight: 1.55 }}>
            Партнёров пока нет. Партнёр — салон или магазин, который советует вас своим клиенткам. У каждого своя ссылка
            и карточка с QR: клиентке — {offer ? pounds(offer.discount) : "скидка"} на первую подгонку, салону —{" "}
            {offer ? pounds(offer.credit) : "кредит"} кредита, когда вы отметите её работу «Выполнена». Свадебному
            салону можно платить ещё процент.
          </p>
          <p style={{ fontSize: 14, margin: 0, ...muted }}>Нажмите «+ Новый партнёр», когда салон согласится.</p>
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.id} style={{ padding: 16, border: LINE, borderRadius: 8, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <strong style={{ fontSize: 16 }}>{row.name}</strong>
              <span style={{ fontSize: 13, ...muted }}>{kindTitle(row.kind)}</span>
              {!row.active && <span style={{ fontSize: 12, color: OUT }}>на паузе</span>}
            </div>
            <span style={{ fontSize: 13, ...muted }}>{partnerLinkShown(row.slug)}</span>
            <span style={{ fontSize: 14 }}>{totalsText(row.totals, row.commissionPercent)}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={secondaryButton} onClick={() => onOpen(row.id)}>
                Отчёт и настройки
              </button>
              <CopyButton text={row.link} label="Скопировать ссылку" />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ─── One partner ─── */

export function StatementView({
  details,
  onMonth,
  onEdit,
}: {
  details: PartnerDetails;
  onMonth: (month: string) => void;
  onEdit: () => void;
}) {
  const { partner, statement, credit, report } = details;
  const [showCode, setShowCode] = useState(false);
  const whatsapp = whatsappNumberFrom(partner.phone);
  const lines: StatementLine[] = statement.lines;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>{partner.name}</h2>
          <span style={{ fontSize: 13, ...muted }}>{kindTitle(partner.kind)}</span>
          {!partner.active && <span style={{ fontSize: 13, color: OUT }}>на паузе — ссылка не даёт скидку и кредит</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14 }}>{partnerLinkShown(partner.slug)}</span>
          <CopyButton text={partner.link} label="Скопировать ссылку" />
          <button type="button" style={secondaryButton} onClick={onEdit}>
            Изменить
          </button>
        </div>
        <CardButtons slug={partner.slug} />
      </div>

      <MonthNav month={details.month} thisMonth={details.thisMonth} onMonth={onMonth} />
      <p style={{ fontSize: 15, margin: 0 }}>{totalsText(statement.totals, partner.commissionPercent)}</p>

      {lines.length === 0 ? (
        <p style={{ fontSize: 14, margin: 0, ...muted }}>В {monthTitle(details.month).toLowerCase()} клиенток от этого партнёра не было.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", ...muted }}>
              <th style={{ padding: "6px 4px", fontWeight: 500 }}>Клиентка</th>
              <th style={{ padding: "6px 4px", fontWeight: 500 }}>Что</th>
              <th style={{ padding: "6px 4px", fontWeight: 500 }}>Пришла</th>
              <th style={{ padding: "6px 4px", fontWeight: 500, textAlign: "right" }}>Оплатила в месяце</th>
              <th style={{ padding: "6px 4px", fontWeight: 500 }}>Кредит салону</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} style={{ borderTop: LINE }}>
                <td style={{ padding: "8px 4px" }}>{line.name}</td>
                <td style={{ padding: "8px 4px" }}>{line.what}</td>
                <td style={{ padding: "8px 4px" }}>{line.day ? dayTitle(line.day) : "—"}</td>
                <td style={{ padding: "8px 4px", textAlign: "right", color: line.paidInMonth < 0 ? OUT : line.paidInMonth > 0 ? IN : undefined }}>
                  {line.paidInMonth ? formatPounds(line.paidInMonth) : "—"}
                </td>
                <td style={{ padding: "8px 4px" }}>{CREDIT_WORDS[line.credit]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ fontSize: 13, margin: 0, ...muted }}>
        За всё время: {allTimeText(statement.allTime, partner.commissionPercent)}.
        {" "}Оплату записывайте кнопкой «💷 Записать оплату» в записи — тогда она попадёт сюда.
      </p>

      {credit && (
        <div style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>
            На карте салона: <strong>{formatPounds(credit.balance)}</strong>
            {credit.expiresAt ? `, до ${dayTitle(credit.expiresAt.slice(0, 10))} ${credit.expiresAt.slice(0, 4)}` : ""}.
          </span>
          {credit.code &&
            (showCode ? (
              <strong style={{ letterSpacing: 1 }}>{credit.code}</strong>
            ) : (
              <button type="button" style={secondaryButton} onClick={() => setShowCode(true)}>
                Показать код
              </button>
            ))}
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        <span style={{ fontSize: 13, ...muted }}>Отчёт для салона, по-английски — проверьте и отправьте:</span>
        <textarea readOnly value={report} rows={7} style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <CopyButton text={report} label="Скопировать отчёт" />
          {whatsapp && (
            <a
              style={{ ...secondaryButton, textDecoration: "none" }}
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(report)}`}
              target="_blank"
              rel="noreferrer"
            >
              Открыть в WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── The pane ─── */

type View = { kind: "list" } | { kind: "new" } | { kind: "partner"; id: string };

type Loaded<T> = { key: string; state: "ready"; value: T } | { key: string; state: "failed"; error: string };

export function PartnersPane() {
  const token = useDiaryToken();
  const [view, setView] = useState<View>({ kind: "list" });
  const [month, setMonth] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<Loaded<{ rows: PartnerRow[]; offer: Offer | null; month: string; thisMonth: string }> | null>(null);
  const [details, setDetails] = useState<Loaded<PartnerDetails> | null>(null);
  const [form, setForm] = useState<PartnerForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const partnerId = view.kind === "partner" ? view.id : null;
  const listKey = `list|${month ?? ""}|${attempt}`;
  const detailsKey = `partner|${partnerId ?? ""}|${month ?? ""}|${attempt}`;

  useEffect(() => {
    if (partnerId) return;
    let abandoned = false;
    const key = `list|${month ?? ""}|${attempt}`;
    void askPartners(token, { action: "list", ...(month ? { month } : {}) }).then((reply) => {
      if (abandoned) return;
      setList(
        reply.ok
          ? {
              key,
              state: "ready",
              value: { rows: rowsOf(reply), offer: offerOf(reply), month: String(reply.data.month), thisMonth: String(reply.data.thisMonth) },
            }
          : { key, state: "failed", error: errorOf(reply, "Не удалось прочитать партнёров.") }
      );
    });
    return () => {
      abandoned = true;
    };
  }, [token, month, attempt, partnerId]);

  useEffect(() => {
    if (!partnerId) return;
    let abandoned = false;
    const key = `partner|${partnerId}|${month ?? ""}|${attempt}`;
    void askPartners(token, { action: "statement", id: partnerId, ...(month ? { month } : {}) }).then((reply) => {
      if (abandoned) return;
      const value = reply.ok ? detailsOf(reply) : null;
      setDetails(
        value
          ? { key, state: "ready", value }
          : { key, state: "failed", error: errorOf(reply, "Не удалось прочитать отчёт партнёра.") }
      );
    });
    return () => {
      abandoned = true;
    };
  }, [token, partnerId, month, attempt]);

  async function save() {
    if (!form) return;
    setBusy(true);
    setFormError(null);
    const reply = await askPartners(
      token,
      form.id ? { action: "update", id: form.id, partner: partnerPayload(form) } : { action: "create", partner: partnerPayload(form) }
    );
    setBusy(false);
    if (!reply.ok) {
      setFormError(errorOf(reply, "Не удалось сохранить."));
      return;
    }
    const saved = reply.data.partner as { id?: string; name?: string } | null;
    setNotice(form.id ? "✓ Сохранено." : `✓ Партнёр «${saved?.name ?? form.name}» создан. Ссылка и карточки — ниже.`);
    setForm(null);
    setAttempt((n) => n + 1);
    setView(saved?.id ? { kind: "partner", id: saved.id } : { kind: "list" });
  }

  const openPartner = (id: string) => {
    setNotice(null);
    setForm(null);
    setView({ kind: "partner", id });
  };
  const back = () => {
    setNotice(null);
    setForm(null);
    setView({ kind: "list" });
  };

  const listLoading = !list || list.key !== listKey;
  const detailsLoading = !details || details.key !== detailsKey;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "24px 24px 64px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {view.kind !== "list" && (
              <button type="button" style={secondaryButton} onClick={back}>
                ← Все партнёры
              </button>
            )}
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Партнёры</h1>
          </div>
          <p style={{ fontSize: 14, margin: 0, ...muted, lineHeight: 1.5 }}>
            Салоны и магазины, которые советуют вас клиенткам. Кредит салону начисляется сам, когда работа «Выполнена»;
            скидку клиентке в ателье вы вычитаете при оплате (в магазине на сайте она вычитается сама). Клиентку из
            WhatsApp припишите салону кнопкой «🤝 Кто прислал» в её записи.
          </p>
        </div>

        {notice && <p style={{ fontSize: 14, margin: 0, color: IN }}>{notice}</p>}

        {view.kind === "new" || form ? (
          <PartnerFormView
            form={form ?? blankPartnerForm()}
            busy={busy}
            error={formError}
            onChange={setForm}
            onSave={save}
            onCancel={() => {
              setForm(null);
              setFormError(null);
              if (view.kind === "new") setView({ kind: "list" });
            }}
          />
        ) : null}

        {view.kind === "list" &&
          (listLoading ? (
            <p aria-busy="true" style={{ fontSize: 14, margin: 0, ...muted }}>
              Загружаем партнёров…
            </p>
          ) : list.state === "failed" ? (
            <p role="alert" style={{ fontSize: 14, margin: 0 }}>
              <span style={{ color: OUT }}>{list.error}</span>{" "}
              <button type="button" style={secondaryButton} onClick={() => setAttempt((n) => n + 1)}>
                Попробовать снова
              </button>
            </p>
          ) : (
            <PartnerListView
              rows={list.value.rows}
              offer={list.value.offer}
              month={list.value.month}
              thisMonth={list.value.thisMonth}
              onMonth={setMonth}
              onOpen={openPartner}
              onNew={() => {
                setNotice(null);
                setFormError(null);
                setForm(blankPartnerForm());
                setView({ kind: "new" });
              }}
            />
          ))}

        {view.kind === "partner" &&
          !form &&
          (detailsLoading ? (
            <p aria-busy="true" style={{ fontSize: 14, margin: 0, ...muted }}>
              Загружаем отчёт…
            </p>
          ) : details.state === "failed" ? (
            <p role="alert" style={{ fontSize: 14, margin: 0 }}>
              <span style={{ color: OUT }}>{details.error}</span>{" "}
              <button type="button" style={secondaryButton} onClick={() => setAttempt((n) => n + 1)}>
                Попробовать снова
              </button>
            </p>
          ) : (
            <StatementView
              details={details.value}
              onMonth={setMonth}
              onEdit={() => {
                setNotice(null);
                setFormError(null);
                setForm(formFromDetails(details.value));
              }}
            />
          ))}
      </div>
    </div>
  );
}
