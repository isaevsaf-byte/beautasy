import { test } from "node:test";
import assert from "node:assert/strict";
import { OUTSIDE_MAX, outsideWords, planCollection, planOutside } from "./collectionTime";
import { generateSlots, timeLabel, type SlotDay } from "./slots";
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

test("a cancelled collection booked again at its old start and its old length gets its time back", () => {
  const cancelled: DiaryDoc = {
    ...request,
    _id: "slot-2026-10-06-1400",
    status: "cancelled",
    slotStart: "2026-10-06T14:00",
    slotEnd: "2026-10-06T15:00",
  };
  const days = tuesday(["13:00", "13:30", "14:00", "14:30", "15:00"]);
  const again = plan({ from: cancelled, days, minutes: 60 });
  assert.ok(again.ok && again.inPlace, "undoing a cancellation was refused as 'already at this time'");
  if (again.ok) assert.equal(again.end, "2026-10-06T15:00");
});

test("a trip ends on the diary's own slots, whatever their length", () => {
  const hourly: SlotDay[] = [
    {
      date: "2026-10-06",
      label: "Tuesday 6 October",
      slots: ["13:00", "14:00", "15:00"].map((t) => ({ start: `2026-10-06T${t}`, label: timeLabel(t) })),
    },
  ];
  const result = plan({ slotMinutes: 60, minutes: 90, slot: "2026-10-06T13:00", days: hourly });
  assert.ok(result.ok && !result.inPlace);
  if (!result.ok || result.inPlace) return;
  // An hour and a half is two hourly slots: the window told is the one held
  assert.equal(result.end, "2026-10-06T15:00");
  assert.equal(result.to.slotEnd, "2026-10-06T15:00");
  assert.equal(result.to.confirmedFor, "Tuesday 6 October, between 1:00pm and 3:00pm");
});

test("a start that has passed while the dialog stood open is said to have passed, not to be somebody's", () => {
  const held: DiaryDoc = {
    ...request,
    _id: "slot-2026-10-06-1400",
    status: "confirmed",
    slotStart: "2026-10-06T14:00",
    slotEnd: "2026-10-06T15:00",
  };
  const twoMinutesPast = Date.parse("2026-10-06T13:02:00Z"); // 2:02pm in Southampton
  const result = plan({ from: held, days: tuesday(["15:00", "16:00"]), minutes: 90, nowMs: twoMinutesPast });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "Это время уже прошло — выберите другое.", "she went looking for a booking that does not exist");
  assert.equal(result.slotTaken, true, "the dialog keeps offering the same start");
});

test("a collection that fills the rest of its day can still be shortened or shifted inside its own trip", () => {
  // Tuesday's hours are 2pm to 4pm; the collection holds 2–3pm, fittings hold
  // 3pm and 3:30, so the diary has no free slot that day and leaves it out
  const schedule = {
    enabled: true,
    slotMinutes: 30,
    leadTimeHours: 0,
    horizonDays: 7,
    weekly: [{ day: "tue" as const, from: "14:00", to: "16:00" }],
    closures: [],
  };
  const days = generateSlots({
    schedule,
    now: new Date(NOW),
    taken: ["2026-10-06T14:00", "2026-10-06T14:30", "2026-10-06T15:00", "2026-10-06T15:30"],
  });
  assert.deepEqual(days, [], "the setting of the bug: the day is gone from the diary");
  const held: DiaryDoc = {
    ...request,
    _id: "slot-2026-10-06-1400",
    status: "confirmed",
    slotStart: "2026-10-06T14:00",
    slotEnd: "2026-10-06T15:00",
  };
  const shorter = plan({ from: held, days, minutes: 30 });
  assert.ok(shorter.ok && shorter.inPlace, "cutting the trip to half an hour was refused");
  if (shorter.ok) assert.equal(shorter.end, "2026-10-06T14:30");
  const later = plan({ from: held, days, minutes: 30, slot: "2026-10-06T14:30" });
  assert.ok(later.ok && !later.inPlace, "moving it half an hour on, inside its own trip, was refused");
  // Its own trip is all it has: an hour from 2:30 runs into the fitting at 3pm
  assert.equal(plan({ from: held, days, minutes: 60, slot: "2026-10-06T14:30" }).ok, false);
});

/* ─── Outside the diary's hours ─── */

const SEVEN_THIRTY = "Tuesday 6 October, 7:30pm";

const outside = (overrides: Partial<Parameters<typeof planOutside>[0]> = {}) =>
  planOutside({ from: request, told: SEVEN_THIRTY, now: NOW, freshId: "collection-fresh", ...overrides });

test("an out-of-hours time is one line of English the customer can read", () => {
  assert.deepEqual(outsideWords(SEVEN_THIRTY), { ok: true, told: SEVEN_THIRTY });
  assert.deepEqual(outsideWords("  Tuesday\n6 October,\t7:30pm  "), { ok: true, told: SEVEN_THIRTY }, "a line break typed in");
  const invisible = `Tuesday 6 October,${String.fromCharCode(0x200b)} 7:30pm${String.fromCharCode(7)}`;
  assert.deepEqual(outsideWords(invisible), { ok: true, told: SEVEN_THIRTY }, "an invisible character went out in the email");

  for (const nothing of ["", "   ", undefined, null, 42]) {
    const said = outsideWords(nothing);
    assert.equal(said.ok, false, String(nothing));
    if (!said.ok) assert.match(said.error, /Впишите время забора/);
  }
  assert.equal(outsideWords("x".repeat(OUTSIDE_MAX)).ok, true);
  const long = outsideWords("x".repeat(OUTSIDE_MAX + 1));
  assert.equal(long.ok, false, "a time cut off halfway would be emailed");
  if (!long.ok) assert.match(long.error, /не больше 80 знаков/);
  const russian = outsideWords("вторник, 19:30");
  assert.equal(russian.ok, false, "Russian went to an English-speaking customer");
  if (!russian.ok) assert.match(russian.error, /по-английски/);
});

test("only a live collection request is given an out-of-hours time, and the server checks the words too", () => {
  const empty = outside({ told: "  " });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.status, 400);

  const gone = outside({ from: null });
  assert.equal(gone.ok, false);
  if (!gone.ok) assert.equal(gone.status, 404);
  const fitting = outside({ from: { ...request, collection: undefined } });
  assert.equal(fitting.ok, false);
  if (!fitting.ok) assert.match(fitting.error, /не заявка на забор/);
  const finished = outside({ from: { ...request, status: "completed" } });
  assert.equal(finished.ok, false);
  if (!finished.ok) assert.match(finished.error, /Выполнена/);
});

test("a request with no time is changed where it is; one that holds a slot moves off it", () => {
  const untimed = outside();
  assert.ok(untimed.ok && untimed.inPlace);
  if (untimed.ok) {
    assert.equal(untimed.to._id, "req-anna");
    assert.equal(untimed.to.confirmedFor, SEVEN_THIRTY);
    assert.equal(untimed.to.status, "confirmed");
    assert.equal(untimed.to.slotStart, undefined);
  }

  const held: DiaryDoc = {
    ...request,
    _id: "slot-2026-10-06-1400",
    status: "confirmed",
    notifiedStatus: "confirmed",
    slotStart: "2026-10-06T14:00",
    slotEnd: "2026-10-06T15:00",
  };
  const timed = outside({ from: held });
  assert.ok(timed.ok && !timed.inPlace, "a timed collection kept its slot");
  if (timed.ok) {
    assert.equal(timed.to._id, "collection-fresh", "it stayed on the slot's id, and the slot is never free again");
    assert.equal(timed.to.slotStart, undefined);
    assert.equal(timed.to.slotEnd, undefined);
    assert.equal(timed.to._rev, undefined);
    assert.equal(timed.to.movedFrom, "Tuesday 6 October, between 2:00pm and 3:00pm");
  }

  // Cancelled at its slot: the slot is given back already, and still the id is left
  const cancelled = outside({ from: { ...held, status: "cancelled", notifiedStatus: "cancelled" } });
  assert.ok(cancelled.ok && !cancelled.inPlace);
  if (cancelled.ok) assert.equal(cancelled.to.movedFrom, undefined, "told it was cancelled, nothing moved");

  // Never left on a slot's id, whatever else it carries
  const onSlotId = outside({ from: { ...request, _id: "slot-2026-10-06-1400" } });
  assert.ok(onSlotId.ok && !onSlotId.inPlace);
});

test("an out-of-hours time already told is no change; another one says where it moved from", () => {
  const told: DiaryDoc = { ...request, status: "confirmed", notifiedStatus: "confirmed", confirmedFor: SEVEN_THIRTY };
  const same = outside({ from: told, told: "tuesday 6 october 7.30pm" });
  assert.equal(same.ok, false);
  if (!same.ok) assert.match(same.error, /уже сообщили/);
  // Typed but not sent yet: sending it is the point
  assert.equal(outside({ from: { ...told, notifiedStatus: undefined } }).ok, true);

  const other = outside({ from: told, told: "Wednesday 7 October, 8pm" });
  assert.ok(other.ok && other.inPlace);
  if (other.ok && other.inPlace) {
    assert.equal(other.to.movedFrom, SEVEN_THIRTY);
    assert.ok(!other.change.unset.includes("movedFrom"));
  }
});

test("a note waiting for the first reply goes with the out-of-hours time; one from an earlier reply stays behind", () => {
  const fresh = outside({ from: { ...request, replyNote: "Have the hooks off, please" } });
  assert.ok(fresh.ok);
  if (fresh.ok) assert.equal(fresh.to.replyNote, "Have the hooks off, please");
  const answered = outside({
    from: { ...request, status: "confirmed", notifiedStatus: "confirmed", confirmedFor: "Monday 5 October, 6pm", replyNote: "See you Monday" },
  });
  assert.ok(answered.ok);
  if (answered.ok) assert.equal(answered.to.replyNote, undefined);
});
