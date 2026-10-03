import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";
import { useRouter } from "sanity/router";
import { canMove, heldBy, releasesItsTime } from "@/lib/diary";
import { COLLECTION_TRIP_MINUTES, DEFAULT_TRIP_MINUTES } from "@/lib/collection";
import { OUTSIDE_MAX, outsideWords } from "@/lib/collectionTime";
import { instantOf, spanEnd, spansOffered, type SlotDay } from "@/lib/slots";
import { askDiary, useDiaryToken, useFreeTimes } from "./diaryClient";
import {
  SlotPicker,
  chipStyle,
  primaryButton,
  secondaryButton,
  slotInRussian,
  spanInRussian,
  tripInRussian,
} from "./SlotPicker";

// Spelt in SlotPicker now that a bride's two slots are worded the same way
export { spanInRussian, tripInRussian };

/**
 * "🚗 Назначить забор" on a Collect & return request — and "Перенести забор"
 * once it has a time.
 *
 * Kristina drives, so a collection is time she is out of the atelier. She
 * picks when she goes and how long the trip takes; the site takes that whole
 * stretch from the diary, so nobody books a fitting while she is away, and
 * emails the customer the window with a calendar invite. The customer only
 * said when they are usually in (it is in her email and in the notes).
 *
 * A time outside the hours for fittings — "I work till 7" — is typed in below
 * the picker («Время вне часов дневника»): it is emailed as written, holds
 * nothing in the diary, and frees whatever trip the collection held.
 *
 * Disabled while the request has unpublished changes, as the other diary
 * buttons are: the time is given to the published request.
 */

interface CollectionDoc {
  status?: string;
  slotStart?: string;
  slotEnd?: string;
  confirmedFor?: string;
  displayName?: string;
  collection?: unknown;
}

/** The start still chosen, if it still fits the trip — a longer trip may not fit after it. */
export function stillFits(days: SlotDay[], slot: string | null): string | null {
  return slot && days.some((day) => day.slots.some((s) => s.start === slot)) ? slot : null;
}

/**
 * The starts the picker offers for a trip of `minutes`, as of `nowMs`: every
 * slot of the trip free, the collection's own slots counting as its own, and
 * nothing that has already begun. The free times were read when the dialog
 * asked for them, and a time can pass while it stands open.
 */
export function pickerDays(
  times: SlotDay[],
  minutes: number,
  slotMinutes: number,
  own: string[],
  nowMs: number
): SlotDay[] {
  return spansOffered(times, minutes, slotMinutes, own, nowMs)
    .map((day) => ({ ...day, slots: day.slots.filter((slot) => instantOf(slot.start).getTime() > nowMs) }))
    .filter((day) => day.slots.length > 0);
}

/**
 * The clock, for the button's click. A plain function because the compiler's
 * purity rule cannot tell a click handler from rendering, and a click is
 * exactly when the time has to be read again.
 */
function clock(): number {
  return Date.now();
}

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

/** What the dialog says about where the request stands now. */
function standing(doc: CollectionDoc): string | null {
  if (doc.slotStart && releasesItsTime(doc.status)) {
    return "Время этого забора освободилось. Выберите новое, чтобы назначить забор снова.";
  }
  if (doc.slotStart) {
    const now = doc.slotEnd ? spanInRussian(doc.slotStart, doc.slotEnd) : slotInRussian(doc.slotStart);
    return `Сейчас: ${now}. Выберите новое время — старое освободится, как только новое будет закреплено.`;
  }
  if (doc.status === "confirmed" && doc.confirmedFor) {
    return `Сейчас: «${doc.confirmedFor}» — в дневнике это время не закрыто. Если оно в часах для примерок, выберите его здесь, чтобы закрыть.`;
  }
  return null;
}

/** What Kristina is told once it is done — the old request is gone by then, and its dialog with it. */
function doneMessage(data: Record<string, unknown>): string {
  const when =
    typeof data.slot === "string" && typeof data.end === "string"
      ? spanInRussian(data.slot, data.end)
      : String(data.label ?? "");
  const told = data.emailed
    ? "Клиенту ушло письмо с окном забора и приглашением в календарь."
    : data.hadEmail
    ? "Письмо сейчас не отправилось — сайт отправит его утром."
    : "В этой заявке нет эл. почты, поэтому сообщите клиенту время сами.";
  return `✓ Забор назначен: ${when}. Это время в дневнике закрыто — на примерку в ателье никто не запишется.\n\n${told}\n\nАдрес клиента спросите в переписке.`;
}

/** The same, for a time outside the diary's hours: nothing closed in the diary, perhaps something freed. */
export function outsideDoneMessage(data: Record<string, unknown>): string {
  const told = data.emailed
    ? "Клиенту ушло письмо с этим временем."
    : data.hadEmail
    ? "Письмо сейчас не отправилось — сайт отправит его утром."
    : "В этой заявке нет эл. почты, поэтому сообщите клиенту время сами.";
  const freed = data.freed ? " Время, которое забор держал раньше, в дневнике освободилось." : "";
  return `✓ Забор назначен: «${String(data.label ?? "")}». Это время вне часов дневника, поэтому в дневнике оно не закрыто.${freed}\n\n${told}\n\nАдрес клиента спросите в переписке.`;
}

function CollectDialog({ id, doc, onClose }: { id: string; doc: CollectionDoc; onClose: () => void }) {
  const token = useDiaryToken();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const times = useFreeTimes(token, attempt);
  const [minutes, setMinutes] = useState<number>(DEFAULT_TRIP_MINUTES);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [told, setTold] = useState("");
  const [outsideError, setOutsideError] = useState<string | null>(null);
  // The picker's clock: when the diary was last read, or when she last pressed
  // the button, whichever is later. A time that passes while the dialog stands
  // open — most often the collection's own start — is then no longer offered.
  const [triedAt, setTriedAt] = useState(0);
  const nowMs = Math.max(times.state === "ready" ? times.readAt : 0, triedAt);

  // The request is replaced by its timed copy, and the Studio takes the
  // dialog down with the old one — often before the answer arrives
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);

  const slotMinutes = times.state === "ready" ? times.slotMinutes : 30;
  // The slots this request already holds are free for it, so it can move half
  // an hour either way, or keep its start and take longer
  const own = useMemo(
    () => heldBy({ slotStart: doc.slotStart, slotEnd: doc.slotEnd, status: doc.status }, slotMinutes),
    [doc.slotStart, doc.slotEnd, doc.status, slotMinutes]
  );
  const days = useMemo(
    () => (times.state === "ready" ? pickerDays(times.days, minutes, slotMinutes, own, nowMs) : []),
    [times, minutes, slotMinutes, own, nowMs]
  );

  // A longer trip may no longer fit after the chosen start: then nothing is chosen
  const chosen = stillFits(days, slot);

  async function collect() {
    if (!chosen || busy || times.state !== "ready") return;
    const at = clock();
    setTriedAt(at);
    if (!stillFits(pickerDays(times.days, minutes, slotMinutes, own, at), chosen)) {
      setSlot(null);
      setError("Это время уже прошло — выберите другое.");
      return;
    }
    setBusy(true);
    setError(null);
    const reply = await askDiary(token, { action: "collect", id, slot: chosen, minutes });

    if (reply.ok) {
      onClose();
      router.navigateIntent("edit", { id: String(reply.data.id), type: "atelierBooking" });
      window.alert(doneMessage(reply.data));
      return;
    }

    const message = String(reply.data.error ?? "Не удалось назначить забор.");
    if (!shown.current) {
      window.alert(message);
      return;
    }
    setBusy(false);
    setError(message);
    if (reply.data.slotTaken) {
      setSlot(null);
      setAttempt((n) => n + 1);
    }
  }

  const outside = outsideWords(told);
  // Said only once she has typed something: an empty field is not a mistake
  const outsideProblem = told.trim() && !outside.ok ? outside.error : null;
  const holdsTrip = own.length > 0;

  async function collectOutside() {
    if (!outside.ok || busy) return;
    setBusy(true);
    setOutsideError(null);
    const reply = await askDiary(token, { action: "collectOutside", id, told: outside.told });

    if (reply.ok) {
      onClose();
      router.navigateIntent("edit", { id: String(reply.data.id), type: "atelierBooking" });
      window.alert(outsideDoneMessage(reply.data));
      return;
    }

    const message = String(reply.data.error ?? "Не удалось назначить забор.");
    if (!shown.current) {
      window.alert(message);
      return;
    }
    setBusy(false);
    setOutsideError(message);
  }

  const note = standing(doc);
  const end = chosen ? spanEnd(chosen, minutes, slotMinutes) : null;

  return (
    <div style={{ display: "grid", gap: 14, padding: 4 }}>
      {note && <p style={{ fontSize: 14, margin: 0, opacity: 0.8 }}>{note}</p>}
      <p style={{ fontSize: 13, margin: 0, opacity: 0.75, lineHeight: 1.5 }}>
        Когда клиенту удобно, написано в письме о заявке и в заметках («Показать контакты»). Не ставьте забор на
        школьные поездки утром и в обед.
      </p>
      {times.state === "ready" && times.enabled && (
      <div role="group" aria-label="Сколько займёт поездка" style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13 }}>Сколько займёт поездка — туда, у клиента и обратно</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {COLLECTION_TRIP_MINUTES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === minutes}
              onClick={() => setMinutes(option)}
              style={chipStyle(option === minutes)}
            >
              {tripInRussian(option)}
            </button>
          ))}
        </div>
      </div>
      )}
      {times.state === "loading" && <p style={{ fontSize: 14, margin: 0 }}>Загружаем дневник записей…</p>}
      {times.state === "failed" && (
        <p style={{ fontSize: 14, margin: 0 }}>
          {times.message}{" "}
          <button type="button" style={secondaryButton} onClick={() => setAttempt((n) => n + 1)}>
            Попробовать снова
          </button>
        </p>
      )}
      {times.state === "ready" && !times.enabled && (
        <p style={{ fontSize: 14, margin: 0 }}>
          Онлайн-запись выключена в разделе «Часы для примерок», поэтому в дневнике нечего закрывать. Впишите время
          забора ниже, в «Время вне часов дневника».
        </p>
      )}
      {times.state === "ready" && times.enabled && (
        <>
          <p style={{ fontSize: 13, margin: 0, opacity: 0.75, lineHeight: 1.5 }}>
            Здесь только часы для примерок, и только время, когда в дневнике нет записей на всю поездку. Забор в другое
            время — ниже, в «Время вне часов дневника».
          </p>
          <SlotPicker
            days={days}
            value={chosen}
            onChange={setSlot}
            emptyText={`На ближайшие недели нет окна на ${tripInRussian(minutes)} — попробуйте поездку короче.`}
          />
        </>
      )}
      {error && (
        <p role="alert" style={{ fontSize: 14, margin: 0, color: "#c0392b" }}>
          {error}
        </p>
      )}
      {times.state === "ready" && times.enabled && (
      <div>
        <button type="button" style={primaryButton(Boolean(chosen) && !busy)} disabled={!chosen || busy} onClick={collect}>
          {busy
            ? "Закрепляем время…"
            : chosen && end
            ? `Назначить забор: ${spanInRussian(chosen, end)}`
            : "Выберите время выше"}
        </button>
      </div>
      )}
      <div
        role="group"
        aria-label="Время вне часов дневника"
        style={{ display: "grid", gap: 8, borderTop: "1px solid rgba(128,128,128,0.25)", paddingTop: 14 }}
      >
        <label htmlFor="collect-outside" style={{ fontSize: 13, fontWeight: 600 }}>
          Время вне часов дневника
        </label>
        <input
          id="collect-outside"
          style={inputStyle}
          value={told}
          maxLength={OUTSIDE_MAX}
          placeholder="Tuesday 6 October, 7:30pm"
          onChange={(e) => setTold(e.target.value)}
        />
        <span style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>
          По-английски, как прочитает клиент, — например, «Tuesday 6 October, 7:30pm». Клиенту уйдёт письмо с этим
          временем, без приглашения в календарь. В дневнике оно не закроется
          {holdsTrip ? ", а время, которое забор держит сейчас, освободится." : "."}
        </span>
        {(outsideProblem || outsideError) && (
          <p role="alert" style={{ fontSize: 14, margin: 0, color: "#c0392b" }}>
            {outsideError ?? outsideProblem}
          </p>
        )}
        <div>
          <button
            type="button"
            style={primaryButton(outside.ok && !busy)}
            disabled={!outside.ok || busy}
            onClick={collectOutside}
          >
            {busy ? "Сохраняем…" : "Назначить забор на это время"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const collectionTimeAction: DocumentActionComponent = (props: DocumentActionProps) => {
  // Document actions are components rendered by Sanity; the lower-case name is
  // Sanity's convention, which is why the rule needs telling — see revealAction.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [open, setOpen] = useState(false);

  const doc = props.published as CollectionDoc | null;
  if (!doc || !doc.collection || !canMove(doc.status)) return null;

  const again = Boolean(doc.slotStart) && releasesItsTime(doc.status);
  const label = again ? "🚗 Назначить забор снова" : doc.slotStart ? "🚗 Перенести забор" : "🚗 Назначить забор";
  const close = () => {
    setOpen(false);
    props.onComplete();
  };

  return {
    label,
    disabled: Boolean(props.draft),
    title: props.draft
      ? "Сначала опубликуйте изменения, потом назначьте забор."
      : "Закрывает в дневнике время поездки, чтобы никто не записался на примерку, и отправляет клиенту письмо с окном забора и приглашением в календарь.",
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: "dialog",
          header: `${label}${doc.displayName ? ` — ${doc.displayName}` : ""}`,
          onClose: close,
          content: <CollectDialog id={props.id} doc={doc} onClose={close} />,
        }
      : undefined,
  };
};
