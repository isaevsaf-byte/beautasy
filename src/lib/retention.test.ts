import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import {
  MAX_DELETIONS,
  RETENTION_ALERTS_QUERY,
  RETENTION_BOOKINGS_QUERY,
  alertsDue,
  bookingDay,
  bookingsDue,
  runRetentionCleanup,
  withinCap,
  type DatedAlert,
  type DatedBooking,
} from "./retention";

/**
 * What the Privacy Policy promises — bookings two years after the last visit,
 * stock alerts twelve months at most — kept to the day, by Southampton's
 * calendar, and not a day sooner for anything still inside its time.
 */

const ids = (groups: string[][]) => groups.flat();

/* ─── Bookings ─── */

test("a booking goes on the day two years after the visit, not the day before", () => {
  const visit: DatedBooking = { _id: "slot-2026-10-10-1400", emailFingerprint: "anna", slotStart: "2026-10-10T14:00" };
  assert.deepEqual(bookingsDue([visit], "2028-10-09"), []);
  assert.deepEqual(ids(bookingsDue([visit], "2028-10-10")), ["slot-2026-10-10-1400"]);
  assert.deepEqual(ids(bookingsDue([visit], "2029-01-01")), ["slot-2026-10-10-1400"]);
});

test("a request with no time counts from the Southampton day it was made, across midnight in summer time", () => {
  // 11:30pm UTC on 10 October is 12:30am on the 11th in British Summer Time
  const late: DatedBooking = { _id: "late", emailFingerprint: "bea", createdAt: "2026-10-10T23:30:00.000Z" };
  assert.equal(bookingDay(late), "2026-10-11");
  assert.deepEqual(bookingsDue([late], "2028-10-10"), [], "a day early by the UTC date");
  assert.deepEqual(ids(bookingsDue([late], "2028-10-11")), ["late"]);
  // In winter UTC and London agree
  const winter: DatedBooking = { _id: "winter", createdAt: "2026-12-10T23:30:00.000Z" };
  assert.equal(bookingDay(winter), "2026-12-10");
  // Only Sanity's own stamp to go on
  assert.equal(bookingDay({ _id: "old", _createdAt: "2026-08-26T20:55:26Z" }), "2026-08-26");
});

test("bookings go per person: kept until two years after their LAST visit, then all together", () => {
  const first: DatedBooking = { _id: "slot-2026-09-05-1000", emailFingerprint: "cat", slotStart: "2026-09-05T10:00" };
  const again: DatedBooking = { _id: "slot-2027-05-20-1100", emailFingerprint: "cat", slotStart: "2027-05-20T11:00" };
  const stranger: DatedBooking = { _id: "slot-2026-09-06-1000", emailFingerprint: "dan", slotStart: "2026-09-06T10:00" };
  const all = [first, again, stranger];
  // Two years after Cat's first visit she has been back: nothing of hers goes
  assert.deepEqual(ids(bookingsDue(all, "2028-09-06")), ["slot-2026-09-06-1000"]);
  assert.deepEqual(ids(bookingsDue(all, "2029-05-19")), ["slot-2026-09-06-1000"]);
  assert.deepEqual(ids(bookingsDue([again, stranger, first], "2029-05-19")), ["slot-2026-09-06-1000"], "whichever is read first");
  assert.deepEqual(ids(bookingsDue(all, "2029-05-20")).sort(), ["slot-2026-09-05-1000", "slot-2026-09-06-1000", "slot-2027-05-20-1100"]);
});

test("a visit still ahead keeps the person's whole history, however old the rest", () => {
  const old: DatedBooking = { _id: "old", emailFingerprint: "eve", slotStart: "2026-09-01T10:00" };
  const ahead: DatedBooking = { _id: "ahead", emailFingerprint: "eve", slotStart: "2029-03-01T10:00" };
  assert.deepEqual(bookingsDue([old, ahead], "2029-01-01"), []);
});

test("a booking without a fingerprint stands alone, and one that cannot be dated is kept — with its person", () => {
  const alone: DatedBooking = { _id: "alone", createdAt: "2026-08-26T20:55:26.354Z" };
  assert.deepEqual(ids(bookingsDue([alone], "2028-08-26")), ["alone"]);
  const undated: DatedBooking = { _id: "undated", emailFingerprint: "fay" };
  const hers: DatedBooking = { _id: "hers", emailFingerprint: "fay", slotStart: "2026-01-01T10:00" };
  assert.deepEqual(bookingsDue([undated, hers], "2035-01-01"), []);
  assert.deepEqual(bookingsDue([hers, undated], "2035-01-01"), [], "whichever is read first");
  assert.deepEqual(bookingsDue([{ _id: "nonsense", createdAt: "yesterday" }], "2035-01-01"), []);
});

test("a booking and its Studio draft go together, dated by the published copy", () => {
  const published: DatedBooking = { _id: "slot-2026-10-10-1400", emailFingerprint: "gus", slotStart: "2026-10-10T14:00" };
  const draft: DatedBooking = { _id: "drafts.slot-2026-10-10-1400", emailFingerprint: "gus", slotStart: "2026-10-10T14:00" };
  assert.deepEqual(bookingsDue([published, draft], "2028-10-10"), [["drafts.slot-2026-10-10-1400", "slot-2026-10-10-1400"]]);
});

test("29 February counts to 28 February two years on: a day early, never late", () => {
  const leap: DatedBooking = { _id: "leap", slotStart: "2028-02-29T10:00" };
  assert.deepEqual(bookingsDue([leap], "2030-02-27"), []);
  assert.deepEqual(ids(bookingsDue([leap], "2030-02-28")), ["leap"]);
});

/* ─── Stock alerts ─── */

test("a stock alert goes twelve months to the day after it was made, by Southampton's date", () => {
  const alert: DatedAlert = { _id: "a1", createdAt: "2026-08-24T20:22:01.601Z" };
  assert.deepEqual(alertsDue([alert], "2027-08-23"), []);
  assert.deepEqual(ids(alertsDue([alert], "2027-08-24")), ["a1"]);
  // Made at 11:30pm UTC in summer: the next day in Southampton
  const late: DatedAlert = { _id: "a2", createdAt: "2026-10-24T23:30:00Z" };
  assert.deepEqual(alertsDue([late], "2027-10-24"), []);
  assert.deepEqual(ids(alertsDue([late], "2027-10-25")), ["a2"]);
  // Undatable: kept
  assert.deepEqual(alertsDue([{ _id: "a3" }], "2040-01-01"), []);
});

/* ─── The cap ─── */

test("one morning deletes at most fifty documents, whole records only; the rest wait", () => {
  const groups = Array.from({ length: 30 }, (_, i) => [`b${i}`, `drafts.b${i}`]);
  const taken = withinCap(groups, MAX_DELETIONS);
  assert.equal(ids(taken).length, 50);
  assert.equal(taken.length, 25);
  assert.ok(taken.every((group) => group.length === 2), "a record is never split from its draft");
  assert.equal(withinCap([["a", "b", "c"]], 2).length, 0);
});

/* ─── The job, run whole ─── */

type Doc = Record<string, unknown> & { _id: string };

/** The stand-in database: answers through groq-js and records what it was asked to delete. */
function store(docs: Doc[], refuse: (ids: string[]) => boolean = () => false) {
  const deleted: string[][] = [];
  return {
    deleted,
    fetch: async <T,>(query: string, params: Record<string, unknown> = {}): Promise<T> =>
      (await (await evaluate(parse(query), { dataset: docs, params })).get()) as T,
    remove: async (group: string[]) => {
      if (refuse(group)) throw Object.assign(new Error("Document is referenced"), { statusCode: 409 });
      deleted.push(group);
    },
  };
}

/** The dataset as it stands on 10 October 2026, as read from the public dataset: four bookings, one alert. */
function today(): Doc[] {
  return [
    { _id: "b-aug", _type: "atelierBooking", createdAt: "2026-08-26T20:55:26.354Z" },
    { _id: "b-sep", _type: "atelierBooking", emailFingerprint: "x", createdAt: "2026-09-05T22:09:46.193Z" },
    { _id: "slot-2026-09-30-1100", _type: "atelierBooking", emailFingerprint: "y", slotStart: "2026-09-30T11:00" },
    { _id: "slot-2026-10-20-1000", _type: "atelierBooking", emailFingerprint: "y", slotStart: "2026-10-20T10:00" },
    { _id: "alert-1", _type: "stockAlert", createdAt: "2026-08-24T20:22:01.601Z" },
    { _id: "product-1", _type: "product", createdAt: "2020-01-01T00:00:00Z" },
    { _id: "order-1", _type: "order", createdAt: "2020-01-01T00:00:00Z" },
  ];
}

test("today the job finds nothing due and deletes nothing", async () => {
  const db = store(today());
  const result = await runRetentionCleanup({ ...db, now: new Date("2026-10-10T09:00:00Z") });
  assert.deepEqual(result, { today: "2026-10-10", bookingsDue: 0, alertsDue: 0, deleted: 0, failed: 0, waiting: 0 });
  assert.deepEqual(db.deleted, []);
});

test("the first deletion is the stock alert, on 24 August 2027 — and only it", async () => {
  const db = store(today());
  assert.equal((await runRetentionCleanup({ ...db, now: new Date("2027-08-23T09:00:00Z") })).deleted, 0);
  const due = await runRetentionCleanup({ ...db, now: new Date("2027-08-24T09:00:00Z") });
  assert.equal(due.deleted, 1);
  assert.deepEqual(db.deleted, [["alert-1"]]);
});

test("in August 2028 the oldest booking goes; nothing of another type ever does", async () => {
  const db = store(today());
  await runRetentionCleanup({ ...db, now: new Date("2028-08-26T09:00:00Z") });
  assert.deepEqual(ids(db.deleted).sort(), ["alert-1", "b-aug"]);
  await runRetentionCleanup({ ...db, now: new Date("2040-01-01T09:00:00Z") });
  assert.ok(!ids(db.deleted).some((id) => id.startsWith("product") || id.startsWith("order")));
});

test("a refused deletion is counted and does not stop the others; the cap leaves the rest for tomorrow", async () => {
  const many: Doc[] = Array.from({ length: 60 }, (_, i) => ({
    _id: `b${String(i).padStart(2, "0")}`,
    _type: "atelierBooking",
    slotStart: "2026-09-01T10:00",
  }));
  const db = store(many, (group) => group[0] === "b03");
  const result = await runRetentionCleanup({ ...db, now: new Date("2029-01-01T09:00:00Z") });
  assert.equal(result.bookingsDue, 60);
  assert.equal(result.failed, 1);
  assert.equal(result.deleted, 49);
  assert.equal(result.waiting, 10);
  assert.ok(ids(db.deleted).length <= MAX_DELETIONS);
});

test("the queries read only bookings and old stock alerts", async () => {
  const docs = today();
  const bookings = (await (await evaluate(parse(RETENTION_BOOKINGS_QUERY), { dataset: docs })).get()) as { _id: string }[];
  assert.deepEqual(bookings.map((doc) => doc._id).sort(), ["b-aug", "b-sep", "slot-2026-09-30-1100", "slot-2026-10-20-1000"]);
  const alerts = async (before: string) =>
    ((await (await evaluate(parse(RETENTION_ALERTS_QUERY), { dataset: docs, params: { before } })).get()) as { _id: string }[]).map((doc) => doc._id);
  assert.deepEqual(await alerts("2026-08-01T00:00:00Z"), []);
  assert.deepEqual(await alerts("2026-09-01T00:00:00Z"), ["alert-1"]);
});
