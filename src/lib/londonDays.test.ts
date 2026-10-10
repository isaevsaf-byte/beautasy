import { test } from "node:test";
import assert from "node:assert/strict";
import { addDaysTo, addMonthsTo, isDayString, londonDays, londonToday } from "./londonDays";
import { localDateOf } from "./slots";

/**
 * Southampton's days around the two Sundays the clocks change in 2026:
 * 29 March (GMT → BST at 01:00 UTC) and 25 October (BST → GMT at 01:00 UTC).
 */

test("'today' is Southampton's date, not the server's, either side of midnight", () => {
  // 11:30pm UTC on Saturday 24 October is 12:30am on Sunday in British Summer Time
  assert.equal(londonToday(new Date("2026-10-24T23:30:00Z")), "2026-10-25");
  // A day later the clocks have gone back, and 11:30pm UTC is 11:30pm in London
  assert.equal(londonToday(new Date("2026-10-25T23:30:00Z")), "2026-10-25");
  // In spring the other way: still GMT at 11:30pm on the 28th, BST by the 29th
  assert.equal(londonToday(new Date("2026-03-28T23:30:00Z")), "2026-03-28");
  assert.equal(londonToday(new Date("2026-03-29T23:30:00Z")), "2026-03-30");
});

test("the nine o'clock cron finds tomorrow by the calendar, across the night the clocks go back", () => {
  // Vercel's 0 9 * * * fires somewhere in the hour after 09:00 UTC
  for (const at of ["2026-10-24T09:00:00Z", "2026-10-24T09:59:00Z"]) {
    assert.deepEqual(londonDays(new Date(at)), { today: "2026-10-24", tomorrow: "2026-10-25", dayAfter: "2026-10-26" }, at);
  }
  assert.deepEqual(londonDays(new Date("2026-10-25T09:30:00Z")), { today: "2026-10-25", tomorrow: "2026-10-26", dayAfter: "2026-10-27" });
  assert.deepEqual(londonDays(new Date("2026-03-28T09:30:00Z")), { today: "2026-03-28", tomorrow: "2026-03-29", dayAfter: "2026-03-30" });

  // Why not "now plus 24 hours": late on the Saturday that lands on the same Sunday
  const lateSaturday = new Date("2026-10-24T23:30:00Z"); // 12:30am Sunday, BST
  assert.equal(localDateOf(new Date(lateSaturday.getTime() + 86_400_000)), "2026-10-25", "24 hours on is still Sunday");
  assert.equal(londonDays(lateSaturday).tomorrow, "2026-10-26", "tomorrow is Monday");
});

test("days and months are calendar arithmetic, with a missing date falling to the month's end", () => {
  assert.equal(addDaysTo("2026-10-25", 1), "2026-10-26");
  assert.equal(addDaysTo("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysTo("2026-03-01", -1), "2026-02-28");
  assert.equal(addMonthsTo("2026-10-10", 12), "2027-10-10");
  assert.equal(addMonthsTo("2026-10-10", 24), "2028-10-10");
  assert.equal(addMonthsTo("2028-02-29", 24), "2030-02-28", "a day early, never late");
  assert.equal(addMonthsTo("2028-02-29", 48), "2032-02-29");
  assert.equal(addMonthsTo("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsTo("2026-10-10", -11), "2025-11-10");
  assert.equal(addMonthsTo("2027-01-15", -12), "2026-01-15");
});

test("a day is a real date written as one", () => {
  assert.equal(isDayString("2026-10-25"), true);
  assert.equal(isDayString("2028-02-29"), true);
  for (const bad of ["2026-02-30", "2027-02-29", "2026-13-01", "2026-10-25T14:00", "25/10/2026", "", 20261025, null]) {
    assert.equal(isDayString(bad), false, String(bad));
  }
});
