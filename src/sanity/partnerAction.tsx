import { useEffect, useState } from "react";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";
import { pounds } from "@/lib/friendsLink";
import { useDiaryToken } from "./diaryClient";
import {
  askPartners,
  attributionFrom,
  errorOf,
  offerOf,
  optionsOf,
  type Attribution,
  type Offer,
  type PartnerOption,
} from "./partnersClient";
import { primaryButton, secondaryButton } from "./SlotPicker";

/**
 * "🤝 Кто прислал" (Who sent them) — on a booking, for the client who wrote
 * on WhatsApp "Emma at the salon sent me" instead of scanning the salon's QR.
 *
 * Picking a partner puts the booking down to it exactly as the link would
 * have: the client's £5 off is noted for when she pays, and the partner's
 * credit comes when the work is marked done. The rules — first visit only,
 * a friend's link stays the friend's, nothing changes once the reward is
 * decided — are the server's (see attributeBooking in @/lib/partnerStore);
 * this only shows what it says.
 */

interface BookingDoc {
  displayName?: string;
}

export type AttributionLoad =
  | { state: "checking" }
  | { state: "failed"; message: string }
  | { state: "ready"; attribution: Attribution; options: PartnerOption[]; offer: Offer | null };

export function AttributionFormView({
  load,
  choice,
  busy,
  error,
  onChoice,
  onSave,
  onClose,
}: {
  load: AttributionLoad;
  choice: string;
  busy: boolean;
  error: string | null;
  onChoice: (id: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const close = (
    <div>
      <button type="button" style={secondaryButton} onClick={onClose}>
        Закрыть
      </button>
    </div>
  );

  if (load.state === "checking") {
    return (
      <p aria-busy="true" style={{ fontSize: 14, margin: 0 }}>
        Проверяем запись…
      </p>
    );
  }
  if (load.state === "failed") {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <p role="alert" style={{ fontSize: 14, margin: 0, color: "#c0392b" }}>
          {load.message}
        </p>
        {close}
      </div>
    );
  }

  const { attribution, options, offer } = load;
  if (attribution.friendLink) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Клиентка пришла по ссылке друга{attribution.referredBy ? ` (${attribution.referredBy})` : ""} — бонус за неё ждёт этого
          друга, поэтому приписать её салону нельзя.
        </p>
        {close}
      </div>
    );
  }
  if (attribution.decided) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Бонус за эту запись уже решён{attribution.referredBy ? ` (прислал: ${attribution.referredBy})` : ""} — поменять, кто
          прислал клиентку, уже нельзя.
        </p>
        {close}
      </div>
    );
  }
  if (options.length === 0) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Партнёров пока нет. Добавьте салон в разделе «Друзья и партнёры» → «Партнёры», потом вернитесь сюда.
        </p>
        {close}
      </div>
    );
  }

  const unchanged = choice === (attribution.partnerId ?? "");
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        Кто прислал клиентку
        <select
          style={{
            font: "inherit",
            fontSize: 14,
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid rgba(128,128,128,0.4)",
            background: "transparent",
            color: "inherit",
          }}
          value={choice}
          onChange={(e) => onChoice(e.target.value)}
        >
          <option value="">— никто, клиентка пришла сама —</option>
          {options.map((option) => (
            <option key={option.id} value={option.id} disabled={!option.active}>
              {option.name}
              {option.active ? "" : " (на паузе)"}
            </option>
          ))}
        </select>
      </label>
      {offer && !offer.enabled ? (
        <p style={{ fontSize: 13, margin: 0, color: "#c0392b", lineHeight: 1.5 }}>
          Программа «Beautasy Friends» выключена в «Настройках сайта» — сейчас клиентку салону не засчитать.
        </p>
      ) : (
        <p style={{ fontSize: 13, margin: 0, opacity: 0.75, lineHeight: 1.5 }}>
          Засчитывается только новая клиентка
          {offer ? (
            <>
              : ей — скидка {pounds(offer.discount)} на подгонку (вычтите при оплате), салону — {pounds(offer.credit)}{" "}
              кредита, когда отметите запись «Выполнена».
            </>
          ) : (
            "."
          )}
        </p>
      )}
      {error && (
        <p role="alert" style={{ fontSize: 14, margin: 0, color: "#c0392b" }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={primaryButton(!busy && !unchanged)} disabled={busy || unchanged} onClick={onSave}>
          {busy ? "Сохраняем…" : "Сохранить"}
        </button>
        <button type="button" style={secondaryButton} onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  );
}

function AttributionDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const token = useDiaryToken();
  const [load, setLoad] = useState<AttributionLoad>({ state: "checking" });
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let abandoned = false;
    void Promise.all([
      askPartners(token, { action: "forBooking", bookingId: id }),
      askPartners(token, { action: "options" }),
    ]).then(([current, options]) => {
      if (abandoned) return;
      const attribution = current.ok ? attributionFrom(current) : null;
      if (!attribution || !options.ok) {
        setLoad({ state: "failed", message: errorOf(current.ok ? options : current, "Не удалось проверить запись.") });
        return;
      }
      setLoad({ state: "ready", attribution, options: optionsOf(options), offer: offerOf(options) });
      setChoice(attribution.partnerId ?? "");
    });
    return () => {
      abandoned = true;
    };
  }, [token, id]);

  async function save() {
    setBusy(true);
    setError(null);
    const reply = await askPartners(token, { action: "attribute", bookingId: id, partnerId: choice || null });
    setBusy(false);
    if (!reply.ok) {
      setError(errorOf(reply, "Не удалось сохранить."));
      return;
    }
    setDone(String(reply.data.message ?? "Готово."));
  }

  if (done) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>{done}</p>
        <div>
          <button type="button" style={primaryButton(true)} onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    );
  }

  return (
    <AttributionFormView
      load={load}
      choice={choice}
      busy={busy}
      error={error}
      onChoice={setChoice}
      onSave={save}
      onClose={onClose}
    />
  );
}

export const partnerAttributionAction: DocumentActionComponent = (props: DocumentActionProps) => {
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
    label: "🤝 Кто прислал",
    // The server writes the published booking; a draft published afterwards would undo it
    disabled: Boolean(props.draft),
    title: props.draft
      ? "Сначала опубликуйте изменения, потом выберите, кто прислал клиентку."
      : "Приписывает клиентку салону-партнёру — например, если она написала в WhatsApp, что её прислал салон.",
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: "dialog",
          header: `Кто прислал${doc.displayName ? ` — ${doc.displayName}` : ""}`,
          onClose: close,
          content: <AttributionDialog id={props.id.replace(/^drafts\./, "")} onClose={close} />,
        }
      : undefined,
  };
};
