import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarUid, eveningBefore, fittingEvent, googleCalendarLink, icsInvite, sequenceAt, utcStamp } from "./bookingCalendar";

const base = {
  minutes: 30,
  bring: "bring the piece & your shoes",
  location: "Beautasy Atelier, Southampton",
  description: "Bring the piece, and the shoes you will wear with it; to move it, WhatsApp us.",
};

/** The .ics as one line per property, folding undone */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");
const alarms = (ics: string) => [...unfold(ics).matchAll(/BEGIN:VALARM\r\n([\s\S]*?)END:VALARM/g)].map((m) => /TRIGGER:(\S+)/.exec(m[1])?.[1]);

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

test("a booking keeps one event through every move: named by when it was made, not by its slot", () => {
  // Without the moment it was made, the slot names it, as before
  assert.equal(fittingEvent({ ...base, slotStart: "2026-10-06T10:00" }).uid, "slot-2026-10-06-1000@beautasy.co.uk");
  // With it, the same name at any time — the invite for a moved booking updates the event
  const made = "2026-10-01T08:15:30.123Z";
  const first = fittingEvent({ ...base, slotStart: "2026-10-06T10:00", uid: calendarUid(made, "2026-10-06T10:00") });
  const moved = fittingEvent({ ...base, slotStart: "2026-10-09T15:30", uid: calendarUid(made, "2026-10-09T15:30") });
  assert.equal(first.uid, "booking-20261001T081530123Z@beautasy.co.uk");
  assert.equal(first.uid, moved.uid);
  // Two bookings made at different moments are two events
  assert.notEqual(calendarUid("2026-10-01T08:15:30.124Z", "2026-10-06T10:00"), first.uid);
  // Nonsense in createdAt falls back to the slot rather than "booking-NaN"
  assert.equal(calendarUid("not a date", "2026-10-06T10:00"), "slot-2026-10-06-1000@beautasy.co.uk");
  // A later invite is a newer version of the same event
  assert.ok(sequenceAt(new Date(Date.UTC(2026, 9, 2))) > sequenceAt(new Date(Date.UTC(2026, 9, 1))));
});

test("the title says what to bring — it is the one line a reminder shows", () => {
  const event = fittingEvent({ ...base, bring: "bring dress, wedding shoes & underwear", slotStart: "2026-10-06T10:00" });
  assert.equal(event.title, "Beautasy fitting · bring dress, wedding shoes & underwear");
  const url = new URL(googleCalendarLink(event));
  assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("dates"), "20261006T090000Z/20261006T093000Z");
  assert.equal(url.searchParams.get("text"), "Beautasy fitting · bring dress, wedding shoes & underwear");
  assert.equal(url.searchParams.get("location"), "Beautasy Atelier, Southampton");
});

test("two alarms: two hours before first (Outlook keeps only the first), then 7pm the evening before", () => {
  const sent = new Date(Date.UTC(2026, 8, 26, 19, 0, 0));
  // 10:00 on Tuesday 6 October (BST): 7pm on Monday is 15 hours before
  assert.deepEqual(alarms(icsInvite(fittingEvent({ ...base, slotStart: "2026-10-06T10:00" }), sent)), ["-PT2H", "-PT900M"]);
  // Across the clock change: 7pm BST on Saturday 24th to 11:00 GMT on Sunday 25th is 17 hours, not 16
  assert.equal(utcStamp(eveningBefore("2026-10-25T11:00")), "20261024T180000Z");
  assert.deepEqual(alarms(icsInvite(fittingEvent({ ...base, slotStart: "2026-10-25T11:00" }), sent)), ["-PT2H", "-PT1020M"]);
  // And into summer time: 7pm GMT on Saturday 27 March 2027 to 10:00 BST on Sunday is 14 hours
  assert.deepEqual(alarms(icsInvite(fittingEvent({ ...base, slotStart: "2027-03-28T10:00" }), sent)), ["-PT2H", "-PT840M"]);
  // A month's first day: the evening before is the last of the month before
  assert.equal(utcStamp(eveningBefore("2026-11-01T10:00")), "20261031T190000Z");
});

test("once 7pm the evening before has passed, the invite carries only the alarm on the day", () => {
  const event = fittingEvent({ ...base, slotStart: "2026-10-06T10:00" });
  assert.deepEqual(alarms(icsInvite(event, new Date(Date.UTC(2026, 9, 5, 17, 59)))), ["-PT2H", "-PT900M"], "6:59pm: still to come");
  assert.deepEqual(alarms(icsInvite(event, new Date(Date.UTC(2026, 9, 5, 18, 0)))), ["-PT2H"], "7pm: gone");
  assert.deepEqual(alarms(icsInvite(event, new Date(Date.UTC(2026, 9, 6, 8, 0)))), ["-PT2H"], "booked that morning");
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

  const unfolded = unfold(ics);
  assert.match(unfolded, /\r\nMETHOD:PUBLISH\r\n/);
  assert.match(unfolded, /\r\nDTSTART:20261006T090000Z\r\n/);
  assert.match(unfolded, /\r\nDTEND:20261006T093000Z\r\n/);
  assert.match(unfolded, /\r\nDTSTAMP:20260926T190000Z\r\n/);
  assert.match(unfolded, new RegExp(`\\r\\nSEQUENCE:${sequenceAt(now)}\\r\\n`));
  assert.match(unfolded, /\r\nUID:slot-2026-10-06-1000@beautasy\.co\.uk\r\n/);
  assert.match(unfolded, /\r\nSUMMARY:Beautasy fitting · bring the piece & your shoes\r\n/);
  assert.match(unfolded, /\r\nLOCATION:Beautasy Atelier\\, Southampton\r\n/);
  assert.match(unfolded, /DESCRIPTION:Bring the piece\\, and the shoes you will wear with it\\; to move it\\, WhatsApp us\./);
  assert.equal(/ORGANIZER|ATTENDEE|METHOD:REQUEST|TRIGGER;VALUE=DATE-TIME|RELATED=/.test(unfolded), false, "not an invitation; durations only");
  // Every alarm is a whole one, as RFC 5545 asks of a DISPLAY alarm
  for (const [, body] of unfolded.matchAll(/BEGIN:VALARM\r\n([\s\S]*?)END:VALARM/g)) {
    assert.match(body, /^ACTION:DISPLAY\r\nTRIGGER:-PT\d+[HM]\r\nDESCRIPTION:.+\r\n$/);
  }
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
  assert.match(unfold(ics), /around £85\\, and shorten/);
});

test("text a stranger typed cannot start a line of its own", () => {
  const event = fittingEvent({
    ...base,
    slotStart: "2026-10-06T10:00",
    description: "Hem\rATTENDEE:mailto:victim@example.com\nURL:https://evil.example",
  });
  const ics = icsInvite(event, new Date());
  const withoutLineEnds = ics.replace(/\r\n/g, "");
  assert.equal(withoutLineEnds.includes("\r"), false, "no bare carriage return");
  assert.equal(withoutLineEnds.includes("\n"), false, "no bare line feed");
  assert.equal(/\r\nATTENDEE|\r\nURL/.test(unfold(ics)), false);
});
