import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateSlots,
  slotIsOffered,
  instantOf,
  localDateOf,
  timeLabel,
  dayLabel,
  slotLabel,
  slotDocumentId,
  addMinutesLocal,
  spanEnd,
  spanIsOffered,
  spanLabel,
  spansOffered,
  startsCovered,
  type Schedule,
  type SlotDay,
} from "./slots";

/** Open Thursday and Friday, 9 to 12, half-hour slots, a day's notice. */
const schedule: Schedule = {
  enabled: true,
  slotMinutes: 30,
  leadTimeHours: 24,
  horizonDays: 14,
  weekly: [
    { day: "thu", from: "09:00", to: "12:00" },
    { day: "fri", from: "09:00", to: "12:00" },
  ],
  closures: [],
};

// A Monday in September, well clear of any clock change
const MONDAY = new Date("2026-09-07T08:00:00Z");

test("a day off the schedule offers nothing at all", () => {
  const days = generateSlots({ schedule, now: MONDAY });
  const weekdays = new Set(days.map((d) => d.label.split(" ")[0]));
  assert.deepEqual([...weekdays].sort(), ["Friday", "Thursday"]);
});

test("slots run to the end of opening hours and no further", () => {
  const [firstDay] = generateSlots({ schedule, now: MONDAY });
  assert.deepEqual(
    firstDay.slots.map((s) => s.label),
    ["9:00am", "9:30am", "10:00am", "10:30am", "11:00am", "11:30am"]
  );
  // 11:30 + 30 lands exactly on 12:00, so it fits; 12:00 would not
  assert.equal(firstDay.slots.at(-1)?.start.endsWith("T11:30"), true);
});

test("a slot that does not fit before closing is not offered", () => {
  const awkward: Schedule = {
    ...schedule,
    slotMinutes: 45,
    weekly: [{ day: "thu", from: "09:00", to: "10:00" }],
  };
  const [day] = generateSlots({ schedule: awkward, now: MONDAY });
  assert.deepEqual(day.slots.map((s) => s.label), ["9:00am"]);
});

test("nothing inside the notice period is offered", () => {
  // Thursday morning: the same day's 9am is long past the 24 hours' notice
  const thursdayEarly = new Date("2026-09-10T06:00:00Z");
  const days = generateSlots({ schedule, now: thursdayEarly });
  assert.equal(
    days.some((d) => d.date === "2026-09-10"),
    false,
    "today should be gone when it is inside the notice period"
  );
  assert.equal(days[0].date, "2026-09-11");
});

test("shorter notice opens up the same day", () => {
  const thursdayEarly = new Date("2026-09-10T06:00:00Z"); // 07:00 in Southampton
  const days = generateSlots({
    schedule: { ...schedule, leadTimeHours: 1 },
    now: thursdayEarly,
  });
  assert.equal(days[0].date, "2026-09-10");
  assert.equal(days[0].slots[0].label, "9:00am");
});

test("a slot somebody else has taken disappears", () => {
  const days = generateSlots({
    schedule,
    now: MONDAY,
    taken: ["2026-09-10T09:00", "2026-09-10T09:30"],
  });
  assert.deepEqual(days[0].slots.map((s) => s.label), [
    "10:00am",
    "10:30am",
    "11:00am",
    "11:30am",
  ]);
});

test("a whole day closed is a day that is not offered", () => {
  const days = generateSlots({
    schedule: { ...schedule, closures: [{ date: "2026-09-10", note: "Away" }] },
    now: MONDAY,
  });
  assert.equal(days.some((d) => d.date === "2026-09-10"), false);
});

test("a lunch break removes only the hours it covers", () => {
  const days = generateSlots({
    schedule: {
      ...schedule,
      closures: [{ date: "2026-09-10", from: "10:00", to: "11:00", note: "School run" }],
    },
    now: MONDAY,
  });
  const thursday = days.find((d) => d.date === "2026-09-10")!;
  assert.deepEqual(thursday.slots.map((s) => s.label), [
    "9:00am",
    "9:30am",
    "11:00am",
    "11:30am",
  ]);
});

test("the horizon is respected, so the picker never runs off into next year", () => {
  const days = generateSlots({ schedule: { ...schedule, horizonDays: 7 }, now: MONDAY });
  assert.ok(days.length > 0);
  assert.ok(days.every((d) => d.date <= "2026-09-14"));
});

test("a schedule Kristina has not switched on offers nothing", () => {
  assert.deepEqual(generateSlots({ schedule: { ...schedule, enabled: false }, now: MONDAY }), []);
  assert.deepEqual(generateSlots({ schedule: { ...schedule, weekly: [] }, now: MONDAY }), []);
});

test("only a slot the schedule actually offers passes the check", () => {
  const days = generateSlots({ schedule, now: MONDAY });
  assert.equal(slotIsOffered(days, days[0].slots[0].start), true);
  assert.equal(slotIsOffered(days, "2026-09-10T03:00"), false, "3am is not on offer");
  assert.equal(slotIsOffered(days, "2026-09-09T10:00"), false, "a Wednesday is not on offer");
});

/* ─── British Summer Time ─── */

test("a summer slot is an hour ahead of UTC, a winter one is not", () => {
  assert.equal(instantOf("2026-07-10T14:30").toISOString(), "2026-07-10T13:30:00.000Z");
  assert.equal(instantOf("2026-01-10T14:30").toISOString(), "2026-01-10T14:30:00.000Z");
});

test("the clocks going back does not move the afternoon", () => {
  // BST ends on 25 October 2026; the day before and after both read 2:30pm
  assert.equal(instantOf("2026-10-24T14:30").toISOString(), "2026-10-24T13:30:00.000Z");
  assert.equal(instantOf("2026-10-25T14:30").toISOString(), "2026-10-25T14:30:00.000Z");
});

test("the day is read in Southampton, not wherever the server happens to be", () => {
  // 23:30 UTC in July is already tomorrow in Southampton
  assert.equal(localDateOf(new Date("2026-07-10T23:30:00Z")), "2026-07-11");
  assert.equal(localDateOf(new Date("2026-01-10T23:30:00Z")), "2026-01-10");
});

/* ─── How it reads ─── */

test("times read the way people say them", () => {
  assert.equal(timeLabel("09:00"), "9:00am");
  assert.equal(timeLabel("12:00"), "12:00pm");
  assert.equal(timeLabel("00:30"), "12:30am");
  assert.equal(timeLabel("14:05"), "2:05pm");
});

test("days read as a date, not as a list", () => {
  assert.equal(dayLabel("2026-09-10"), "Thursday 10 September");
  assert.equal(slotLabel("2026-09-10T14:30"), "Thursday 10 September at 2:30pm");
});

test("a slot becomes an id Sanity will accept", () => {
  const id = slotDocumentId("2026-09-10T14:30");
  assert.equal(id, "slot-2026-09-10-1430");
  assert.match(id, /^[a-zA-Z0-9._-]+$/);
});

/* ─── Spans: a collection holds the whole trip ─── */

/** A Tuesday, 9 to 12 and 1 to 3, with 10:00 and 1:30 already booked. */
const TUESDAY: SlotDay[] = [
  {
    date: "2026-10-06",
    label: "Tuesday 6 October",
    slots: ["09:00", "09:30", "10:30", "11:00", "11:30", "13:00", "14:00", "14:30"].map((t) => ({
      start: `2026-10-06T${t}`,
      label: timeLabel(t),
    })),
  },
];

test("a span ends on whole slots, never halfway through one", () => {
  assert.equal(addMinutesLocal("2026-10-06T14:00", 90), "2026-10-06T15:30");
  assert.equal(spanEnd("2026-10-06T14:00", 60, 30), "2026-10-06T15:00");
  assert.equal(spanEnd("2026-10-06T14:00", 45, 30), "2026-10-06T15:00", "45 minutes hold two half-hour slots");
  assert.equal(spanEnd("2026-10-06T14:00", 0, 30), "2026-10-06T14:30", "a trip still holds at least one slot");
});

test("every slot a span holds is spelt out", () => {
  assert.deepEqual(startsCovered("2026-10-06T14:00", "2026-10-06T15:30", 30), [
    "2026-10-06T14:00",
    "2026-10-06T14:30",
    "2026-10-06T15:00",
  ]);
  assert.deepEqual(startsCovered("2026-10-06T14:00", undefined, 30), ["2026-10-06T14:00"]);
});

test("a trip is offered only where every slot of it is free", () => {
  const hour = spansOffered(TUESDAY, 60, 30);
  // 9:30 runs into the booked 10:00; 11:30 into lunch; 1pm into the booked 1:30; 2:30 past closing
  assert.deepEqual(
    hour.flatMap((day) => day.slots.map((slot) => slot.start)),
    ["2026-10-06T09:00", "2026-10-06T10:30", "2026-10-06T11:00", "2026-10-06T14:00"]
  );
  assert.equal(spanIsOffered(TUESDAY, "2026-10-06T09:30", 60, 30), false, "a trip ran over a booked fitting");
  assert.equal(spanIsOffered(TUESDAY, "2026-10-06T11:30", 60, 30), false, "a trip ran past the end of the morning");
  assert.equal(spanIsOffered(TUESDAY, "2026-10-06T14:00", 60, 30), true);
  assert.equal(spanIsOffered(TUESDAY, "2026-10-06T14:00", 90, 30), false, "a trip ran past closing");
  // Half an hour is just a free slot
  assert.equal(spanIsOffered(TUESDAY, "2026-10-06T13:00", 30, 30), true);
});

test("a collection being moved does not trip over its own time", () => {
  // It holds 10:00 itself: moved to 9:30, the hour runs into its own old slot
  assert.equal(spanIsOffered(TUESDAY, "2026-10-06T09:30", 60, 30), false);
  assert.equal(spanIsOffered(TUESDAY, "2026-10-06T09:30", 60, 30, ["2026-10-06T10:00"]), true);
  // Its own slots can be starts too — it may keep its start and take longer — but only while still ahead
  assert.equal(spanIsOffered(TUESDAY, "2026-10-06T10:00", 30, 30, ["2026-10-06T10:00"]), true);
  assert.equal(spanIsOffered(TUESDAY, "2026-10-06T10:00", 90, 30, ["2026-10-06T10:00"]), true, "10:00–11:30 over its own 10:00");
  const afterTen = Date.parse("2026-10-06T09:30:00Z"); // 10:30 in Southampton
  assert.equal(spanIsOffered(TUESDAY, "2026-10-06T10:00", 30, 30, ["2026-10-06T10:00"], afterTen), false, "a start already gone");
  // Somebody else's slot is never a start
  assert.equal(spanIsOffered(TUESDAY, "2026-10-06T13:30", 30, 30), false);
});

test("a collection's time is told as a window", () => {
  assert.equal(spanLabel("2026-10-06T14:00", "2026-10-06T15:30"), "Tuesday 6 October, between 2:00pm and 3:30pm");
});

test("spans follow the diary's own slot length", () => {
  assert.deepEqual(startsCovered("2026-10-06T14:00", "2026-10-06T16:00", 60), ["2026-10-06T14:00", "2026-10-06T15:00"]);
  assert.equal(spanEnd("2026-10-06T14:00", 90, 60), "2026-10-06T16:00");
  assert.equal(spanEnd("2026-10-06T09:00", 90, 45), "2026-10-06T10:30");
  const hourly: SlotDay[] = [
    {
      date: "2026-10-06",
      label: "Tuesday 6 October",
      slots: ["09:00", "10:00", "11:00"].map((t) => ({ start: `2026-10-06T${t}`, label: timeLabel(t) })),
    },
  ];
  assert.deepEqual(
    spansOffered(hourly, 60, 60).flatMap((day) => day.slots.map((slot) => slot.start)),
    ["2026-10-06T09:00", "2026-10-06T10:00", "2026-10-06T11:00"]
  );
});

test("a span that runs into the next day, or has no time, holds only its start and never throws", () => {
  assert.deepEqual(startsCovered("2026-10-06T14:00", "2026-10-07T16:00", 30), ["2026-10-06T14:00"]);
  assert.deepEqual(startsCovered("2026-10-06", "2026-10-06T15:00", 30), ["2026-10-06"]);
});

test("a day with no room for the trip is not shown at all", () => {
  const gappy: SlotDay[] = [
    {
      date: "2026-10-06",
      label: "Tuesday 6 October",
      slots: ["09:00", "11:00"].map((t) => ({ start: `2026-10-06T${t}`, label: timeLabel(t) })),
    },
  ];
  assert.deepEqual(spansOffered(gappy, 60, 30), []);
});
