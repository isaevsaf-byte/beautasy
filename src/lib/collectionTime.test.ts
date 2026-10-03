import { test } from "node:test";
import assert from "node:assert/strict";
import { planCollection } from "./collectionTime";
import { timeLabel, type SlotDay } from "./slots";
import type { DiaryDoc } from "./diary";

/**
 * "🚗 Назначить забор" decides here, so each rule Kristina relies on is run,
 * not read off the route: the trip lengths she can pick, what counts as a
 * collection, and that the whole trip is free — its own slots counting as its
 * own.
 */

const NOW = "2026-10-03T10:00:00.000Z";
const NOW_MS = Date.parse(NOW);

/** Tuesday 6 October, 1pm to 5pm, with 3:30pm booked by a fitting. */
function tuesday(free: string[]): SlotDay[] {
  return [
    {
      date: "2026-10-06",
      label: "Tuesday 6 October",
      slots: free.map((t) => ({ start: `2026-10-06T${t}`, label: timeLabel(t) })),
    },
  ];
}
const AFTERNOON = tuesday(["13:00", "13:30", "14:00", "14:30", "15:00", "16:00", "16:30"]);

const request: DiaryDoc = {
  _id: "req-anna",
  _rev: "r1",
  _type: "atelierBooking",
  status: "new",
  displayName: "Anna",
  service: "Curtains",
  collection: { district: "SO17", zone: "Southampton", terms: "Free" },
};

const plan = (overrides: Partial<Parameters<typeof planCollection>[0]> = {}) =>
  planCollection({
    from: request,
    slot: "2026-10-06T14:00",
    minutes: 60,
    days: AFTERNOON,
    slotMinutes: 30,
    now: NOW,
    nowMs: NOW_MS,
    ...overrides,
  });

test("only the trip lengths Kristina can pick are taken", () => {
  assert.equal(plan().ok, true);
  for (const minutes of [45, 0, -30, 10000, Number.NaN, "60", "60abc", null, undefined]) {
    const result = plan({ minutes });
    assert.equal(result.ok, false, `took ${String(minutes)} minutes`);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.match(result.error, /сколько займёт поездка/);
    }
  }
});

test("only a live collection request can be given a trip", () => {
  const gone = plan({ from: null });
  assert.equal(gone.ok, false);
  if (!gone.ok) assert.equal(gone.status, 404);

  const fitting = plan({ from: { ...request, collection: undefined } });
  assert.equal(fitting.ok, false, "a fitting was given a collection's span");
  if (!fitting.ok) assert.match(fitting.error, /не заявка на забор/);

  const finished = plan({ from: { ...request, status: "completed" } });
  assert.equal(finished.ok, false);
  if (!finished.ok) assert.match(finished.error, /Выполнена/);
});

test("the whole trip must be free, not just its start", () => {
  // 2pm for two hours runs into the fitting at 3:30
  const over = plan({ minutes: 120 });
  assert.equal(over.ok, false, "a trip was put over a booked fitting");
  if (!over.ok) {
    assert.equal(over.status, 409);
    assert.equal(over.slotTaken, true);
  }
  assert.equal(plan({ minutes: 90 }).ok, true, "2pm to 3:30 fits");
});

test("a new time is a copy at that slot with the whole trip on it", () => {
  const result = plan({ minutes: 120, slot: "2026-10-06T13:00" });
  assert.ok(result.ok && !result.inPlace);
  if (!result.ok || result.inPlace) return;
  assert.equal(result.end, "2026-10-06T15:00");
  assert.equal(result.to._id, "slot-2026-10-06-1300");
  assert.equal(result.to.slotStart, "2026-10-06T13:00");
  assert.equal(result.to.slotEnd, "2026-10-06T15:00");
  assert.equal(result.to.confirmedFor, "Tuesday 6 October, between 1:00pm and 3:00pm");
  assert.deepEqual(result.to.collection, request.collection, "the copy forgot it is a collection");
});

test("a timed collection can keep its start and take longer, its own slots counting as free", () => {
  const held: DiaryDoc = {
    ...request,
    _id: "slot-2026-10-06-1400",
    status: "confirmed",
    slotStart: "2026-10-06T14:00",
    slotEnd: "2026-10-06T15:00",
  };
  // The diary does not offer 2pm or 2:30 — the collection itself holds them
  const days = tuesday(["13:00", "13:30", "15:00", "16:00", "16:30"]);
  const longer = plan({ from: held, days, minutes: 90 });
  assert.ok(longer.ok && longer.inPlace, "a longer trip from the same start was refused");
  if (longer.ok) assert.equal(longer.end, "2026-10-06T15:30");

  const same = plan({ from: held, days, minutes: 60 });
  assert.equal(same.ok, false, "the same trip again is no change");

  // Half an hour earlier runs into its own 2pm, which is its own to use
  const earlier = plan({ from: held, days, minutes: 60, slot: "2026-10-06T13:30" });
  assert.ok(earlier.ok && !earlier.inPlace);
});

test("a cancelled collection booked again at its old start must find its whole trip free", () => {
  const cancelled: DiaryDoc = {
    ...request,
    _id: "slot-2026-10-06-1400",
    status: "cancelled",
    slotStart: "2026-10-06T14:00",
    slotEnd: "2026-10-06T15:00",
  };
  // Since it was cancelled, somebody booked a fitting at 2:30
  const days = tuesday(["13:00", "13:30", "14:00", "15:00", "16:00"]);
  const hour = plan({ from: cancelled, days, minutes: 60 });
  assert.equal(hour.ok, false, "a cancelled collection took back a time a fitting now holds");
  const half = plan({ from: cancelled, days, minutes: 30 });
  assert.ok(half.ok && half.inPlace, "the free half hour at its own start was refused");
});

test("a start already gone is not offered from the collection's own slots", () => {
  const held: DiaryDoc = {
    ...request,
    _id: "slot-2026-10-06-1400",
    status: "confirmed",
    slotStart: "2026-10-06T14:00",
    slotEnd: "2026-10-06T15:00",
  };
  const later = Date.parse("2026-10-06T13:45:00Z"); // 2:45pm in Southampton
  const result = plan({ from: held, days: tuesday(["15:00", "16:00"]), minutes: 90, nowMs: later });
  assert.equal(result.ok, false);
});
