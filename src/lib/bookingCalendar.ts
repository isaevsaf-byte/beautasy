import { instantOf, slotDocumentId } from "@/lib/slots";

/**
 * A booked fitting, in a form a calendar can take.
 *
 * The confirmation email used to say a time and nothing else, so the
 * appointment lived only in an inbox. Now it carries two ways into a
 * calendar: a Google Calendar link (one tap for anyone signed in to Google)
 * and an .ics invite attached to the email, which Apple Calendar, Outlook and
 * Gmail all open as an event. Both are built from the slot the customer picked,
 * which is Southampton wall-clock time, so the conversion to an instant goes
 * through `instantOf` and keeps British Summer Time right on both sides of the
 * clock change.
 */

export interface CalendarEvent {
  /** The booking's lasting name, so a later copy of the email updates the same event (see calendarUid) */
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description: string;
  location: string;
  /** 7pm the evening before, Southampton time: when the second alarm goes, if it is still to come */
  eveningBefore?: Date;
}

/**
 * The event's lasting name. A booking moved to another time becomes a new
 * document, named by its new slot, but keeps the moment it was made
 * (`createdAt`, to the millisecond) — so the invite for the new time updates
 * the event already in her calendar instead of adding a second one, whose
 * alarms would send her to the door the evening before a fitting that is no
 * longer there. A booking without that moment keeps the slot's name.
 */
export function calendarUid(createdAt: string | null | undefined, slotStart: string): string {
  const made = typeof createdAt === "string" ? new Date(createdAt) : null;
  if (made && !Number.isNaN(made.getTime())) {
    return `booking-${made.toISOString().replace(/[-:.]/g, "")}@beautasy.co.uk`;
  }
  return `${slotDocumentId(slotStart)}@beautasy.co.uk`;
}

/** 7pm on the day before "2026-10-06T10:00", Southampton time, as an instant — right across the clock change */
export function eveningBefore(slotStart: string): Date {
  const day = new Date(`${slotStart.slice(0, 10)}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return instantOf(`${day.toISOString().slice(0, 10)}T19:00`);
}

/**
 * The fitting a slot stands for, from "2026-10-06T10:00" and its length. Its
 * title says what to bring: the title is what every calendar shows in its
 * reminder, the evening before and on the day (see @/lib/whatToBring).
 */
export function fittingEvent(input: {
  slotStart: string;
  minutes: number;
  /** What to bring, short: "bring dress, wedding shoes & underwear" */
  bring: string;
  location: string;
  description: string;
  uid?: string;
}): CalendarEvent {
  const start = instantOf(input.slotStart);
  return {
    uid: input.uid ?? calendarUid(null, input.slotStart),
    start,
    end: new Date(start.getTime() + input.minutes * 60_000),
    title: `Beautasy fitting · ${input.bring}`,
    description: input.description,
    location: input.location,
    eveningBefore: eveningBefore(input.slotStart),
  };
}

/** "20261006T090000Z" — the UTC form both Google and iCalendar read. */
export function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Opens Google Calendar with the event filled in, ready to save. */
export function googleCalendarLink(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(event.start)}/${utcStamp(event.end)}`,
    details: event.description,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** RFC 5545 TEXT: backslash, comma, semicolon and newline are escaped. */
function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    // A lone \r too: some readers end a line on it, and the service name is
    // text a stranger typed, so it must not be able to start a line of its own
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * RFC 5545 folding: no line longer than 75 octets, continued on the next line
 * after a single space. Octets rather than characters, and never inside a
 * character, because a service name or a note can carry a £ or an accent.
 */
function fold(line: string): string {
  const pieces: string[] = [];
  let piece = "";
  let octets = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character, "utf8");
    // The leading space of a continuation line counts towards its 75
    const limit = pieces.length === 0 ? 75 : 74;
    if (octets + size > limit) {
      pieces.push(piece);
      piece = "";
      octets = 0;
    }
    piece += character;
    octets += size;
  }
  pieces.push(piece);
  return pieces.join("\r\n ");
}

/**
 * Each invite newer than the one before it — minutes since 2026 began — so a
 * calendar holding the event takes the later one as the update it is.
 */
export function sequenceAt(now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 60_000));
}

function alarm(trigger: string, title: string): string[] {
  return ["BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER:${trigger}`, `DESCRIPTION:${icsText(title)}`, "END:VALARM"];
}

/**
 * The event as an .ics file. METHOD:PUBLISH with no organiser or attendees,
 * so a mail client shows "add to calendar" rather than an invitation that
 * expects a yes or no sent back to orders@.
 *
 * Two alarms, in this order: two hours before, and 7pm the evening before —
 * when there is still time to put the shoes by the door. Outlook keeps only
 * the first, so the one on the day goes first; Apple keeps both; Google keeps
 * neither and uses her own, which is why the title carries the words. Both are
 * durations before the start, worked out from the instants, so the clock
 * change is counted in; the evening one is left out once 7pm has passed.
 */
export function icsInvite(event: CalendarEvent, now: Date): string {
  const evening =
    event.eveningBefore && event.eveningBefore.getTime() > now.getTime()
      ? Math.round((event.start.getTime() - event.eveningBefore.getTime()) / 60_000)
      : null;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Beautasy//Atelier bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `SEQUENCE:${sequenceAt(now)}`,
    `DTSTART:${utcStamp(event.start)}`,
    `DTEND:${utcStamp(event.end)}`,
    `SUMMARY:${icsText(event.title)}`,
    `DESCRIPTION:${icsText(event.description)}`,
    `LOCATION:${icsText(event.location)}`,
    ...alarm("-PT2H", event.title),
    ...(evening && evening > 120 ? alarm(`-PT${evening}M`, event.title) : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
