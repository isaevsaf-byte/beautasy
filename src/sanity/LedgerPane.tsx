import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  MANUAL_METHODS,
  PAYMENT_METHODS,
  amountProblem,
  PERIOD_KEYS,
  categoriesFor,
  dayTitle,
  formatPounds,
  ledgerCsv,
  manualCategoriesFor,
  parsePounds,
  periodOf,
  summarise,
  titleOf,
  todayInSouthampton,
  type CsvStyle,
  type LedgerEntry,
  type LedgerKind,
  type LedgerSummary,
  type PeriodKey,
} from "@/lib/ledger";
import { count, plural } from "@/lib/studioStats";
import { useDiaryToken } from "./diaryClient";
import { askLedger, entriesOf, errorOf } from "./ledgerClient";
import { primaryButton, secondaryButton } from "./SlotPicker";

/**
 * «Касса» — everything that came in and went out, and when.
 *
 * Kristina types what she was paid at the atelier, in cash, by card or by
 * transfer, and what she spent: fabric, printing, a partner's commission.
 * Orders from the site and gift cards bought on it arrive by themselves. At
 * the end of a tax year one button gives the whole year as a spreadsheet,
 * which is what Self Assessment or an accountant asks for.
 *
 * 🚨 This is browser code. It never opens an entry itself — it asks
 * /api/studio/ledger, which holds the key — and it must never import
 * @/lib/secrets or @/lib/ledgerStore (see studioStats.test.ts, which walks
 * the imports out of sanity.config.ts and fails on that reach).
 *
 * Styling is inline for the reason dashboardTool.tsx gives: @sanity/ui is not
 * a dependency of this project. Colours lean on currentColor and translucency
 * so the page reads in the Studio's light theme and its dark one.
 */

const IN = "#2f8a57";
const OUT = "#c0392b";
const LINE = "1px solid rgba(128,128,128,0.25)";

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
const muted: CSSProperties = { opacity: 0.7 };

/* ─── The form ─── */

/**
 * What the typed amount will be saved as, said under the field as she types:
 * "15 50" or "2,500" read as something she did not mean would otherwise go
 * into the books unnoticed. The server reads it again; this only shows it.
 */
export function amountPreview(typed: string): { text: string; ok: boolean } | null {
  if (!typed.trim()) return null;
  const pence = parsePounds(typed);
  if (pence !== null) return { text: `= ${formatPounds(pence)}`, ok: true };
  const problem = amountProblem(typed);
  return {
    text:
      problem?.kind === "cap"
        ? `${formatPounds(problem.pence)} — слишком большая сумма для одной строки, проверьте нули.`
        : "Не похоже на сумму. Например: 15.50 или 15,50.",
    ok: false,
  };
}

export interface EntryForm {
  /** Set when correcting an entry already in the ledger */
  id?: string;
  kind: LedgerKind;
  amount: string;
  date: string;
  method: string;
  category: string;
  who: string;
  note: string;
}

export function blankForm(kind: LedgerKind, today: string): EntryForm {
  return {
    kind,
    amount: "",
    date: today,
    method: kind === "income" ? "cash" : "card",
    category: kind === "income" ? "atelier" : "materials",
    who: "",
    note: "",
  };
}

export function formFor(entry: LedgerEntry): EntryForm {
  return {
    id: entry.id,
    kind: entry.kind,
    amount: (entry.amount / 100).toFixed(2),
    date: entry.date,
    method: entry.method,
    category: entry.category,
    who: entry.who ?? "",
    note: entry.note ?? "",
  };
}

/** What the server is sent: the amount exactly as typed, read there. */
export function entryPayload(form: EntryForm): Record<string, string> {
  return {
    kind: form.kind,
    amount: form.amount,
    date: form.date,
    method: form.method,
    category: form.category,
    who: form.who,
    note: form.note,
  };
}

export function EntryFormView({
  form,
  today,
  busy,
  error,
  onChange,
  onSave,
  onCancel,
}: {
  form: EntryForm;
  today: string;
  busy: boolean;
  error: string | null;
  onChange: (form: EntryForm) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const income = form.kind === "income";
  // Payments on the site record themselves, so they are not offered here
  const methods = income ? MANUAL_METHODS : MANUAL_METHODS.filter((m) => m.value !== "giftcard");
  const set = (patch: Partial<EntryForm>) => onChange({ ...form, ...patch });
  const preview = amountPreview(form.amount);
  const pence = parsePounds(form.amount);
  return (
    <section
      style={{ border: LINE, borderLeft: `3px solid ${income ? IN : OUT}`, borderRadius: 8, padding: 16, display: "grid", gap: 12 }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
        {form.id ? "Исправить строку" : income ? "Пришло" : "Ушло"}
      </h2>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <label style={labelStyle}>
          Сумма, £
          <input
            id="kassa-amount"
            inputMode="decimal"
            placeholder="15.50"
            style={{ ...inputStyle, fontSize: 18, fontWeight: 600 }}
            value={form.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
          {preview && (
            <span aria-live="polite" style={{ fontSize: 13, color: preview.ok ? undefined : OUT, fontVariantNumeric: "tabular-nums" }}>
              {preview.text}
            </span>
          )}
        </label>
        <label style={labelStyle}>
          Когда
          <input
            id="kassa-date"
            type="date"
            max={today}
            style={inputStyle}
            value={form.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        </label>
        <label style={labelStyle}>
          {income ? "Как заплатили" : "Как платила"}
          <select id="kassa-method" style={inputStyle} value={form.method} onChange={(e) => set({ method: e.target.value })}>
            {methods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.title}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          {income ? "За что" : "На что"}
          <select
            id="kassa-category"
            style={inputStyle}
            value={form.category}
            onChange={(e) => set({ category: e.target.value })}
          >
            {manualCategoriesFor(form.kind).map((c) => (
              <option key={c.value} value={c.value}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {income && form.method === "giftcard" && (
        <p style={{ fontSize: 13, margin: 0, ...muted }}>
          Работа оплачена подарочной картой: деньги за неё уже пришли, когда карту купили, поэтому в «Пришло» эта
          строка не войдёт. Её видно отдельно.
        </p>
      )}
      <label style={labelStyle}>
        {income ? "Кто заплатил (по желанию)" : "Кому (по желанию)"}
        <input id="kassa-who" style={inputStyle} value={form.who} onChange={(e) => set({ who: e.target.value })} />
      </label>
      <label style={labelStyle}>
        Заметка (по желанию)
        <input
          id="kassa-note"
          style={inputStyle}
          placeholder={income ? "например: шторы, 3 полотна" : "например: молнии и нитки, Fabric Land"}
          value={form.note}
          onChange={(e) => set({ note: e.target.value })}
        />
      </label>
      {error && (
        <p role="alert" style={{ fontSize: 14, margin: 0, color: OUT }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={primaryButton(!busy && pence !== null)} disabled={busy || pence === null} onClick={onSave}>
          {busy
            ? "Записываем…"
            : pence === null
            ? "Напишите сумму"
            : `${form.id ? "Сохранить" : "Записать"} ${income ? "+" : "−"}${formatPounds(pence)}`}
        </button>
        <button type="button" style={secondaryButton} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </section>
  );
}

/* ─── The totals ─── */

function Figure({ label, amount, colour, sign }: { label: string; amount: number; colour?: string; sign?: string }) {
  return (
    <div style={{ border: LINE, borderRadius: 8, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", ...muted }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: colour, fontVariantNumeric: "tabular-nums" }}>
        {sign}
        {formatPounds(amount)}
      </div>
    </div>
  );
}

function TotalsList({ title, rows }: { title: string; rows: { key: string; title: string; amount: number }[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ minWidth: 0 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>{title}</h3>
      <div style={{ display: "grid", gap: 4 }}>
        {rows.map((row) => (
          <div key={row.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
            <span>{row.title}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatPounds(row.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SummaryView({ summary, byMonth }: { summary: LedgerSummary; byMonth: boolean }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Figure label="Пришло" amount={summary.income} colour={IN} />
        <Figure label="Ушло" amount={summary.expense} colour={OUT} />
        <Figure label="Осталось" amount={summary.net} />
      </div>
      {summary.paidByGiftCard > 0 && (
        <p style={{ fontSize: 13, margin: 0, ...muted }}>
          Ещё {formatPounds(summary.paidByGiftCard)} оплачено подарочными картами. Эти деньги пришли раньше, когда карты
          купили, поэтому в «Пришло» они не входят.
        </p>
      )}
      {byMonth && summary.byMonth.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, minWidth: 360 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: LINE }}>Месяц</th>
                <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: LINE }}>Пришло</th>
                <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: LINE }}>Ушло</th>
                <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: LINE }}>Осталось</th>
              </tr>
            </thead>
            <tbody>
              {summary.byMonth.map((row) => (
                <tr key={row.month}>
                  <td style={{ padding: "6px 8px", borderBottom: LINE }}>{row.title}</td>
                  <td style={{ padding: "6px 8px", borderBottom: LINE, textAlign: "right", color: IN, fontVariantNumeric: "tabular-nums" }}>
                    {formatPounds(row.income)}
                  </td>
                  <td style={{ padding: "6px 8px", borderBottom: LINE, textAlign: "right", color: OUT, fontVariantNumeric: "tabular-nums" }}>
                    {formatPounds(row.expense)}
                  </td>
                  <td style={{ padding: "6px 8px", borderBottom: LINE, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatPounds(row.income - row.expense)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <TotalsList title="За что пришло" rows={summary.incomeByCategory} />
        <TotalsList title="Как заплатили" rows={summary.incomeByMethod} />
        <TotalsList title="На что ушло" rows={summary.expenseByCategory} />
      </div>
    </div>
  );
}

/* ─── The lines ─── */

const AUTOMATIC: Record<string, string> = {
  order: "заказ на сайте, записался сам",
  giftcard: "подарочная карта с сайта, записалась сама",
};

export function EntriesView({
  entries,
  confirming,
  deleting = false,
  onEdit,
  onAskDelete,
  onDelete,
  onKeep,
}: {
  entries: LedgerEntry[];
  confirming: string | null;
  deleting?: boolean;
  onEdit: (entry: LedgerEntry) => void;
  onAskDelete: (id: string) => void;
  onDelete: (id: string) => void;
  onKeep: () => void;
}) {
  if (entries.length === 0) {
    return (
      <p style={{ fontSize: 14, margin: 0, ...muted }}>
        За этот срок пока ничего нет. Когда клиент заплатит, нажмите «+ Пришло» — или «Записать оплату» прямо в его записи
        в ателье.
      </p>
    );
  }
  return (
    <div style={{ display: "grid" }}>
      {entries.map((entry) => {
        const income = entry.kind === "income";
        const giftCard = income && entry.method === "giftcard";
        const automatic = AUTOMATIC[entry.source];
        const details = [
          titleOf(PAYMENT_METHODS, entry.method),
          entry.who,
          entry.note,
          automatic,
          entry.source === "booking" ? "из записи в ателье" : undefined,
        ].filter(Boolean);
        return (
          <div
            key={`${entry.source}-${entry.id}`}
            style={{ display: "grid", gridTemplateColumns: "64px minmax(0,1fr) auto", gap: 12, padding: "10px 0", borderBottom: LINE, alignItems: "start" }}
          >
            <span style={{ fontSize: 13, ...muted }}>{dayTitle(entry.date)}</span>
            <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
              <span style={{ fontSize: 14 }}>{titleOf(categoriesFor(entry.kind), entry.category)}</span>
              <span style={{ fontSize: 12, ...muted, overflowWrap: "anywhere" }}>{details.join(" · ")}</span>
              {!automatic && (
                <span style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  {confirming === entry.id ? (
                    <>
                      <span style={{ fontSize: 12 }}>Удалить эту строку?</span>
                      <button
                        type="button"
                        disabled={deleting}
                        style={{ ...secondaryButton, padding: "2px 8px", fontSize: 12, color: OUT, opacity: deleting ? 0.5 : 1 }}
                        onClick={() => onDelete(entry.id)}
                      >
                        {deleting ? "Удаляем…" : "Да, удалить"}
                      </button>
                      <button type="button" style={{ ...secondaryButton, padding: "2px 8px", fontSize: 12 }} onClick={onKeep}>
                        Нет
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" style={{ ...secondaryButton, padding: "2px 8px", fontSize: 12 }} onClick={() => onEdit(entry)}>
                        Исправить
                      </button>
                      <button type="button" style={{ ...secondaryButton, padding: "2px 8px", fontSize: 12 }} onClick={() => onAskDelete(entry.id)}>
                        Удалить
                      </button>
                    </>
                  )}
                </span>
              )}
            </div>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                color: giftCard ? undefined : income ? IN : OUT,
                opacity: giftCard ? 0.6 : 1,
              }}
            >
              {income ? "+" : "−"}
              {formatPounds(entry.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── The pane ─── */

const disabledLook: CSSProperties = { opacity: 0.45, cursor: "not-allowed" };

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Loaded {
  /** Which request this answers: the period and the attempt. Loading is a mismatch. */
  key: string;
  state: "ready" | "failed";
  entries: LedgerEntry[];
  unreadable: number;
  error?: string;
}

export function LedgerPane() {
  const token = useDiaryToken();
  const today = todayInSouthampton();
  const [periodKey, setPeriodKey] = useState<PeriodKey>("month");
  const period = periodOf(periodKey, today);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ key: "", state: "ready", entries: [], unreadable: 0 });
  const [form, setForm] = useState<EntryForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const requestKey = `${period.from}|${period.to}|${attempt}`;
  useEffect(() => {
    let abandoned = false;
    const key = `${period.from}|${period.to}|${attempt}`;
    void askLedger(token, { action: "list", from: period.from, to: period.to }).then((reply) => {
      if (abandoned) return;
      setLoaded(
        reply.ok
          ? { key, state: "ready", entries: entriesOf(reply), unreadable: Number(reply.data.unreadable) || 0 }
          : { key, state: "failed", entries: [], unreadable: 0, error: errorOf(reply, "Не удалось прочитать кассу.") }
      );
    });
    return () => {
      abandoned = true;
    };
  }, [token, period.from, period.to, attempt]);
  const loading = loaded.key !== requestKey;

  const summary = useMemo(() => summarise(loaded.entries), [loaded.entries]);

  function open(kind: LedgerKind) {
    setForm(blankForm(kind, today));
    setFormError(null);
    setNotice(null);
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setFormError(null);
    const reply = await askLedger(
      token,
      form.id ? { action: "update", id: form.id, entry: entryPayload(form) } : { action: "add", entry: entryPayload(form) }
    );
    setBusy(false);
    if (!reply.ok) {
      setFormError(errorOf(reply, "Не удалось записать."));
      return;
    }
    const saved = reply.data.entry as LedgerEntry | undefined;
    setNotice({
      text: saved
        ? `✓ Записано: ${saved.kind === "income" ? "+" : "−"}${formatPounds(saved.amount)} · ${titleOf(categoriesFor(saved.kind), saved.category)}, ${dayTitle(saved.date)}`
        : "✓ Записано.",
    });
    setForm(null);
    setAttempt((n) => n + 1);
  }

  async function remove(id: string) {
    if (deleting) return;
    setDeleting(true);
    const reply = await askLedger(token, { action: "remove", id });
    setDeleting(false);
    setConfirming(null);
    if (!reply.ok) {
      setNotice({ text: errorOf(reply, "Не удалось удалить."), bad: true });
      return;
    }
    setNotice({ text: "Строка удалена." });
    setAttempt((n) => n + 1);
  }

  const ready = !loading && loaded.state === "ready";
  const exportCsv = (style: CsvStyle) =>
    download(ledgerCsv(loaded.entries, style), `beautasy-kassa-${period.from}-${period.to}-${style}.csv`);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "24px 24px 64px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Касса</h1>
          <p style={{ fontSize: 14, margin: 0, ...muted, lineHeight: 1.5 }}>
            Всё, что пришло и ушло. Заказы с сайта и подарочные карты записываются сами. Оплату в ателье можно записать
            здесь или кнопкой «Записать оплату» в самой записи.
          </p>
        </div>

        <div role="tablist" aria-label="За какой срок" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PERIOD_KEYS.map((key) => {
            const active = key === periodKey;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                style={{
                  ...secondaryButton,
                  fontWeight: active ? 700 : 400,
                  borderColor: active ? "currentColor" : undefined,
                }}
                onClick={() => setPeriodKey(key)}
              >
                {periodOf(key, today).title}
              </button>
            );
          })}
        </div>

        {loading ? (
          <p aria-busy="true" style={{ fontSize: 14, margin: 0, ...muted }}>
            Загружаем кассу за {period.title.toLowerCase()}…
          </p>
        ) : loaded.state === "failed" ? (
          <p role="alert" style={{ fontSize: 14, margin: 0 }}>
            <span style={{ color: OUT }}>{loaded.error}</span>{" "}
            <button type="button" style={secondaryButton} onClick={() => setAttempt((n) => n + 1)}>
              Попробовать снова
            </button>
          </p>
        ) : (
          <SummaryView summary={summary} byMonth={periodKey === "taxYear" || periodKey === "lastTaxYear"} />
        )}

        {ready && loaded.unreadable > 0 && (
          <p role="alert" style={{ fontSize: 13, margin: 0, color: OUT }}>
            {count(loaded.unreadable, "строка", "строки", "строк")} кассы{" "}
            {plural(loaded.unreadable, "не читается", "не читаются", "не читаются")} — похоже, на сайте сменился ключ.
            Итоги выше — {plural(loaded.unreadable, "без неё", "без них", "без них")}. Сообщите Сафару.
          </p>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={primaryButton(true)} onClick={() => open("income")}>
            + Пришло
          </button>
          <button type="button" style={secondaryButton} onClick={() => open("expense")}>
            − Ушло
          </button>
          <button
            type="button"
            style={{ ...secondaryButton, ...(ready && loaded.entries.length > 0 ? {} : disabledLook) }}
            disabled={!ready || loaded.entries.length === 0}
            onClick={() => exportCsv("uk")}
          >
            Скачать таблицу
          </button>
          <button
            type="button"
            style={{ ...secondaryButton, ...(ready && loaded.entries.length > 0 ? {} : disabledLook) }}
            disabled={!ready || loaded.entries.length === 0}
            onClick={() => exportCsv("ru")}
          >
            …для Excel на русском
          </button>
        </div>

        {notice && (
          <p role={notice.bad ? "alert" : "status"} style={{ fontSize: 14, margin: 0, color: notice.bad ? OUT : undefined }}>
            {notice.text}
          </p>
        )}

        {form && (
          <EntryFormView
            form={form}
            today={today}
            busy={busy}
            error={formError}
            onChange={setForm}
            onSave={save}
            onCancel={() => setForm(null)}
          />
        )}

        {ready && (
          <section style={{ display: "grid", gap: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
              {period.title}: {count(loaded.entries.length, "строка", "строки", "строк")}
            </h2>
            <EntriesView
              entries={loaded.entries}
              confirming={confirming}
              deleting={deleting}
              onEdit={(entry) => {
                setForm(formFor(entry));
                setFormError(null);
                setNotice(null);
              }}
              onAskDelete={setConfirming}
              onDelete={remove}
              onKeep={() => setConfirming(null)}
            />
          </section>
        )}
      </div>
    </div>
  );
}
