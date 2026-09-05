import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the two things that stop one fitting time being sold twice.
 *
 * A slot is checked against the diary and then written. Between those two
 * moments a second customer can do exactly the same thing, so the check alone
 * is not enough: the booking is created with an id derived from the slot, and
 * Sanity refuses a second document with the same id. Drop either half and
 * everything still compiles and every unit test still passes — the failure is
 * two people at the door at the same time, weeks later.
 *
 * The diary also has to be read past the CDN. A cached copy still showing a
 * slot that went a minute ago hands it out again, which is the same stale-read
 * bug that once sent duplicate emails.
 */

const ROUTE = readFileSync(
  join(process.cwd(), "src", "app", "api", "atelier-booking", "route.ts"),
  "utf8"
);

test("a chosen slot is checked against the diary before anything is written", () => {
  const check = ROUTE.indexOf("slotIsOffered(");
  const write = ROUTE.indexOf("sanityWriteClient.create(");
  assert.notEqual(check, -1, "the route no longer checks the slot is on offer");
  assert.notEqual(write, -1, "the route no longer writes the booking");
  assert.ok(check < write, "Check the slot before writing it, or 3am is bookable.");
});

test("the diary is read past the CDN when a booking is being taken", () => {
  assert.match(
    ROUTE,
    /getAvailableSlots\(\{\s*fresh:\s*true\s*\}\)/,
    "A cached diary still shows slots that have just gone. Read fresh here."
  );
});

test("the booking's id is the slot, so the database refuses the second taker", () => {
  assert.match(
    ROUTE,
    /_id:\s*slotDocumentId\(slot\)/,
    "Without a deterministic id, two requests that both pass the check both write a booking."
  );
});

test("a slot that loses the race is reported as taken, not as a generic failure", () => {
  const matches = ROUTE.match(/slotTaken:\s*true/g) ?? [];
  assert.ok(
    matches.length >= 2,
    "Both the check and the failed write must tell the customer to pick again."
  );
});

test("a picked time is marked as already told, so no second confirmation follows", () => {
  assert.match(
    ROUTE,
    /notifiedStatus:\s*slot\s*\?\s*"confirmed"/,
    "The nightly job sends confirmations for anything confirmed but untold; a slot booking has already been told."
  );
});
