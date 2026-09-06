import { test } from "node:test";
import assert from "node:assert/strict";
import { productionTimeLabel } from "./productionTime";

test("a bare range gains the unit it was missing", () => {
  assert.equal(productionTimeLabel("3-5"), "3–5 days");
  assert.equal(productionTimeLabel("1-3"), "1–3 days");
});

test("a single number is counted properly", () => {
  assert.equal(productionTimeLabel("7"), "7 days");
  assert.equal(productionTimeLabel("1"), "1 day");
});

test("a phrase Kristina wrote herself is left alone, bar the dash", () => {
  assert.equal(productionTimeLabel("1–3 business days"), "1–3 business days");
  assert.equal(productionTimeLabel("1-3 business days"), "1–3 business days");
  assert.equal(productionTimeLabel("two weeks"), "two weeks");
});

test("empty means nothing to say, not an empty promise", () => {
  assert.equal(productionTimeLabel(""), null);
  assert.equal(productionTimeLabel("   "), null);
  assert.equal(productionTimeLabel(undefined), null);
  assert.equal(productionTimeLabel(null), null);
});

test("spacing around the dash does not change the answer", () => {
  assert.equal(productionTimeLabel(" 3 – 5 "), "3–5 days");
});
