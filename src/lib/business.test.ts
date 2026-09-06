import { test } from "node:test";
import assert from "node:assert/strict";
import { BUSINESS, openingHoursSpecification } from "./business";

test("every day of the week is covered exactly once", () => {
  const days = BUSINESS.hours.blocks.flatMap((b) => b.days);
  assert.equal(days.length, 7);
  assert.equal(new Set(days).size, 7);
});

test("opening hours match what Google Business Profile shows", () => {
  const spec = openingHoursSpecification();
  const find = (day: string) =>
    spec.find((s) => (s.dayOfWeek as string[]).includes(day));

  assert.deepEqual(
    { opens: find("Monday")?.opens, closes: find("Monday")?.closes },
    { opens: "09:00", closes: "19:00" }
  );
  assert.deepEqual(
    { opens: find("Saturday")?.opens, closes: find("Saturday")?.closes },
    { opens: "11:00", closes: "17:00" }
  );
  assert.deepEqual(
    { opens: find("Sunday")?.opens, closes: find("Sunday")?.closes },
    { opens: "11:00", closes: "16:00" }
  );
});

test("the printed label agrees with the structured hours", () => {
  assert.match(BUSINESS.hours.label, /9am–7pm/);
  assert.match(BUSINESS.hours.label, /11am–5pm/);
  assert.match(BUSINESS.hours.label, /11am–4pm/);
});

test("the Google listing is claimed as the same entity", () => {
  assert.ok(BUSINESS.sameAs.includes(BUSINESS.googleMapsUrl));
});

test("the review link points at the Beautasy listing", () => {
  assert.match(BUSINESS.googleReviewUrl, /^https:\/\/g\.page\/r\/[A-Za-z0-9_-]+\/review$/);
});
