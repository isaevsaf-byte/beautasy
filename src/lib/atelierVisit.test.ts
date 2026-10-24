import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { atelierVisit } from "./atelierVisit";
import { LATE_GRACE_MINUTES, LATE_RULE } from "./business";
import { bookingEmailHtml, bookingInvite, reminderEmailHtml, type NotifiableBooking } from "./bookingEmails";
import { replyToCustomerHtml } from "../app/api/atelier-booking/route";
import { closureCovers, closureLastDay, generateSlots, type Schedule } from "./slots";

/**
 * 24.10.2026: a booked customer is sent where to go — the street address, the
 * way to the door and the route in Maps — in the confirmation, the reminder
 * and the calendar invite, so Kristina no longer messages each one. And the
 * rule about running late is said before booking and in every one of those.
 *
 * The address used is invented. 🚨 The real one is set only in Vercel.
 */

const ADDRESS = "1 Example Lane, Southampton SO00 0XX";

/** The emails as they are with the address set in the environment, then without it again */
function withAddress<T>(env: { ATELIER_ADDRESS?: string; ATELIER_DIRECTIONS?: string }, run: () => T): T {
  const saved = { address: process.env.ATELIER_ADDRESS, directions: process.env.ATELIER_DIRECTIONS };
  const put = (key: "ATELIER_ADDRESS" | "ATELIER_DIRECTIONS", value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  put("ATELIER_ADDRESS", env.ATELIER_ADDRESS);
  put("ATELIER_DIRECTIONS", env.ATELIER_DIRECTIONS);
  try {
    return run();
  } finally {
    put("ATELIER_ADDRESS", saved.address);
    put("ATELIER_DIRECTIONS", saved.directions);
  }
}

const booked: NotifiableBooking = {
  _id: "pending",
  _rev: "pending",
  status: "confirmed",
  displayName: "Anna",
  service: "Alterations",
  confirmedFor: "Tuesday 6 October at 10:00am",
  slotStart: "2026-10-06T10:00",
  slotMinutes: 30,
  createdAt: "2026-10-01T09:00:00.000Z",
};

const icsOf = (booking: NotifiableBooking) => {
  const invite = bookingInvite(booking, new Date(Date.UTC(2026, 9, 1, 9)));
  assert.ok(invite);
  // Folded at 75 characters as the format wants: unfolded, so a long line reads whole
  return Buffer.from(invite.content, "base64").toString("utf8").replace(/\r\n /g, "");
};

test("the address is read from the server's settings, tidied, and refused when it cannot be one", () => {
  assert.equal(atelierVisit({}), null, "not set: nothing");
  assert.equal(atelierVisit({ ATELIER_ADDRESS: "  SO17 " }), null, "too short to be an address: nothing, rather than a wrong door");
  const visit = atelierVisit({ ATELIER_ADDRESS: " 1 Example Lane\n  Southampton \r\nSO00 0XX ", ATELIER_DIRECTIONS: "Side gate,\nring the bell" });
  assert.deepEqual(visit, {
    address: "1 Example Lane, Southampton, SO00 0XX",
    directions: "Side gate, ring the bell",
    maps: "https://www.google.com/maps/dir/?api=1&destination=1%20Example%20Lane%2C%20Southampton%2C%20SO00%200XX",
  });
  assert.equal("directions" in atelierVisit({ ATELIER_ADDRESS: ADDRESS })!, false, "no directions: none said");
});

test("the confirmation carries the address, the way to the door, the route, and the rule about lateness", () => {
  const html = withAddress({ ATELIER_ADDRESS: ADDRESS, ATELIER_DIRECTIONS: "Side gate on the left — ring the bell" }, () => bookingEmailHtml(booked, "confirmed"));
  assert.match(html, /<strong>1 Example Lane, Southampton SO00 0XX<\/strong><br\/>Side gate on the left — ring the bell/);
  assert.match(html, /href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=1%20Example%20Lane%2C%20Southampton%20SO00%200XX"/);
  assert.doesNotMatch(html, /will send you the exact address/, "nothing left for Kristina to send");
  assert.match(html.replace(/&#39;|&#x27;/g, "'"), /Running late\?<\/p>\s*<p[^>]*>We hold your time for 15 minutes\. After that it's given up, and you'll need to book a new one\. If you're held up, WhatsApp Kristina/);
  // The same in the reminder the day before
  const reminder = withAddress({ ATELIER_ADDRESS: ADDRESS }, () => reminderEmailHtml(booked));
  assert.match(reminder, /<strong>1 Example Lane, Southampton SO00 0XX<\/strong>/);
  assert.match(reminder, /We hold your time for 15 minutes/);
});

test("the calendar invite opens on the door, and says the rule", () => {
  const ics = withAddress({ ATELIER_ADDRESS: ADDRESS, ATELIER_DIRECTIONS: "Side gate" }, () => icsOf(booked));
  assert.match(ics, /LOCATION:1 Example Lane\\, Southampton SO00 0XX/);
  assert.match(ics, /Address: 1 Example Lane\\, Southampton SO00 0XX\. Side gate\./);
  assert.match(ics, /We hold your time for 15 minutes/);
  assert.doesNotMatch(ics, /will send you the exact address/);
  // Not set: as before, and still the rule
  const before = withAddress({}, () => icsOf(booked));
  assert.match(before, /LOCATION:Beautasy Atelier\\, Southampton/);
  assert.match(before, /She will send you the exact address before your visit/);
  assert.match(before, /We hold your time for 15 minutes/);
});

test("without the setting, the emails say Kristina sends it — as they did", () => {
  const html = withAddress({}, () => bookingEmailHtml(booked, "confirmed"));
  assert.match(html, /will send you the exact address and how to find the door before your visit/);
  assert.doesNotMatch(html, /maps\/dir/);
  assert.match(html, /We hold your time for 15 minutes/);
});

test("🚨 the home address goes only with a confirmed visit to the atelier", () => {
  withAddress({ ATELIER_ADDRESS: ADDRESS }, () => {
    for (const status of ["declined", "completed", "cancelled"] as const) {
      assert.doesNotMatch(bookingEmailHtml({ ...booked, status }, status as never), /Example Lane/, status);
    }
    // Collect & return: Kristina goes to them — her address has no business in their email or calendar
    const collection: NotifiableBooking = {
      ...booked,
      service: "Hem",
      collection: { district: "SO17", zone: "near", terms: "Free collection" },
      slotEnd: "2026-10-06T11:00",
    };
    assert.doesNotMatch(bookingEmailHtml(collection, "confirmed"), /Example Lane/);
    const invite = bookingInvite(collection, new Date(Date.UTC(2026, 9, 1, 9)));
    if (invite) assert.doesNotMatch(Buffer.from(invite.content, "base64").toString("utf8"), /Example Lane/);
  });
});

test("what is typed into the setting stays text in the email", () => {
  const html = withAddress({ ATELIER_ADDRESS: `1 <b>Lane</b> & "Co", Southampton`, ATELIER_DIRECTIONS: "<script>x</script>" }, () => bookingEmailHtml(booked, "confirmed"));
  assert.match(html, /1 &lt;b&gt;Lane&lt;\/b&gt; &amp; &quot;Co&quot;, Southampton/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>x/);
});

test("Kristina's own email stops asking her to send the address once the customer has it", () => {
  const sent = replyToCustomerHtml({ name: "Anna Smith", phone: "07700 900123", slot: "2026-10-06T10:00", service: "Alterations", addressSent: true });
  assert.match(sent, /already has the address, the way to the door and the 15-minute rule — nothing to send/);
  assert.doesNotMatch(sent, /Send Anna the address/);
  // The WhatsApp hello she taps, read the way the app reads it
  const hello = (html: string) => decodeURIComponent(html.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, "&"));
  assert.doesNotMatch(hello(sent), /Here's how to find me/);
  assert.match(hello(sent), /Looking forward to seeing you on/);
  const asked = replyToCustomerHtml({ name: "Anna Smith", phone: "07700 900123", slot: "2026-10-06T10:00", service: "Alterations" });
  assert.match(asked, /Send Anna the address/);
  assert.match(hello(asked), /Here's how to find me: /);
  const request = replyToCustomerHtml({ name: "Anna", service: "Alterations", addressSent: true });
  assert.match(request, /their email gives them the address and the way to the door/);
});

test("the rule is one number, said the same everywhere — the form included", () => {
  assert.equal(LATE_GRACE_MINUTES, 15);
  assert.match(LATE_RULE, /^We hold your time for 15 minutes\./);
  const form = readFileSync(join(process.cwd(), "src", "components", "AtelierBookingForm.tsx"), "utf8");
  assert.match(form, /Running late\? \{LATE_RULE\}/, "said under the Book button");
  assert.match(form, /\{LATE_RULE\}<\/p>/, "and again once booked");
});

// ─── A trip away: a range of days closed at once

const week: Schedule = {
  enabled: true,
  slotMinutes: 60,
  leadTimeHours: 0,
  horizonDays: 14,
  weekly: (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) => ({ day, from: "10:00", to: "12:00" })),
  closures: [],
};

/** The days the picker offers, from a Monday morning */
function offered(closures: Schedule["closures"]): string[] {
  return generateSlots({ schedule: { ...week, closures }, now: new Date("2026-11-02T07:00:00Z") }).map((day) => day.date);
}

test("away from the 4th to the 7th: none of those days is offered, and the days around them are", () => {
  const days = offered([{ date: "2026-11-04", until: "2026-11-07", note: "В отъезде" }]);
  for (const date of ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]) assert.ok(!days.includes(date), date);
  for (const date of ["2026-11-03", "2026-11-08"]) assert.ok(days.includes(date), date);
  // «По» before «Дата» is the one day, never a closed fortnight
  const typo = offered([{ date: "2026-11-04", until: "2026-11-01" }]);
  assert.ok(!typo.includes("2026-11-04"));
  assert.ok(typo.includes("2026-11-03") && typo.includes("2026-11-05"));
  assert.equal(closureLastDay({ date: "2026-11-04", until: null }), "2026-11-04");
});

test("a part of each day across a range closes that part only", () => {
  const closure = { date: "2026-11-04", until: "2026-11-05", from: "10:00", to: "11:00" };
  assert.equal(closureCovers(closure, "2026-11-04T10:00"), true);
  assert.equal(closureCovers(closure, "2026-11-05T10:30"), true);
  assert.equal(closureCovers(closure, "2026-11-05T11:00"), false, "the end is open");
  assert.equal(closureCovers(closure, "2026-11-06T10:00"), false);
  assert.equal(closureCovers({ date: "2026-11-04" }, "2026-11-04T16:00"), true, "a whole day");
  assert.equal(closureCovers({ date: "2026-11-04" }, "garbage"), false);
});

test("the diary reads the range from the Studio", () => {
  const schedule = readFileSync(join(process.cwd(), "src", "lib", "schedule.ts"), "utf8");
  assert.match(schedule, /"closures": closures\[\]\{ date, until, from, to, note \}/);
});
