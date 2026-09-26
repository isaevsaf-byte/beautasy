import { test } from "node:test";
import assert from "node:assert/strict";
import { fittingEvent, googleCalendarLink, icsInvite, utcStamp } from "./bookingCalendar";

const base = {
  minutes: 30,
  service: "Alterations",
  location: "Beautasy Atelier, Southampton",
  description: "Bring the piece, and the shoes you will wear with it; to move it, WhatsApp us.",
};

test("a summer slot is an hour earlier in UTC, a winter one is not", () => {
  // The clocks go back on Sunday 25 October 2026
  const summer = fittingEvent({ ...base, slotStart: "2026-10-24T10:00" });
  const winter = fittingEvent({ ...base, slotStart: "2026-10-26T10:00" });

  assert.equal(utcStamp(summer.start), "20261024T090000Z");
  assert.equal(utcStamp(summer.end), "20261024T093000Z");
  assert.equal(utcStamp(winter.start), "20261026T100000Z");
  assert.equal(utcStamp(winter.end), "20261026T103000Z");
});

test("the event lasts as long as the diary's slot", () => {
  const event = fittingEvent({ ...base, minutes: 45, slotStart: "2026-11-02T14:30" });
  assert.equal(event.end.getTime() - event.start.getTime(), 45 * 60_000);
});

test("one slot is one event, however many times it is sent", () => {
  const a = fittingEvent({ ...base, slotStart: "2026-10-06T10:00" });
  const b = fittingEvent({ ...base, slotStart: "2026-10-06T10:00", service: "Repairs" });
  assert.equal(a.uid, "slot-2026-10-06-1000@beautasy.co.uk");
  assert.equal(a.uid, b.uid);
});

test("the Google Calendar link carries the time and the words", () => {
  const url = new URL(googleCalendarLink(fittingEvent({ ...base, slotStart: "2026-10-06T10:00" })));
  assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("dates"), "20261006T090000Z/20261006T093000Z");
  assert.equal(url.searchParams.get("text"), "Beautasy Atelier: Alterations");
  assert.equal(url.searchParams.get("location"), "Beautasy Atelier, Southampton");
});

test("the .ics file is one published event a calendar will accept", () => {
  const now = new Date(Date.UTC(2026, 8, 26, 19, 0, 0));
  const ics = icsInvite(fittingEvent({ ...base, slotStart: "2026-10-06T10:00" }), now);

  assert.ok(ics.endsWith("\r\n"));
  assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false, "every line ends CRLF");

  const lines = ics.split("\r\n").filter(Boolean);
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.equal(lines.at(-1), "END:VCALENDAR");
  for (const line of lines) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `too long: ${line}`);
  }

  // Unfold, then read it back
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(unfolded, /\r\nMETHOD:PUBLISH\r\n/);
  assert.match(unfolded, /\r\nDTSTART:20261006T090000Z\r\n/);
  assert.match(unfolded, /\r\nDTEND:20261006T093000Z\r\n/);
  assert.match(unfolded, /\r\nDTSTAMP:20260926T190000Z\r\n/);
  assert.match(unfolded, /\r\nUID:slot-2026-10-06-1000@beautasy\.co\.uk\r\n/);
  assert.match(unfolded, /\r\nLOCATION:Beautasy Atelier\\, Southampton\r\n/);
  assert.match(unfolded, /DESCRIPTION:Bring the piece\\, and the shoes you will wear with it\\; to move it\\, WhatsApp us\./);
  assert.equal(/ORGANIZER|ATTENDEE|METHOD:REQUEST/.test(unfolded), false, "not an invitation that wants a reply");
});

test("a long line with a pound sign is folded between characters, never inside one", () => {
  const event = fittingEvent({
    ...base,
    slotStart: "2026-10-06T10:00",
    description: "Take in the sides of a wedding dress, around £85, and shorten the lining ".repeat(3),
  });
  const ics = icsInvite(event, new Date());
  for (const line of ics.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75);
    assert.equal(line.includes("�"), false);
  }
  assert.match(ics.replace(/\r\n /g, ""), /around £85\\, and shorten/);
});

test("text a stranger typed cannot start a line of its own", () => {
  const event = fittingEvent({
    ...base,
    slotStart: "2026-10-06T10:00",
    service: "Hem\rATTENDEE:mailto:victim@example.com\nURL:https://evil.example",
  });
  const ics = icsInvite(event, new Date());
  const withoutLineEnds = ics.replace(/\r\n/g, "");
  assert.equal(withoutLineEnds.includes("\r"), false, "no bare carriage return");
  assert.equal(withoutLineEnds.includes("\n"), false, "no bare line feed");
  const unfolded = ics.replace(/\r\n /g, "");
  assert.equal(/\r\nATTENDEE|\r\nURL/.test(unfolded), false);
});
