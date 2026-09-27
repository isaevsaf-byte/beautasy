import { useEffect, useRef, useState } from "react";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";
import { useRouter } from "sanity/router";
import { canMove, releasesItsTime } from "@/lib/diary";
import { slotLabel } from "@/lib/slots";
import { askDiary, useDiaryToken, useFreeTimes } from "./diaryClient";
import { SlotPicker, primaryButton, secondaryButton } from "./SlotPicker";

/**
 * "Choose a time" on a request, "Move to another time" on a booked one, and
 * "Book again" on one that gave its time back.
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
 */

interface BookingDoc {
  status?: string;
  slotStart?: string;
  confirmedFor?: string;
  displayName?: string;
}

/** What the dialog says about where the booking stands now. */
function standing(doc: BookingDoc): string | null {
  if (doc.slotStart && releasesItsTime(doc.status)) {
    return `It had ${slotLabel(doc.slotStart)}, and gave it back. Choose a time to book them in again.`;
  }
  if (doc.slotStart) {
    return `Now: ${slotLabel(doc.slotStart)}. Choose the new time — the old one is freed once the new one is held.`;
  }
  if (doc.status === "confirmed" && doc.confirmedFor) {
    return `Agreed so far as “${doc.confirmedFor}”, which the diary does not hold. Choose it here to hold it.`;
  }
  return null;
}

/** What Kristina is told once it is done — the old booking is gone by then, and its dialog with it. */
function doneMessage(data: Record<string, unknown>): string {
  const told = data.emailed
    ? "They have been emailed the time, with a calendar invite."
    : data.hadEmail
    ? "The email could not go right now — the site will send it in the morning."
    : "There is no email on this booking, so let them know yourself.";
  return `✓ Booked for ${String(data.label)}. The time is held on the site.\n\n${told}`;
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

    const message = String(reply.data.error ?? "Could not change the time.");
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
      {times.state === "loading" && <p style={{ fontSize: 14, margin: 0 }}>Reading the diary…</p>}
      {times.state === "failed" && (
        <p style={{ fontSize: 14, margin: 0 }}>
          {times.message}{" "}
          <button type="button" style={secondaryButton} onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      {times.state === "ready" && !times.enabled && (
        <p style={{ fontSize: 14, margin: 0 }}>
          Online booking is switched off in Fitting Times, so the diary has no times to hold.
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
          {busy ? "Holding the time…" : slot ? `Book for ${slotLabel(slot)}` : "Choose a time above"}
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
  if (!doc || !canMove(doc.status)) return null;

  const again = releasesItsTime(doc.status);
  const label = again ? "Book again" : doc.slotStart ? "Move to another time" : "Choose a time";
  const close = () => {
    setOpen(false);
    props.onComplete();
  };

  return {
    label,
    disabled: Boolean(props.draft),
    title: props.draft
      ? "Publish your changes first, then give it a time."
      : again
      ? "Holds a free time in the diary for them and emails them the new time with a calendar invite."
      : doc.slotStart
      ? "Holds the new time in the diary, frees the old one and emails the customer the new time."
      : "Holds a time in the diary for this request and emails the customer a confirmation with a calendar invite.",
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
