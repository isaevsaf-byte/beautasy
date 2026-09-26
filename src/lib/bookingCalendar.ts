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
  /** Stable per slot, so a second copy of the email updates the same event */
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description: string;
  location: string;
}

/** The fitting a slot stands for, from "2026-10-06T10:00" and its length. */
export function fittingEvent(input: {
  slotStart: string;
  minutes: number;
  service: string;
  location: string;
  description: string;
}): CalendarEvent {
  const start = instantOf(input.slotStart);
  return {
    uid: `${slotDocumentId(input.slotStart)}@beautasy.co.uk`,
    start,
    end: new Date(start.getTime() + input.minutes * 60_000),
    title: `Beautasy Atelier: ${input.service}`,
    description: input.description,
    location: input.location,
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
    .replace(/\r?\n/g, "\\n")
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
 * The event as an .ics file. METHOD:PUBLISH with no organiser or attendees,
 * so a mail client shows "add to calendar" rather than an invitation that
 * expects a yes or no sent back to orders@.
 */
export function icsInvite(event: CalendarEvent, now: Date): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Beautasy//Atelier bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(event.start)}`,
    `DTEND:${utcStamp(event.end)}`,
    `SUMMARY:${icsText(event.title)}`,
    `DESCRIPTION:${icsText(event.description)}`,
    `LOCATION:${icsText(event.location)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT2H",
    `DESCRIPTION:${icsText(event.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
