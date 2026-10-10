import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import { UPCOMING_FITTINGS_FILTER, upcomingFittingsParams } from "./upcomingFittings";

/**
 * «Ближайшие примерки», run through groq-js — the GROQ engine Sanity runs —
 * with the list's own filter, its own parameters and its own ordering.
 */

type Doc = { _id: string; status: string; slotStart?: string; releasedAt?: string; collection?: object };

const booking = (_id: string, fields: Omit<Doc, "_id">) => ({ _id, _type: "atelierBooking", ...fields });

async function listAt(at: string, dataset: object[]): Promise<string[]> {
  const query = `*[${UPCOMING_FITTINGS_FILTER}] | order(slotStart asc)._id`;
  return (await evaluate(parse(query), { dataset, params: upcomingFittingsParams(new Date(at)) })).get();
}

test("confirmed visits still ahead, soonest first — fittings and collections, nothing else", async () => {
  const dataset = [
    booking("later", { status: "confirmed", slotStart: "2026-10-20T11:00" }),
    booking("soon", { status: "confirmed", slotStart: "2026-10-12T09:30" }),
    booking("collect", { status: "confirmed", slotStart: "2026-10-14T18:00", collection: { district: "SO17" } }),
    booking("gone", { status: "confirmed", slotStart: "2026-10-09T15:00" }),
    booking("asked", { status: "new", slotStart: "2026-10-13T10:00" }),
    booking("request", { status: "new" }),
    booking("typed", { status: "confirmed" }),
    booking("cancelled", { status: "cancelled", slotStart: "2026-10-15T10:00" }),
    booking("declined", { status: "declined", slotStart: "2026-10-16T10:00" }),
    booking("done", { status: "completed", slotStart: "2026-10-17T10:00" }),
    booking("released", { status: "confirmed", slotStart: "2026-10-18T10:00", releasedAt: "2026-10-01T10:00:00Z" }),
    { _id: "other", _type: "order", status: "confirmed", slotStart: "2026-10-19T10:00" },
  ];
  assert.deepEqual(await listAt("2026-10-10T09:00:00Z", dataset), ["soon", "collect", "later"]);
});

test("'now' is Southampton's wall clock, so a fitting leaves the list when it starts, summer or winter", async () => {
  const dataset = [
    booking("two", { status: "confirmed", slotStart: "2026-10-24T14:00" }),
    booking("half-two", { status: "confirmed", slotStart: "2026-10-24T14:30" }),
  ];
  // 13:30 UTC is 2:30pm British Summer Time. Against GROQ's now() in UTC the
  // two o'clock would still be listed as ahead for another hour.
  assert.deepEqual(await listAt("2026-10-24T13:30:00Z", dataset), ["half-two"]);
  assert.deepEqual(await listAt("2026-10-24T12:59:00Z", dataset), ["two", "half-two"]);

  // After the clocks go back, London and UTC agree again
  const winter = [booking("nine", { status: "confirmed", slotStart: "2026-10-26T09:00" })];
  assert.deepEqual(await listAt("2026-10-26T09:00:00Z", winter), ["nine"], "a fitting that starts this minute is still the next one");
  assert.deepEqual(await listAt("2026-10-26T09:01:00Z", winter), []);
});

test("the list asks for 'now' when it is opened, not when the Studio loaded", () => {
  assert.deepEqual(upcomingFittingsParams(new Date("2026-10-24T13:30:00Z")), { now: "2026-10-24T14:30" });
  assert.deepEqual(upcomingFittingsParams(new Date("2026-10-26T13:30:00Z")), { now: "2026-10-26T13:30" });
});
