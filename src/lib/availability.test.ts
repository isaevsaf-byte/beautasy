import { test } from "node:test";
import assert from "node:assert/strict";
import { availability } from "./availability";

/**
 * One answer to "does it ship now or is it made for me?", for the grid and
 * the product page alike. The page used to show "Only 4 left in ready-made
 * stock" beside "Made in 3–5 days" for the same piece.
 */

const scrunchie = { stock: 10, productionTime: "1–3 days", availableSizes: [] };
const bra = { stock: 4, productionTime: "3-5", availableSizes: ["S", "M", "L"] };

test("a piece with nothing to choose and stock on the shelf ships now", () => {
  const a = availability(scrunchie);
  assert.equal(a.kind, "ready");
  assert.equal(a.label, "Ready to ship in 1–2 days");
  assert.match(a.detail, /dispatched within 1–2 business days/);
  assert.equal(a.fewLeft, null, "ten left is not few");
  assert.equal(availability({ ...scrunchie, stock: 2 }).fewLeft, 2);
});

test("with no stock it is made to order, and says how long that takes", () => {
  const a = availability({ ...bra, stock: 0 });
  assert.equal(a.kind, "made-to-order");
  assert.equal(a.label, "Made to order in 3–5 days");
  assert.match(a.detail, /Made to order for you in 3–5 days/);
  assert.equal(availability({ stock: 0 }).label, "Made to order", "no making time, no invented one");
});

test("a product-wide count never promises the size you picked", () => {
  // Stock is counted per product while the bra comes in three sizes: four
  // on the shelf says nothing about size M
  for (const size of [null, "M"]) {
    const a = availability(bra, { size });
    assert.equal(a.kind, "some-ready");
    assert.equal(a.label, "Some sizes ready to ship");
    assert.match(a.detail, /any other size is made for you in 3–5 days/);
    assert.equal(a.fewLeft, null);
  }
});

test("per-size counts, when Kristina keeps them, answer for the size picked", () => {
  const tracked = { ...bra, sizeStock: [{ size: "S", quantity: 0 }, { size: "M", quantity: 2 }] };
  assert.equal(availability(tracked, { size: "M" }).kind, "ready");
  assert.equal(availability(tracked, { size: "M" }).fewLeft, 2);
  assert.equal(availability(tracked, { size: "S" }).kind, "made-to-order");
  assert.equal(availability(tracked, { size: "L" }).kind, "made-to-order", "a size with no row has none ready");
  assert.equal(availability(tracked).kind, "some-ready");
  assert.equal(availability({ ...bra, sizeStock: [{ size: "S", quantity: 0 }] }).kind, "made-to-order");
});

test("made to measure is always made for you, whatever is on the shelf", () => {
  const a = availability(scrunchie, { madeToMeasure: true });
  assert.equal(a.kind, "made-to-order");
  assert.equal(a.label, "Made to measure in 1–3 days");
  assert.equal(a.fewLeft, null);
});

test("no answer is two answers: a ready line never quotes making days, a made one never a dispatch promise", () => {
  const cases = [
    availability(scrunchie),
    availability({ ...scrunchie, stock: 1 }),
    availability({ ...bra, stock: 0 }),
    availability(bra, { madeToMeasure: true }),
  ];
  for (const a of cases) {
    if (a.kind === "ready") assert.doesNotMatch(`${a.label} ${a.detail}`, /made to order|made for you|made in \d/i);
    if (a.kind === "made-to-order") assert.doesNotMatch(`${a.label} ${a.detail}`, /ready|ship in/i);
  }
});
