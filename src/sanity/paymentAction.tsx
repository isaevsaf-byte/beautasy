import { useEffect, useState } from "react";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";
import {
  MANUAL_INCOME_CATEGORIES,
  MANUAL_METHODS,
  PAYMENT_METHODS,
  categoryForService,
  dayTitle,
  formatPounds,
  parsePounds,
  titleOf,
  todayInSouthampton,
  type LedgerEntry,
} from "@/lib/ledger";
import { useDiaryToken } from "./diaryClient";
import { askLedger, entriesOf, errorOf } from "./ledgerClient";
import { amountPreview } from "./LedgerPane";
import { primaryButton, secondaryButton } from "./SlotPicker";

/**
 * "💷 Записать оплату" (Record a payment) — on a booking, where Kristina is
 * when the customer pays. It writes the payment into «Касса» against this
 * booking, so the money and the fitting it was for are one click apart, and
 * a partner's commission can later be worked out from what was actually paid.
 *
 * It shows what has already been recorded for the booking first, and will
 * not save until it knows — a second click must not quietly count the same
 * £45 twice, and a check that failed must not look like "nothing yet".
 *
 * The booking itself is not touched: the payment lives in the ledger, sealed
 * there (see @/lib/ledgerStore), tied to the booking by a key that names no
 * booking.
 */

interface BookingDoc {
  displayName?: string;
  service?: string;
  referralDiscount?: number;
  referredBy?: string;
}

const inputStyle = {
  font: "inherit",
  fontSize: 14,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid rgba(128,128,128,0.4)",
  background: "transparent",
  color: "inherit",
  width: "100%",
  boxSizing: "border-box" as const,
};

const labelStyle = { display: "grid", gap: 4, fontSize: 13 } as const;
const OUT = "#c0392b";

/** "checking" until the ledger has answered; "failed" when it could not. */
export type AlreadyPaid = { state: "checking" } | { state: "failed"; message: string } | { state: "ready"; entries: LedgerEntry[] };

export interface PaymentForm {
  amount: string;
  method: string;
  category: string;
  date: string;
  note: string;
}

export function PaymentFormView({
  doc,
  paid,
  form,
  today,
  busy,
  error,
  onChange,
  onSave,
  onCancel,
}: {
  doc: BookingDoc;
  paid: AlreadyPaid;
  form: PaymentForm;
  today: string;
  busy: boolean;
  error: string | null;
  onChange: (form: PaymentForm) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<PaymentForm>) => onChange({ ...form, ...patch });
  const pence = parsePounds(form.amount);
  const preview = amountPreview(form.amount);
  const canSave = !busy && pence !== null && paid.state !== "checking";
  return (
    <div style={{ display: "grid", gap: 12, padding: 4 }}>
      {paid.state === "checking" && <p style={{ fontSize: 13, margin: 0, opacity: 0.7 }}>Смотрим, что уже в кассе…</p>}
      {paid.state === "failed" && (
        <p role="alert" style={{ fontSize: 13, margin: 0, color: OUT }}>
          Не удалось проверить, записана ли уже оплата по этой записи ({paid.message}). Загляните в «Кассу», прежде чем
          записывать.
        </p>
      )}
      {paid.state === "ready" && paid.entries.length > 0 && (
        <div style={{ fontSize: 13, display: "grid", gap: 2 }}>
          <strong>Уже в кассе:</strong>
          {paid.entries.map((entry) => (
            <span key={entry.id}>
              +{formatPounds(entry.amount)} · {titleOf(PAYMENT_METHODS, entry.method).toLowerCase()} · {dayTitle(entry.date)}
            </span>
          ))}
          <span style={{ opacity: 0.7 }}>Добавляйте новую оплату, только если клиент доплатил.</span>
        </div>
      )}
      {typeof doc.referralDiscount === "number" && doc.referralDiscount > 0 && (
        <p style={{ fontSize: 13, margin: 0 }}>
          У клиента скидка за друга {formatPounds(doc.referralDiscount)}
          {doc.referredBy ? ` от ${doc.referredBy}` : ""} — вычтите её из цены и запишите то, что заплатили.
        </p>
      )}
      <label style={labelStyle}>
        Сколько заплатили, £
        <input
          id="payment-amount"
          inputMode="decimal"
          placeholder="15.50"
          style={{ ...inputStyle, fontSize: 18, fontWeight: 600 }}
          value={form.amount}
          onChange={(e) => set({ amount: e.target.value })}
        />
        {preview && (
          <span aria-live="polite" style={{ fontSize: 13, color: preview.ok ? undefined : OUT }}>
            {preview.text}
          </span>
        )}
      </label>
      <label style={labelStyle}>
        Как
        <select id="payment-method" style={inputStyle} value={form.method} onChange={(e) => set({ method: e.target.value })}>
          {MANUAL_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.title}
            </option>
          ))}
        </select>
      </label>
      {form.method === "giftcard" && (
        <p style={{ fontSize: 13, margin: 0, opacity: 0.75 }}>
          Деньги за карту уже пришли, когда её купили, поэтому в «Пришло» эта оплата не войдёт. Не забудьте уменьшить
          «Остаток» карты в разделе «Магазин» → «Подарочные карты».
        </p>
      )}
      <label style={labelStyle}>
        За что
        <select id="payment-category" style={inputStyle} value={form.category} onChange={(e) => set({ category: e.target.value })}>
          {MANUAL_INCOME_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Когда
        <input id="payment-date" type="date" max={today} style={inputStyle} value={form.date} onChange={(e) => set({ date: e.target.value })} />
      </label>
      <label style={labelStyle}>
        Заметка (по желанию)
        <input id="payment-note" style={inputStyle} value={form.note} onChange={(e) => set({ note: e.target.value })} />
      </label>
      {error && (
        <p role="alert" style={{ fontSize: 14, margin: 0, color: OUT }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={primaryButton(canSave)} disabled={!canSave} onClick={onSave}>
          {busy ? "Записываем…" : pence === null ? "Напишите сумму" : `Записать в кассу +${formatPounds(pence)}`}
        </button>
        <button type="button" style={secondaryButton} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}

function PaymentDialog({ id, doc, onClose }: { id: string; doc: BookingDoc; onClose: () => void }) {
  const token = useDiaryToken();
  const today = todayInSouthampton();
  const [paid, setPaid] = useState<AlreadyPaid>({ state: "checking" });
  const [form, setForm] = useState<PaymentForm>({
    amount: "",
    method: "cash",
    category: categoryForService(doc.service),
    date: today,
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<LedgerEntry | null>(null);

  useEffect(() => {
    let abandoned = false;
    void askLedger(token, { action: "forBooking", bookingId: id }).then((reply) => {
      if (abandoned) return;
      setPaid(
        reply.ok
          ? { state: "ready", entries: entriesOf(reply) }
          : { state: "failed", message: errorOf(reply, "касса не ответила") }
      );
    });
    return () => {
      abandoned = true;
    };
  }, [token, id]);

  async function save() {
    setBusy(true);
    setError(null);
    const reply = await askLedger(token, {
      action: "add",
      entry: { kind: "income", ...form, who: doc.displayName ?? "", bookingId: id },
    });
    setBusy(false);
    if (!reply.ok) {
      setError(errorOf(reply, "Не удалось записать."));
      return;
    }
    setSaved((reply.data.entry as LedgerEntry | undefined) ?? null);
  }

  if (saved) {
    return (
      <div style={{ display: "grid", gap: 12, padding: 4 }}>
        <p style={{ fontSize: 15, margin: 0 }}>
          ✓ Записано в кассу: <strong>+{formatPounds(saved.amount)}</strong>, {titleOf(PAYMENT_METHODS, saved.method).toLowerCase()},{" "}
          {dayTitle(saved.date)}.
        </p>
        <p style={{ fontSize: 13, margin: 0, opacity: 0.7 }}>Видно в разделе «Касса».</p>
        <div>
          <button type="button" style={primaryButton(true)} onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    );
  }

  return (
    <PaymentFormView
      doc={doc}
      paid={paid}
      form={form}
      today={today}
      busy={busy}
      error={error}
      onChange={setForm}
      onSave={save}
      onCancel={onClose}
    />
  );
}

export const recordPaymentAction: DocumentActionComponent = (props: DocumentActionProps) => {
  // Document actions are components rendered by Sanity; the lower-case name is
  // Sanity's convention, which is why the rule needs telling — see revealAction.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [open, setOpen] = useState(false);
  const doc = (props.published ?? props.draft) as BookingDoc | null;
  if (!doc) return null;
  const close = () => {
    setOpen(false);
    props.onComplete();
  };
  return {
    label: "💷 Записать оплату",
    title: "Записывает в «Кассу», сколько и как заплатил клиент за эту запись.",
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: "dialog",
          header: `Оплата${doc.displayName ? ` — ${doc.displayName}` : ""}`,
          onClose: close,
          content: <PaymentDialog id={props.id.replace(/^drafts\./, "")} doc={doc} onClose={close} />,
        }
      : undefined,
  };
};
