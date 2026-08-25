import { test } from "node:test";
import assert from "node:assert/strict";
import { collectOrdered, planStockPatch } from "./stock";

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

test("plain stock decrements by the ordered quantity", () => {
  const fields = planStockPatch({ _id: "p", stock: 10 }, { total: 3, bySize: new Map() })!;
  assert.equal(fields.stock, 7);
});

test("stock floors at zero when more is ordered than is ready-made", () => {
  const fields = planStockPatch({ _id: "p", stock: 1 }, { total: 5, bySize: new Map() })!;
  assert.equal(fields.stock, 0);
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
  const fields = planStockPatch(doc, { total: 3, bySize: new Map([["M", 3]]) })!;
  assert.deepEqual(fields.sizeStock, [
    { _key: "a", size: "S", quantity: 4 },
    { _key: "b", size: "M", quantity: 0 },
  ]);
  assert.equal(fields.stock, 6);
});

test("a product without per-size stock only moves the total", () => {
  const fields = planStockPatch(
    { _id: "p", stock: 5 },
    { total: 1, bySize: new Map([["M", 1]]) }
  )!;
  assert.equal(fields.stock, 4);
  assert.equal(fields.sizeStock, undefined);
});

test("a product with no stock fields yields no patch", () => {
  assert.equal(planStockPatch({ _id: "p" }, { total: 1, bySize: new Map() }), null);
});

test("_key is preserved so Sanity array items stay stable", () => {
  const fields = planStockPatch(
    { _id: "p", sizeStock: [{ _key: "k1", size: "M", quantity: 3 }] },
    { total: 1, bySize: new Map([["M", 1]]) }
  )!;
  const rows = fields.sizeStock as { _key?: string }[];
  assert.equal(rows[0]._key, "k1");
});
