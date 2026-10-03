import { test } from "node:test";
import assert from "node:assert/strict";
import { sanityClient } from "./sanity";
import { TAKEN_QUERY, getAvailableSlots } from "./schedule";

/**
 * The diary as the site reads it, run end to end against a stand-in database:
 * a collection's whole trip must come out of what customers are offered, in
 * whatever slot length the Studio is set to. Each piece is tested on its own
 * elsewhere; this is the wiring between them.
 */

/** Monday 5 October 2026, 9am in Southampton: Tuesday is a day ahead. */
const MONDAY = new Date("2026-10-05T08:00:00Z");

async function offeredOnTuesday(schedule: Record<string, unknown>, taken: unknown[]): Promise<string[]> {
  const real = sanityClient.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sanityClient as any).fetch = async (query: string) => (query === TAKEN_QUERY ? taken : schedule);
  try {
    const { days } = await getAvailableSlots({ now: MONDAY });
    return days.find((day) => day.date === "2026-10-06")?.slots.map((slot) => slot.start) ?? [];
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sanityClient as any).fetch = real;
  }
}

const tuesdayMorning = (slotMinutes: number) => ({
  enabled: true,
  slotMinutes,
  leadTimeHours: 24,
  horizonDays: 7,
  weekly: [{ day: "tue", from: "09:00", to: "12:00" }],
  closures: [],
});

test("a collection's whole trip is taken out of what customers are offered", async () => {
  const offered = await offeredOnTuesday(tuesdayMorning(30), [{ start: "2026-10-06T10:00", end: "2026-10-06T11:00" }]);
  assert.deepEqual(offered, ["2026-10-06T09:00", "2026-10-06T09:30", "2026-10-06T11:00", "2026-10-06T11:30"]);
});

test("the trip is spelt out in the diary's own slot length", async () => {
  // 45-minute slots: 9:00, 9:45, 10:30, 11:15. A trip from 9:00 to 10:30 holds the first two.
  const offered = await offeredOnTuesday(tuesdayMorning(45), [{ start: "2026-10-06T09:00", end: "2026-10-06T10:30" }]);
  assert.deepEqual(offered, ["2026-10-06T10:30", "2026-10-06T11:15"]);
});

test("a fitting still holds its one slot", async () => {
  const offered = await offeredOnTuesday(tuesdayMorning(30), [{ start: "2026-10-06T10:00", end: null }]);
  assert.equal(offered.includes("2026-10-06T10:00"), false);
  assert.equal(offered.includes("2026-10-06T10:30"), true);
});
