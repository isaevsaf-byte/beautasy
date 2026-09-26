import { useState } from "react";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";
import { useRouter } from "sanity/router";
import { canMove } from "@/lib/diary";
import { slotLabel } from "@/lib/slots";
import { askDiary, useDiaryToken, useFreeTimes } from "./diaryClient";
import { SlotPicker, primaryButton, secondaryButton } from "./SlotPicker";

/**
 * "Choose a time" on a request, "Move to another time" on a booked one.
 *
 * Both used to be done by typing into "Confirmed For", which held nothing:
 * the site kept offering that time, and a second customer could book it. This
 * asks the site to hold the new time first and only then let go of the old
 * one (see moveBooking in @/lib/diary), and the customer is emailed the new
 * time with a calendar invite.
 *
 * Disabled while the booking has unpublished changes: the move copies the
 * published booking, and a draft left behind would be lost with it.
 */

interface BookingDoc {
  status?: string;
  slotStart?: string;
  displayName?: string;
}

interface Moved {
  id: string;
  label: string;
  emailed: boolean;
  hadEmail: boolean;
}

function MoveDialog({ id, current, onClose }: { id: string; current?: string; onClose: () => void }) {
  const token = useDiaryToken();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const times = useFreeTimes(token, attempt);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState<Moved | null>(null);

  async function move() {
    if (!slot || busy) return;
    setBusy(true);
    setError(null);
    const reply = await askDiary(token, { action: "move", id, slot });
    setBusy(false);
    if (!reply.ok) {
      setError(String(reply.data.error ?? "Could not change the time."));
      if (reply.data.slotTaken) {
        setSlot(null);
        setAttempt((n) => n + 1);
      }
      return;
    }
    setMoved({
      id: String(reply.data.id),
      label: String(reply.data.label),
      emailed: Boolean(reply.data.emailed),
      hadEmail: Boolean(reply.data.hadEmail),
    });
  }

  if (moved) {
    return (
      <div style={{ display: "grid", gap: 14, padding: 4 }}>
        <p style={{ fontSize: 15, margin: 0 }}>
          ✓ Booked for <strong>{moved.label}</strong>. The time is held on the site
          {current ? ", and the old one is free again." : "."}
        </p>
        <p style={{ fontSize: 13, margin: 0, opacity: 0.75 }}>
          {moved.emailed
            ? "They have been emailed the time, with a calendar invite."
            : moved.hadEmail
            ? "The email could not go right now — the site will send it in the morning."
            : "There is no email on this booking, so let them know yourself."}
        </p>
        <div>
          <button
            type="button"
            style={primaryButton(true)}
            onClick={() => {
              onClose();
              router.navigateIntent("edit", { id: moved.id, type: "atelierBooking" });
            }}
          >
            Open the booking
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14, padding: 4 }}>
      {current && (
        <p style={{ fontSize: 14, margin: 0, opacity: 0.8 }}>
          Now: <strong>{slotLabel(current)}</strong>. Choose the new time — the old one is freed once the new one is held.
        </p>
      )}
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

  const label = doc.slotStart ? "Move to another time" : "Choose a time";
  const close = () => {
    setOpen(false);
    props.onComplete();
  };

  return {
    label,
    disabled: Boolean(props.draft),
    title: props.draft
      ? "Publish your changes first, then give it a time."
      : doc.slotStart
      ? "Holds the new time in the diary, frees the old one and emails the customer the new time."
      : "Holds a time in the diary for this request and emails the customer a confirmation with a calendar invite.",
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: "dialog",
          header: `${label}${doc.displayName ? ` — ${doc.displayName}` : ""}`,
          onClose: close,
          content: <MoveDialog id={props.id} current={doc.slotStart} onClose={close} />,
        }
      : undefined,
  };
};
