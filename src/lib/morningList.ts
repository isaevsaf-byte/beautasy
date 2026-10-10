import { sanityWriteClient } from "@/lib/sanity";
import { sendEmail, type EmailMessage } from "@/lib/sendEmail";
import { escapeHtml } from "@/lib/escapeHtml";
import { open } from "@/lib/pii";
import { secretsConfigured } from "@/lib/secrets";
import { isConflict } from "@/lib/diary";
import { whatsappNumberOf } from "@/lib/bookingEmails";
import { pieceInSentence } from "@/lib/atelierServices";
import { dayLabel, slotLabel, spanLabel, timeLabel } from "@/lib/slots";
import { londonDays } from "@/lib/londonDays";

/**
 * Kristina's morning list: who is coming today and tomorrow, in one short
 * email at nine.
 *
 * Until now the day's visitors were wherever the confirmations had left them —
 * one email per booking, days or weeks apart, and «Записи в ателье» sorted by
 * when each was asked for rather than when it happens. This puts the next two
 * days on one screen: the time, the first name, the job, where a collection
 * is, and a WhatsApp link to each client with the first line already written.
 *
 * Read from the diary, so only visits with a time in it are listed: fittings
 * booked online or with «Записать вручную», and collections given a time with
 * «🚗 Назначить забор». A time typed in words — an out-of-hours collection, a
 * request confirmed by hand — names no day the site can read, so it cannot be
 * put on one; the email says so in its last line.
 *
 * Sent once a day at most. The day is claimed first — a document whose id is
 * the date, which Sanity will create only once — and only the run that
 * creates it sends; a refused email hands the day back for a second try. A
 * day with nothing on it and nothing tomorrow sends nothing and claims
 * nothing, so a booking made at ten still gets the next morning's list.
 */

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
// The atelier's inbox — where every booking email to her already goes
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

/**
 * Confirmed and holding a time from today up to (not including) the day after
 * tomorrow. `slotStart` is Southampton's wall clock as "2026-10-10T14:00", so a
 * bare date compares as the start of its day: "2026-10-10" < "2026-10-10T09:00".
 * A booking whose time went to someone else (`releasedAt`) is not a visit.
 */
export const MORNING_LIST_QUERY = `*[
  _type == "atelierBooking"
  && !(_id in path("drafts.**"))
  && status == "confirmed"
  && defined(slotStart)
  && slotStart >= $from
  && slotStart < $until
  && !defined(releasedAt)
] | order(slotStart asc) {
  _id, displayName, service, slotStart, slotEnd, confirmedFor, collection, phoneSealed
}`;

export interface DiaryBooking {
  _id: string;
  displayName?: string;
  service?: string;
  slotStart?: string;
  slotEnd?: string;
  confirmedFor?: string;
  collection?: { district?: string; zone?: string };
  /** Sealed — see @/lib/pii. Opened only to make the WhatsApp link. */
  phoneSealed?: string;
}

const SLOT_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Whether the diary's time is the time the client was told.
 *
 * Almost always. The exception is a booking Kristina once moved by typing a
 * new time into «Подтверждено на»: it keeps its old `slotStart`, which the
 * Studio will not let her edit, and the confirmation printed her words. The
 * diary's time is then a time nobody is coming at — the same rule the
 * calendar invite follows (see fittingOf in @/lib/bookingEmails) — and both
 * the morning list and the client's reminder leave it out rather than state it.
 */
export function diaryTimeHolds(booking: Pick<DiaryBooking, "slotStart" | "slotEnd" | "confirmedFor">): boolean {
  if (!booking.slotStart || !SLOT_SHAPE.test(booking.slotStart)) return false;
  if (!booking.confirmedFor) return true;
  const told = [slotLabel(booking.slotStart)];
  if (booking.slotEnd && SLOT_SHAPE.test(booking.slotEnd)) told.push(spanLabel(booking.slotStart, booking.slotEnd));
  return told.includes(booking.confirmedFor);
}

export interface Visit {
  day: "today" | "tomorrow";
  /** The start, or for a collection its trip from start to end, as timeLabel writes them */
  time: string;
  name: string;
  /** The job, as she would say it */
  what: string;
  /** Collect & return: the district and zone it is in. Never more — see @/lib/collection */
  collectFrom: string | null;
  /** wa.me with the client's number and a first line, when there is a number to read */
  whatsapp: string | null;
}

/**
 * The bookings as lines of her list. Pure, so a test can hand it bookings and
 * a key and read what she would read.
 *
 * `openPhone` opens a sealed number. A number that cannot be opened, or is not
 * one wa.me can take (see whatsappNumberOf), gives no link rather than a
 * wrong one: a chat opened with a stranger is worse than none.
 */
export function visitsFrom(
  bookings: DiaryBooking[],
  days: { today: string; tomorrow: string },
  openPhone: (sealed: string | undefined) => string | null = (sealed) => open(sealed)
): Visit[] {
  const visits: Visit[] = [];
  for (const booking of bookings) {
    if (!diaryTimeHolds(booking)) continue;
    const start = booking.slotStart!;
    const date = start.slice(0, 10);
    const day = date === days.today ? "today" : date === days.tomorrow ? "tomorrow" : null;
    if (!day) continue;
    const collecting = Boolean(booking.collection);
    const end = booking.slotEnd && SLOT_SHAPE.test(booking.slotEnd) && booking.slotEnd.slice(0, 10) === date ? booking.slotEnd : null;
    const time = collecting && end ? `${timeLabel(start.slice(11))}–${timeLabel(end.slice(11))}` : timeLabel(start.slice(11));
    const name = booking.displayName?.trim() || "No name";
    const number = whatsappNumberOf(openPhone(booking.phoneSealed) ?? undefined);
    const greeting = booking.displayName?.trim() ? `Hi ${booking.displayName.trim()}` : "Hi";
    const opening = collecting
      ? `${greeting}, it's Kristina from Beautasy, about collecting your ${pieceInSentence(booking.service)} ${day} (${time}): `
      : `${greeting}, it's Kristina from Beautasy, about your fitting ${day} at ${time}: `;
    visits.push({
      day,
      time,
      name,
      what: booking.service?.trim() || "Fitting",
      collectFrom: collecting
        ? [booking.collection?.district, booking.collection?.zone].filter(Boolean).join(" · ") || "district not given"
        : null,
      whatsapp: number ? `https://wa.me/${number}?text=${encodeURIComponent(opening)}` : null,
    });
  }
  return visits;
}

/** "Today 2 · tomorrow 1" — the subject, so the inbox alone says how the day looks. */
export function morningListSubject(visits: Visit[]): string {
  const today = visits.filter((visit) => visit.day === "today").length;
  const tomorrow = visits.length - today;
  const count = (n: number, word: string) => (n === 0 ? `nothing ${word}` : `${n} ${word}`);
  return `☀️ Your atelier: ${count(today, "today")} · ${count(tomorrow, "tomorrow")}`;
}

function visitHtml(visit: Visit): string {
  const where = visit.collectFrom ? ` · 🚗 collect &amp; return, ${escapeHtml(visit.collectFrom)}` : "";
  const reach = visit.whatsapp
    ? `<a href="${escapeHtml(visit.whatsapp)}" style="color:#5e4b9a;font-weight:bold;">WhatsApp ${escapeHtml(visit.name)}</a>`
    : `<span style="color:#8a8494;">no phone number — their email is in the Studio</span>`;
  return `<li style="margin:0 0 14px;line-height:1.6;">
        <strong>${escapeHtml(visit.time)}</strong> · ${escapeHtml(visit.name)} — ${escapeHtml(visit.what)}${where}<br/>
        ${reach}
      </li>`;
}

function dayHtml(title: string, visits: Visit[]): string {
  return `<h2 style="margin:22px 0 10px;font-size:15px;font-weight:600;color:#2d2d2d;">${escapeHtml(title)}</h2>
    ${
      visits.length === 0
        ? `<p style="margin:0;color:#8a8494;">Nothing booked.</p>`
        : `<ul style="margin:0;padding:0 0 0 18px;color:#3d3d3d;">${visits.map(visitHtml).join("")}</ul>`
    }`;
}

export function morningListHtml(visits: Visit[], days: { today: string; tomorrow: string }): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#faf9f7;font-family:Georgia,serif;color:#2d2d2d;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 32px;">
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;">Beautasy Atelier</p>
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:400;">Good morning, Kristina 💜</h1>
    <p style="margin:0;color:#555;line-height:1.6;">Who is coming today and tomorrow.</p>
    ${dayHtml(`Today — ${dayLabel(days.today)}`, visits.filter((visit) => visit.day === "today"))}
    ${dayHtml(`Tomorrow — ${dayLabel(days.tomorrow)}`, visits.filter((visit) => visit.day === "tomorrow"))}
    <p style="margin:24px 0 0;font-size:12px;color:#8a8494;line-height:1.6;">Only visits with a time in the diary are listed. A time you typed in words — a collection outside the diary's hours — is in «Записи в ателье».</p>
  </div>
</body></html>`;
}

/** The id that claims a day's list. Sanity creates an id once, so one list a day. */
export function morningListIdFor(day: string): string {
  return `morningList-${day}`;
}

export type MorningListOutcome = "sent" | "nothing" | "already" | "unconfigured" | "failed";

/** Everything the job touches outside itself, so a test can stand in for each. */
export interface MorningListDeps {
  now?: Date;
  fetch?: (query: string, params: Record<string, unknown>) => Promise<DiaryBooking[]>;
  /** Create the day's claim. Throws with statusCode 409 when the day is already claimed. */
  claim?: (doc: { _id: string; _type: string; [field: string]: unknown }) => Promise<unknown>;
  release?: (id: string) => Promise<unknown>;
  send?: (message: EmailMessage) => Promise<void>;
}

export async function sendMorningList(
  deps: MorningListDeps = {}
): Promise<{ day: string; visits: number; outcome: MorningListOutcome }> {
  const days = londonDays(deps.now ?? new Date());
  // DATA_SECRET opens the phone numbers; without it the links would all be missing
  if (!deps.fetch && (!process.env.SANITY_API_WRITE_TOKEN || !process.env.RESEND_API_KEY || !secretsConfigured())) {
    return { day: days.today, visits: 0, outcome: "unconfigured" };
  }
  const fetch = deps.fetch ?? ((query, params) => sanityWriteClient.fetch<DiaryBooking[]>(query, params));
  const claim = deps.claim ?? ((doc) => sanityWriteClient.create(doc));
  const release = deps.release ?? ((id) => sanityWriteClient.delete(id));
  const send = deps.send ?? ((message) => sendEmail(message));

  const bookings = (await fetch(MORNING_LIST_QUERY, { from: days.today, until: days.dayAfter })) ?? [];
  const visits = visitsFrom(bookings, days);
  if (visits.length === 0) return { day: days.today, visits: 0, outcome: "nothing" };

  // The claim. Only a conflict means another run has the day. Any other
  // refusal — a token that has lost its write rights — is not "already sent",
  // and reading it as that would make this list go quiet for good in exactly
  // the morning the watchman is shouting about the token. So it sends
  // unclaimed: the cost is a second copy if the cron is run again by hand.
  const id = morningListIdFor(days.today);
  let claimed = true;
  try {
    // Counts only: the names and numbers are in the email, not in this record
    await claim({ _id: id, _type: "morningList", day: days.today, visits: visits.length, claimedAt: new Date().toISOString() });
  } catch (error) {
    if (isConflict(error)) return { day: days.today, visits: visits.length, outcome: "already" };
    console.error(`Could not claim this morning's list (${id}); sending it unclaimed:`, error instanceof Error ? error.message : error);
    claimed = false;
  }

  try {
    await send({
      from: FROM_EMAIL,
      to: KRISTINA_EMAIL,
      subject: morningListSubject(visits),
      html: morningListHtml(visits, days),
    });
    return { day: days.today, visits: visits.length, outcome: "sent" };
  } catch (error) {
    console.error("This morning's list was not sent:", error instanceof Error ? error.message : error);
    if (claimed) {
      // Handed back, so a second run today can try again
      try {
        await release(id);
      } catch (releaseError) {
        console.error(`Could not hand back ${id}; today's list will not be retried:`, releaseError instanceof Error ? releaseError.message : releaseError);
      }
    }
    return { day: days.today, visits: visits.length, outcome: "failed" };
  }
}
