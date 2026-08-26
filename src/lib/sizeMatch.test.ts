import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRange, availableMeasures, suggestSize, type SizeGuideRow } from "./sizeMatch";

// Beautasy's real "Women's Briefs" shape: waist and hips, ranges in cm
const briefs: SizeGuideRow[] = [
  { size: "XS", waist: "58-62cm", hips: "84-88cm" },
  { size: "S", waist: "63-67cm", hips: "89-93cm" },
  { size: "M", waist: "68-72cm", hips: "94-98cm" },
  { size: "L", waist: "73-77cm", hips: "99-103cm" },
  { size: "XL", waist: "78-82cm", hips: "104-108cm" },
];

test("parses ranges, decimals and single values", () => {
  assert.deepEqual(parseRange("46-48cm"), { min: 46, max: 48 });
  assert.deepEqual(parseRange("52.5-55cm"), { min: 52.5, max: 55 });
  assert.deepEqual(parseRange("86cm"), { min: 86, max: 86 });
  assert.equal(parseRange(""), null);
  assert.equal(parseRange(undefined), null);
});

test("only asks for measurements the guide actually has", () => {
  assert.deepEqual(availableMeasures(briefs), ["waist", "hips"]);
  assert.deepEqual(availableMeasures([{ size: "M", bust: "86-90cm" }]), ["bust"]);
});

test("a measurement inside a band gets that size", () => {
  assert.equal(suggestSize(briefs, { waist: 70 }).size, "M");
  assert.equal(suggestSize(briefs, { hips: 90 }).size, "S");
});

test("a measurement between bands rounds up, as the guide advises", () => {
  // 72.5cm falls between M (68-72) and L (73-77)
  assert.equal(suggestSize(briefs, { waist: 72.5 }).size, "L");
});

test("disagreeing measurements pick the larger size and say so", () => {
  const result = suggestSize(briefs, { waist: 65, hips: 100 });
  assert.equal(result.size, "L");
  assert.equal(result.mixed, true);
  assert.equal(result.perMeasure.length, 2);
});

test("agreeing measurements are not flagged as mixed", () => {
  const result = suggestSize(briefs, { waist: 70, hips: 96 });
  assert.equal(result.size, "M");
  assert.equal(result.mixed, false);
});

test("beyond the largest band, the largest size is offered", () => {
  assert.equal(suggestSize(briefs, { hips: 130 }).size, "XL");
});

test("below the smallest band, the smallest size is offered", () => {
  assert.equal(suggestSize(briefs, { waist: 40 }).size, "XS");
});

test("no usable measurements means no recommendation", () => {
  assert.equal(suggestSize(briefs, {}).size, null);
  assert.equal(suggestSize(briefs, { waist: 0 }).size, null);
});
