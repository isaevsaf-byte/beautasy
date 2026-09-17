import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POSTING_DEFAULTS,
  MIN_GAP_HOURS,
  inQuietHours,
  mayPublish,
  postingSettingsFrom,
  southamptonHour,
  startOfSouthamptonDay,
} from "./postingRules";

const at = (iso: string) => new Date(iso);
const settings = { ...POSTING_DEFAULTS }; // 1 a day, quiet 22:00–08:00
const open = (overrides: Partial<Parameters<typeof mayPublish>[0]> = {}) =>
  mayPublish({
    now: at("2026-09-17T12:00:00Z"), // 13:00 in Southampton, summer time
    settings,
    publishedToday: 0,
    lastPublishedAt: null,
    inFlight: 0,
    ...overrides,
  });

/* ── Southampton time, both seasons ── */

test("the hour is read on a Southampton clock, not the server's", () => {
  assert.equal(southamptonHour(at("2026-09-17T21:30:00Z")), 22); // BST
  assert.equal(southamptonHour(at("2026-12-01T21:30:00Z")), 21); // GMT
  assert.equal(southamptonHour(at("2026-09-16T23:30:00Z")), 0); // midnight is 0, not 24
});

test("quiet hours start at 22:00 local in summer and in winter alike", () => {
  assert.equal(inQuietHours(at("2026-09-17T20:59:00Z"), settings), false); // 21:59 BST
  assert.equal(inQuietHours(at("2026-09-17T21:00:00Z"), settings), true); //  22:00 BST
  assert.equal(inQuietHours(at("2026-12-01T21:59:00Z"), settings), false); // 21:59 GMT
  assert.equal(inQuietHours(at("2026-12-01T22:00:00Z"), settings), true); //  22:00 GMT
});

test("quiet hours run through midnight and end at 08:00", () => {
  assert.equal(inQuietHours(at("2026-09-17T02:00:00Z"), settings), true); // 03:00
  assert.equal(inQuietHours(at("2026-09-17T06:59:00Z"), settings), true); // 07:59
  assert.equal(inQuietHours(at("2026-09-17T07:00:00Z"), settings), false); // 08:00
});

test("a window inside the day works as well as one across midnight", () => {
  const lunch = { ...settings, quietFrom: 12, quietUntil: 14 };
  assert.equal(inQuietHours(at("2026-09-17T11:30:00Z"), lunch), true); // 12:30
  assert.equal(inQuietHours(at("2026-09-17T13:00:00Z"), lunch), false); // 14:00
  assert.equal(inQuietHours(at("2026-09-17T09:00:00Z"), lunch), false); // 10:00
});

test("switched off, or from and until the same hour, means no quiet hours", () => {
  const night = at("2026-09-17T01:00:00Z");
  assert.equal(inQuietHours(night, { ...settings, quietHoursEnabled: false }), false);
  assert.equal(inQuietHours(night, { ...settings, quietFrom: 9, quietUntil: 9 }), false);
});

test("the day starts at Southampton midnight", () => {
  assert.equal(startOfSouthamptonDay(at("2026-09-17T12:00:00Z")).toISOString(), "2026-09-16T23:00:00.000Z");
  assert.equal(startOfSouthamptonDay(at("2026-12-01T12:00:00Z")).toISOString(), "2026-12-01T00:00:00.000Z");
  // 00:30 BST on the 17th is still the 17th, though UTC says the 16th
  assert.equal(startOfSouthamptonDay(at("2026-09-16T23:30:00Z")).toISOString(), "2026-09-16T23:00:00.000Z");
  // the day the clocks go back is 25 hours long and still starts at midnight BST
  assert.equal(startOfSouthamptonDay(at("2026-10-25T20:00:00Z")).toISOString(), "2026-10-24T23:00:00.000Z");
});

/* ── The verdict ── */

test("an open afternoon with nothing posted lets a post go", () => {
  assert.deepEqual(open(), { ok: true });
});

test("quiet hours hold a post that is due", () => {
  assert.deepEqual(open({ now: at("2026-09-17T21:21:00Z") }), { ok: false, hold: "quiet-hours" });
});

test("the daily number is respected, and a higher number lets more through", () => {
  assert.deepEqual(open({ publishedToday: 1 }), { ok: false, hold: "daily-limit" });
  const two = { ...settings, postsPerDay: 2 };
  assert.deepEqual(open({ settings: two, publishedToday: 1, lastPublishedAt: "2026-09-17T07:00:00Z" }), { ok: true });
  assert.deepEqual(open({ settings: two, publishedToday: 2 }), { ok: false, hold: "daily-limit" });
});

test(`two automatic posts are at least ${MIN_GAP_HOURS} hours apart`, () => {
  const two = { ...settings, postsPerDay: 2 };
  assert.deepEqual(
    open({ settings: two, publishedToday: 1, lastPublishedAt: "2026-09-17T10:00:00Z" }),
    { ok: false, hold: "too-soon" }
  );
  assert.deepEqual(
    open({ settings: two, publishedToday: 1, lastPublishedAt: "2026-09-17T09:00:00Z" }),
    { ok: true }
  );
});

test("yesterday's late post does not use up today", () => {
  // Posted 21:50 yesterday; today's first may go at 08:00 — the old 20-hour
  // rule would have held it until the evening.
  assert.deepEqual(
    open({ now: at("2026-09-17T07:04:00Z"), publishedToday: 0, lastPublishedAt: "2026-09-16T20:50:00Z" }),
    { ok: true }
  );
});

test("nothing new starts while another post is still going out", () => {
  assert.deepEqual(open({ inFlight: 1 }), { ok: false, hold: "in-flight" });
});

/* ── Settings as saved ── */

test("fields Kristina never touched mean the defaults", () => {
  assert.deepEqual(postingSettingsFrom(null), POSTING_DEFAULTS);
  assert.deepEqual(postingSettingsFrom({}), POSTING_DEFAULTS);
});

test("a nonsense daily number can never stop posting altogether or flood the feed", () => {
  assert.equal(postingSettingsFrom({ postsPerDay: 0 }).postsPerDay, 1);
  assert.equal(postingSettingsFrom({ postsPerDay: -3 }).postsPerDay, 1);
  assert.equal(postingSettingsFrom({ postsPerDay: 40 }).postsPerDay, 5);
  assert.equal(postingSettingsFrom({ postsPerDay: "2" }).postsPerDay, 2);
});

test("hours outside the clock are pulled back onto it", () => {
  const s = postingSettingsFrom({ quietFrom: 25, quietUntil: -1 });
  assert.equal(s.quietFrom, 23);
  assert.equal(s.quietUntil, 0);
});

test("quiet hours stay on unless explicitly switched off", () => {
  assert.equal(postingSettingsFrom({ quietHoursEnabled: undefined }).quietHoursEnabled, true);
  assert.equal(postingSettingsFrom({ quietHoursEnabled: false }).quietHoursEnabled, false);
});
