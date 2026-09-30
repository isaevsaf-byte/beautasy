import { useEffect, useRef, useState } from "react";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";
import { useRouter } from "sanity/router";
import { canMove, releasesItsTime } from "@/lib/diary";
import { askDiary, useDiaryToken, useFreeTimes } from "./diaryClient";
import { SlotPicker, primaryButton, secondaryButton, slotInRussian } from "./SlotPicker";

/**
 * "Назначить время" (Choose a time) on a request, "Перенести на другое время"
 * (Move to another time) on a booked one, and "Записать снова" (Book again) on
 * one that gave its time back.
 *
 * All three used to be done by typing into "Confirmed For", or by flipping a
 * cancelled booking back to Confirmed, and neither held anything: the site
 * kept offering the time, and a second customer could book it. This asks the
 * site to hold the new time first and only then let go of the old booking
 * (see moveBooking in @/lib/diary), and the customer is emailed the time with
 * a calendar invite.
 *
 * Disabled while the booking has unpublished changes: the move copies the
 * published booking, and a draft left behind would be lost with it.
 *
 * Not offered on Collect & return: that happens at the customer's door, holds
 * no time in the diary, and is confirmed by its status.
 */

interface BookingDoc {
  status?: string;
  slotStart?: string;
  confirmedFor?: string;
  displayName?: string;
  /** Collect & return — confirmed by its status, never given a time in the diary */
  collection?: unknown;
}

/** What the dialog says about where the booking stands now. */
function standing(doc: BookingDoc): string | null {
  if (doc.slotStart && releasesItsTime(doc.status)) {
    return `Эта запись была на ${slotInRussian(doc.slotStart)}, но время освободилось. Выберите время, чтобы записать клиента снова.`;
  }
  if (doc.slotStart) {
    return `Сейчас: ${slotInRussian(doc.slotStart)}. Выберите новое время — старое освободится, как только новое будет закреплено.`;
  }
  if (doc.status === "confirmed" && doc.confirmedFor) {
    // confirmedFor is what was typed or stored, often the site's English
    // label, and it is quoted exactly as it stands.
    return `Пока договорились так: «${doc.confirmedFor}», но в дневнике это время не закреплено. Выберите его здесь, чтобы закрепить.`;
  }
  return null;
}

/** What Kristina is told once it is done — the old booking is gone by then, and its dialog with it. */
function doneMessage(data: Record<string, unknown>): string {
  const when = typeof data.slot === "string" ? slotInRussian(data.slot) : String(data.label);
  const told = data.emailed
    ? "Клиенту ушло письмо с новым временем и приглашением в календарь."
    : data.hadEmail
    ? "Письмо сейчас не отправилось — сайт отправит его утром."
    : "В этой записи нет эл. почты, поэтому сообщите клиенту время сами.";
  return `✓ Записано на ${when}. Время на сайте закреплено.\n\n${told}`;
}

function MoveDialog({ id, note, onClose }: { id: string; note: string | null; onClose: () => void }) {
  const token = useDiaryToken();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const times = useFreeTimes(token, attempt);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The move deletes the booking this dialog belongs to, and the Studio takes
  // the dialog down with it — often before the answer arrives
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);

  async function move() {
    if (!slot || busy) return;
    setBusy(true);
    setError(null);
    const reply = await askDiary(token, { action: "move", id, slot });

    if (reply.ok) {
      onClose();
      router.navigateIntent("edit", { id: String(reply.data.id), type: "atelierBooking" });
      window.alert(doneMessage(reply.data));
      return;
    }

    const message = String(reply.data.error ?? "Не удалось изменить время.");
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

  return (
    <div style={{ display: "grid", gap: 14, padding: 4 }}>
      {note && <p style={{ fontSize: 14, margin: 0, opacity: 0.8 }}>{note}</p>}
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
          Онлайн-запись выключена в разделе «Часы для примерок», поэтому в дневнике нечего закреплять.
        </p>
      )}
      {times.state === "ready" && times.enabled && (
        <SlotPicker days={times.days} value={slot} onChange={setSlot} />
      )}
      {error && (
        <p role="alert" style={{ fontSize: 14, margin: 0, color: "#c0392b" }}>
          {error}
        </p>
      )}
      <div>
        <button type="button" style={primaryButton(Boolean(slot) && !busy)} disabled={!slot || busy} onClick={move}>
          {busy ? "Закрепляем время…" : slot ? `Записать на ${slotInRussian(slot)}` : "Выберите время выше"}
        </button>
      </div>
    </div>
  );
}

export const moveBookingAction: DocumentActionComponent = (props: DocumentActionProps) => {
  // Document actions are components rendered by Sanity; the lower-case name is
  // Sanity's convention, which is why the rule needs telling — see revealAction.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [open, setOpen] = useState(false);

  const doc = props.published as BookingDoc | null;
  if (!doc || !canMove(doc.status) || doc.collection) return null;

  const again = releasesItsTime(doc.status);
  const label = again ? "Записать снова" : doc.slotStart ? "Перенести на другое время" : "Назначить время";
  const close = () => {
    setOpen(false);
    props.onComplete();
  };

  return {
    label,
    disabled: Boolean(props.draft),
    title: props.draft
      ? "Сначала опубликуйте изменения, потом назначьте время."
      : again
      ? "Закрепляет за клиентом свободное время в дневнике и отправляет ему письмо с новым временем и приглашением в календарь."
      : doc.slotStart
      ? "Закрепляет новое время в дневнике, освобождает старое и отправляет клиенту письмо с новым временем."
      : "Закрепляет время в дневнике под эту заявку и отправляет клиенту подтверждение с приглашением в календарь.",
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: "dialog",
          header: `${label}${doc.displayName ? ` — ${doc.displayName}` : ""}`,
          onClose: close,
          content: <MoveDialog id={props.id} note={standing(doc)} onClose={close} />,
        }
      : undefined,
  };
};
