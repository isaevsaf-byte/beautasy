import { test } from "node:test";
import assert from "node:assert/strict";
import { collectOrdered, planStockDecrement, planStockFloor } from "./stock";

test("gift box add-ons are not stocked documents", () => {
  const wanted = collectOrdered([
    { productId: "prod1", quantity: 1 },
    { productId: "prod1-giftbox", quantity: 1 },
  ]);
  assert.equal(wanted.size, 1);
  assert.equal(wanted.get("prod1")?.total, 1);
});

test("the same product in two sizes sums per size and in total", () => {
  const wanted = collectOrdered([
    { productId: "p", size: "M", quantity: 2 },
    { productId: "p", size: "L", quantity: 1 },
    { productId: "p", size: "M", quantity: 3 },
  ]);
  const entry = wanted.get("p")!;
  assert.equal(entry.total, 6);
  assert.equal(entry.bySize.get("M"), 5);
  assert.equal(entry.bySize.get("L"), 1);
});

test("plain stock is decremented by the ordered quantity, atomically", () => {
  const dec = planStockDecrement({ _id: "p", stock: 10 }, { total: 3, bySize: new Map() });
  assert.deepEqual(dec, { stock: 3 });
});

test("only the ordered size moves; other sizes are untouched", () => {
  const doc = {
    _id: "p",
    stock: 9,
    sizeStock: [
      { _key: "a", size: "S", quantity: 4 },
      { _key: "b", size: "M", quantity: 2 },
    ],
  };
  const dec = planStockDecrement(doc, { total: 3, bySize: new Map([["M", 3]]) });
  assert.deepEqual(dec, { stock: 3, 'sizeStock[_key=="b"].quantity': 3 });
});

test("a product without per-size stock only moves the total", () => {
  const dec = planStockDecrement({ _id: "p", stock: 5 }, { total: 1, bySize: new Map([["M", 1]]) });
  assert.deepEqual(dec, { stock: 1 });
});

test("a size row without a _key cannot be addressed and is left alone", () => {
  const doc = { _id: "p", stock: 5, sizeStock: [{ size: "M", quantity: 2 }] };
  const dec = planStockDecrement(doc, { total: 1, bySize: new Map([["M", 1]]) });
  assert.deepEqual(dec, { stock: 1 });
});

test("a product with no stock fields yields no decrement", () => {
  assert.equal(planStockDecrement({ _id: "p" }, { total: 2, bySize: new Map() }), null);
});

test("stock floors at zero when more was ordered than was ready-made", () => {
  const fields = planStockFloor({ _id: "p", stock: -4 });
  assert.deepEqual(fields, { stock: 0 });
});

test("only negative size rows are floored, and _key survives so Sanity keeps the rows stable", () => {
  const fields = planStockFloor({
    _id: "p",
    stock: 1,
    sizeStock: [
      { _key: "a", size: "S", quantity: 4 },
      { _key: "b", size: "M", quantity: -1 },
    ],
  })!;
  assert.equal(fields.stock, undefined);
  assert.deepEqual(fields.sizeStock, [
    { _key: "a", size: "S", quantity: 4 },
    { _key: "b", size: "M", quantity: 0 },
  ]);
});

test("nothing to floor means nothing to write", () => {
  assert.equal(planStockFloor({ _id: "p", stock: 0, sizeStock: [{ _key: "a", size: "S", quantity: 0 }] }), null);
});
