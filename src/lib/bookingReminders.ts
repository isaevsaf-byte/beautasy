import { sanityWriteClient } from "@/lib/sanity";
import { sendEmail, type EmailMessage } from "@/lib/sendEmail";
import { open } from "@/lib/pii";
import { secretsConfigured } from "@/lib/secrets";
import { claimThenSend, type ClaimClient, type ClaimOutcome } from "@/lib/claim";
import { reminderEmailHtml, reminderEmailSubject } from "@/lib/bookingEmails";
import { diaryTimeHolds } from "@/lib/morningList";
import { londonDays } from "@/lib/londonDays";

/**
 * The email a client gets the morning before their fitting: the time, the
 * job, what to bring, and how to move it if they cannot come.
 *
 * Sent from the nine o'clock cron, for fittings tomorrow by Southampton's
 * calendar — "tomorrow" is worked out from the London date, never by adding
 * 24 hours, so the Saturday before the clocks go back still finds Sunday's
 * fittings (see @/lib/londonDays).
 *
 * Who gets one: a fitting that is confirmed, holds a time in the diary, has
 * an email address to send to, and is not a collection — a collection is at
 * their own door, its confirmation says what to have ready, and the invite it
 * carried has an alarm the evening before. Not a request still waiting for
 * Kristina ("new"), not anything cancelled or declined, and not a record the
 * diary kept when the time went to someone else (`releasedAt`).
 *
 * Once per booking and time. The booking is claimed before the email goes,
 * with `reminderSentFor` set to the very time reminded of — the claim
 * `claimThenSend` makes for every email here (see @/lib/claim), so of two
 * runs at once one sends. The time is part of the mark because a moved
 * booking carries its fields with it (movedCopy in @/lib/diary): a booking
 * reminded for Tuesday and moved to Friday is owed a reminder for Friday, and
 * a bare "reminded" would have said it already had one. A refused email hands
 * the mark back.
 */

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

/**
 * A confirmation said all of this a moment ago: a fitting booked or moved in
 * the last twelve hours is not reminded the next morning. Booked at ten last
 * night for tomorrow, the confirmation is the reminder.
 */
export const FRESH_CONFIRMATION_MS = 12 * 60 * 60 * 1000;

/**
 * More than one day of the diary can hold, the same ceiling the booking
 * emails' queue uses. Written into the query as a number: a slice may not
 * take a parameter in groq-js, which the tests run it through.
 */
export const REMINDERS_PER_RUN = 25;

export const REMINDER_QUERY = `*[
  _type == "atelierBooking"
  && !(_id in path("drafts.**"))
  && status == "confirmed"
  && defined(emailSealed)
  && defined(slotStart)
  && !defined(collection)
  && !defined(releasedAt)
  && slotStart >= $day
  && slotStart < $nextDay
  && (!defined(reminderSentFor) || reminderSentFor != slotStart)
] | order(slotStart asc) [0...${REMINDERS_PER_RUN}] {
  _id, _rev, displayName, emailSealed, service, slotStart, slotEnd, confirmedFor, createdAt, movedAt
}`;

export interface RemindableBooking {
  _id: string;
  _rev: string;
  displayName?: string;
  emailSealed?: string;
  service?: string;
  slotStart?: string;
  slotEnd?: string;
  confirmedFor?: string;
  createdAt?: string;
  movedAt?: string;
}

/**
 * Whether this booking is owed a reminder now. The query has already chosen
 * tomorrow's confirmed fittings; this is the part GROQ cannot say well: that
 * the diary's time is the time they were told (see diaryTimeHolds), and that
 * no confirmation went out in the last twelve hours.
 */
export function owedReminder(booking: RemindableBooking, now: Date): boolean {
  if (!diaryTimeHolds(booking)) return false;
  const confirmedAt = Math.max(
    ...[booking.createdAt, booking.movedAt].map((at) => (at ? Date.parse(at) : NaN)).filter((ms) => !Number.isNaN(ms)),
    -Infinity
  );
  return !(now.getTime() - confirmedAt < FRESH_CONFIRMATION_MS);
}

/** The mark that claims the reminder, and says which time it was for. */
export function reminderMark(booking: Pick<RemindableBooking, "slotStart">, now: Date): Record<string, unknown> {
  return { reminderSentAt: now.toISOString(), reminderSentFor: booking.slotStart };
}

/** Claim, send, and hand the mark back if the mail service refuses. Its own function so a test runs the real claim. */
export function claimReminder(
  client: ClaimClient,
  booking: RemindableBooking,
  now: Date,
  send: () => Promise<unknown>
): Promise<ClaimOutcome> {
  return claimThenSend(client, booking, reminderMark(booking, now), ["reminderSentAt", "reminderSentFor"], send);
}

export interface ReminderDeps {
  now?: Date;
  fetch?: (query: string, params: Record<string, unknown>) => Promise<RemindableBooking[]>;
  client?: ClaimClient;
  send?: (message: EmailMessage) => Promise<void>;
  /** Opens a sealed address — see @/lib/pii */
  openEmail?: (sealed: string | undefined) => string | null;
}

export async function sendFittingReminders(
  deps: ReminderDeps = {}
): Promise<{ day: string; checked: number; sent: number; skipped: number }> {
  const now = deps.now ?? new Date();
  const { tomorrow, dayAfter } = londonDays(now);
  if (!deps.fetch && (!process.env.SANITY_API_WRITE_TOKEN || !process.env.RESEND_API_KEY || !secretsConfigured())) {
    return { day: tomorrow, checked: 0, sent: 0, skipped: 0 };
  }
  const fetch = deps.fetch ?? ((query, params) => sanityWriteClient.fetch<RemindableBooking[]>(query, params));
  const client = deps.client ?? sanityWriteClient;
  const send = deps.send ?? ((message) => sendEmail(message));
  const openEmail = deps.openEmail ?? ((sealed) => open(sealed));

  const bookings = (await fetch(REMINDER_QUERY, { day: tomorrow, nextDay: dayAfter })) ?? [];
  let sent = 0;
  let skipped = 0;
  for (const booking of bookings) {
    if (!owedReminder(booking, now)) {
      skipped++;
      continue;
    }
    // The address is sealed in the document; sending needs the real one
    const email = openEmail(booking.emailSealed);
    if (!email) {
      console.error(`Booking ${booking._id} has no readable email — no reminder`);
      skipped++;
      continue;
    }
    const outcome = await claimReminder(client, booking, now, () =>
      send({
        from: FROM_EMAIL,
        to: email,
        replyTo: KRISTINA_EMAIL,
        subject: reminderEmailSubject(booking),
        html: reminderEmailHtml(booking),
      })
    );
    if (outcome === "sent") sent++;
  }
  return { day: tomorrow, checked: bookings.length, sent, skipped };
}
