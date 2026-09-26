import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SlotPicker, shortDay } from "./SlotPicker";
import type { SlotDay } from "@/lib/slots";

/**
 * The Studio's hand on the diary: "Book by hand" and "Move to another time".
 * The claim and the move themselves are measured in src/lib/diary.test.ts;
 * this holds the glue — who may call the route, which diary it reads, and
 * what it answers when something goes wrong.
 */

const ROOT = process.cwd();
const ROUTE = readFileSync(join(ROOT, "src/app/api/studio/diary/route.ts"), "utf8");
const ACTION = readFileSync(join(ROOT, "src/sanity/moveBookingAction.tsx"), "utf8");
const CONFIG = readFileSync(join(ROOT, "sanity.config.ts"), "utf8");
const STRUCTURE = readFileSync(join(ROOT, "src/sanity/structure.ts"), "utf8");
const SCHEMA = readFileSync(join(ROOT, "src/sanity/schemaTypes/atelierBooking.ts"), "utf8");

const DAYS: SlotDay[] = [
  {
    date: "2026-10-06",
    label: "Tuesday 6 October",
    slots: [
      { start: "2026-10-06T09:00", label: "9:00am" },
      { start: "2026-10-06T14:00", label: "2:00pm" },
    ],
  },
  { date: "2026-10-07", label: "Wednesday 7 October", slots: [{ start: "2026-10-07T10:00", label: "10:00am" }] },
];

test("the picker shows the days and the chosen day's times, with the choice marked", () => {
  const html = renderToStaticMarkup(
    createElement(SlotPicker, { days: DAYS, value: "2026-10-06T14:00", onChange: () => {} })
  );
  assert.match(html, />Tue 6 Oct</);
  assert.match(html, />Wed 7 Oct</);
  assert.match(html, /aria-pressed="true"[^>]*>2:00pm</);
  assert.match(html, /aria-pressed="false"[^>]*>9:00am</);
  assert.doesNotMatch(html, />10:00am</, "only the chosen day's times");
});

test("with no free times the picker says where to look", () => {
  const html = renderToStaticMarkup(createElement(SlotPicker, { days: [], value: null, onChange: () => {} }));
  assert.match(html, /No free times/);
  assert.match(html, /Fitting Times/);
});

test("a short day label is the calendar day, whatever the viewer's time zone", () => {
  assert.equal(shortDay("2026-10-25"), "Sun 25 Oct");
  assert.equal(shortDay("2026-03-29"), "Sun 29 Mar");
});

test("only a member of the project reaches the diary, before anything is read or written", () => {
  const member = ROUTE.indexOf("isProjectMember(token)");
  assert.ok(member > -1, "the route must ask Sanity who is calling");
  for (const step of ["getAvailableSlots(", "claimSlot(", "moveBooking(", "store.read("]) {
    const at = ROUTE.indexOf(step);
    assert.ok(at > member, `${step} must come after the membership check`);
  }
  assert.match(ROUTE, /if \(!fromThisSite\(req\)\)/);
});

test("the Studio books from the fresh diary, strictly, without the customers' notice period", () => {
  assert.match(ROUTE, /getAvailableSlots\(\{ fresh: true, strict: true, leadTimeHours: 0 \}\)/);
  assert.match(ROUTE, /if \(!slotIsOffered\(days, slot\)\)/);
});

test("a booking made by hand goes through the same claim as one made on the site", () => {
  assert.match(ROUTE, /const claim = await claimSlot\(store, doc, now\);/);
  assert.match(ROUTE, /_id: slotDocumentId\(slot\),/);
  assert.match(ROUTE, /if \(claim === "failed"\) return answer\(500/, "an outage is not a taken time");
});

test("a move takes the new time before letting go of the old one, and only for a live booking", () => {
  assert.match(ROUTE, /if \(!canMove\(from\.status\)\)/);
  assert.match(ROUTE, /const moved = await moveBooking\(store, \{ from, to, now \}\);/);
  assert.match(ROUTE, /if \(moved === "failed"\) return answer\(500/);
});

test("the move is not offered over unpublished changes, and it asks the diary route", () => {
  assert.match(ACTION, /disabled: Boolean\(props\.draft\)/);
  assert.match(ACTION, /askDiary\(token, \{ action: "move", id, slot \}\)/);
  assert.match(CONFIG, /return \[\.\.\.prev, moveBookingAction, notifyCustomerAction, revealContactAction\];/);
  assert.match(STRUCTURE, /\.title\("Book by hand"\)/);
});

test("a booked time cannot be changed by typing — Confirmed For is read-only once there is a slot", () => {
  assert.match(SCHEMA, /name: "confirmedFor",[\s\S]*?readOnly: \(\{ document \}\) => Boolean\(document\?\.slotStart\)/);
  assert.match(SCHEMA, /\{ title: "Client cancelled — frees the time", value: "cancelled" \}/);
});
