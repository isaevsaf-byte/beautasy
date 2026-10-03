import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bankHolidays,
  generateSlots,
  slotIsOffered,
  instantOf,
  localDateOf,
  localMinuteOf,
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

const twoDays = (times: string[]): SlotDay[] =>
  ["2026-10-06", "2026-10-07"].map((date) => ({
    date,
    label: dayLabel(date),
    slots: times.map((t) => ({ start: `${date}T${t}`, label: timeLabel(t) })),
  }));

test("a collection's own slots are starts on their own day only", () => {
  const offered = spansOffered(twoDays(["09:00", "09:30"]), 30, 30, ["2026-10-06T10:00"]);
  for (const day of offered) {
    for (const slot of day.slots) {
      assert.ok(slot.start.startsWith(`${day.date}T`), `${slot.start} is offered under ${day.date}: the chip says 10:00 and books another day`);
    }
  }
  const wednesday = offered.find((day) => day.date === "2026-10-07");
  assert.deepEqual(wednesday?.slots.map((slot) => slot.start), ["2026-10-07T09:00", "2026-10-07T09:30"]);
});

test("a collection's own slots take their place among the free ones, in order", () => {
  const starts = spansOffered(TUESDAY, 30, 30, ["2026-10-06T10:00"]).flatMap((day) => day.slots.map((slot) => slot.start));
  assert.deepEqual(starts, [
    "2026-10-06T09:00",
    "2026-10-06T09:30",
    "2026-10-06T10:00",
    "2026-10-06T10:30",
    "2026-10-06T11:00",
    "2026-10-06T11:30",
    "2026-10-06T13:00",
    "2026-10-06T14:00",
    "2026-10-06T14:30",
  ]);
});

test("a day the diary left out because the collection fills it comes back for that collection", () => {
  // Wednesday is free; Tuesday has no free slot left, so the diary dropped it
  const wednesday: SlotDay[] = [twoDays(["09:00", "09:30"])[1]];
  const own = ["2026-10-06T14:00", "2026-10-06T14:30"];

  const half = spansOffered(wednesday, 30, 30, own);
  assert.deepEqual(
    half.map((day) => day.date),
    ["2026-10-06", "2026-10-07"],
    "the days are out of order, or the collection's own day is missing"
  );
  assert.equal(half[0].label, "Tuesday 6 October");
  assert.deepEqual(half[0].slots.map((slot) => slot.start), own);
  assert.deepEqual(half[0].slots.map((slot) => slot.label), ["2:00pm", "2:30pm"]);
  // The whole hour from 2pm is its own; from 2:30 it runs into somebody's 3pm
  assert.deepEqual(spansOffered(wednesday, 60, 30, own)[0].slots.map((slot) => slot.start), ["2026-10-06T14:00"]);

  // Once its slots have passed, there is nothing to bring the day back for
  const afterwards = Date.parse("2026-10-06T14:00:00Z"); // 3pm in Southampton
  assert.deepEqual(spansOffered(wednesday, 30, 30, own, afterwards).map((day) => day.date), ["2026-10-07"]);
});

/* ─── Bank holidays ─── */

test("the bank holidays worked out are the ones gov.uk lists for England and Wales", () => {
  // Copied from https://www.gov.uk/bank-holidays, England and Wales
  assert.deepEqual(bankHolidays(2026), [
    "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  ]);
  assert.deepEqual(bankHolidays(2027), [
    "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
  ]);
  assert.deepEqual(bankHolidays(2028), [
    "2028-01-03", "2028-04-14", "2028-04-17", "2028-05-01", "2028-05-29", "2028-08-28", "2028-12-25", "2028-12-26",
  ]);
});

test("a Christmas on a Sunday is kept on the Tuesday, because Boxing Day has the Monday", () => {
  // 2022 and 2033: Christmas Day a Sunday, Boxing Day a Monday
  assert.deepEqual(bankHolidays(2022).slice(-2), ["2022-12-26", "2022-12-27"]);
  assert.deepEqual(bankHolidays(2033).slice(-2), ["2033-12-26", "2033-12-27"]);
  // A New Year's Day on a Sunday moves to the Monday (2023)
  assert.equal(bankHolidays(2023)[0], "2023-01-02");
});

/** Open every weekday 9 to 11 for the two weeks around a bank holiday. */
const everyWeekday = (extra: Partial<Schedule> = {}): Schedule => ({
  ...schedule,
  horizonDays: 14,
  leadTimeHours: 0,
  weekly: (["mon", "tue", "wed", "thu", "fri", "sat"] as const).map((day) => ({ day, from: "09:00", to: "11:00" })),
  ...extra,
});

const offeredDates = (days: SlotDay[]) => days.map((day) => day.date);

test("the diary shuts on a bank holiday by itself, and opens it when Kristina says she works", () => {
  // Friday 28 August 2026: the Monday after is the summer bank holiday
  const friday = new Date("2026-08-28T06:00:00Z");
  assert.ok(!offeredDates(generateSlots({ schedule: everyWeekday(), now: friday })).includes("2026-08-31"));
  assert.ok(offeredDates(generateSlots({ schedule: everyWeekday(), now: friday })).includes("2026-09-01"));
  assert.ok(
    offeredDates(generateSlots({ schedule: everyWeekday({ workBankHolidays: true }), now: friday })).includes("2026-08-31"),
    "she said she works bank holidays, and the Monday is still shut"
  );
});

test("Christmas Day and Boxing Day stay shut even when she works bank holidays; the day off they move to opens", () => {
  // Monday 21 December 2026: Christmas is a Friday, Boxing Day a Saturday, so the bank holiday is Monday 28th
  const monday = new Date("2026-12-21T06:00:00Z");
  const shut = offeredDates(generateSlots({ schedule: everyWeekday(), now: monday }));
  assert.ok(!shut.includes("2026-12-25"));
  assert.ok(!shut.includes("2026-12-26"), "Boxing Day on a Saturday is still Boxing Day");
  assert.ok(!shut.includes("2026-12-28"), "the substitute day off is a bank holiday too");
  assert.ok(shut.includes("2026-12-24"));

  const working = offeredDates(generateSlots({ schedule: everyWeekday({ workBankHolidays: true }), now: monday }));
  assert.ok(!working.includes("2026-12-25"));
  assert.ok(!working.includes("2026-12-26"));
  assert.ok(working.includes("2026-12-28"));
});

test("this minute is written in Southampton's wall clock, the way a slot is, summer and winter", () => {
  // Compared as text with slotStart, so the shape has to be exactly a slot's
  assert.equal(localMinuteOf(new Date("2026-07-01T08:05:00Z")), "2026-07-01T09:05");
  assert.equal(localMinuteOf(new Date("2026-12-01T23:30:00Z")), "2026-12-01T23:30");
  // Half past eleven at night in UTC is already tomorrow in a British summer
  assert.equal(localMinuteOf(new Date("2026-07-01T23:30:00Z")), "2026-07-02T00:30");
  assert.equal(localMinuteOf(new Date("2026-07-01T23:00:00Z")), "2026-07-02T00:00", "midnight is 00, never 24");
});

test("this minute is Southampton's wherever the server runs", () => {
  // The machine the tests run on is usually in London too, so the test above
  // cannot tell Southampton's clock from the server's. Vercel runs in UTC,
  // where the server's clock is an hour behind all summer.
  const was = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/New_York", "Asia/Tokyo"]) {
      process.env.TZ = zone;
      assert.equal(localMinuteOf(new Date("2026-07-01T08:05:00Z")), "2026-07-01T09:05", zone);
      assert.equal(localMinuteOf(new Date("2026-12-01T23:30:00Z")), "2026-12-01T23:30", zone);
    }
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
});
