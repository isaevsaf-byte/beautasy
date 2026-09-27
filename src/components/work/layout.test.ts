import { test } from "node:test";
import assert from "node:assert/strict";
import { clampRatio, columnsFor, tileRatio } from "./layout";

const ids = (columns: { id: string }[][]) => columns.map((column) => column.map((item) => item.id));

test("the newest pieces go across the top, not down the left edge", () => {
  const items = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, ratio: 1.33 }));
  assert.deepEqual(ids(columnsFor(items, 3, (i) => i.ratio)), [
    ["a", "d"],
    ["b", "e"],
    ["c", "f"],
  ]);
});

test("each tile goes to the column that is shortest so far", () => {
  const items = [
    { id: "tall", ratio: 1.8 },
    { id: "short", ratio: 0.75 },
    { id: "next", ratio: 1.33 },
    { id: "after", ratio: 1.33 },
  ];
  // "next" joins the short right column; that makes the left the shorter again
  assert.deepEqual(ids(columnsFor(items, 2, (i) => i.ratio)), [["tall", "after"], ["short", "next"]]);
});

test("a tie goes left, and one column holds everything in order", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(ids(columnsFor(items, 2, () => 1)), [["a", "c"], ["b"]]);
  assert.deepEqual(ids(columnsFor(items, 1, () => 1)), [["a", "b", "c"]]);
  assert.deepEqual(ids(columnsFor(items, 0, () => 1)), [["a", "b", "c"]], "never no columns");
  assert.deepEqual(columnsFor([], 3, () => 1), [[], [], []]);
});

test("a tile keeps its picture's shape, within a wide landscape and a tall phone video", () => {
  assert.equal(tileRatio({ media: [{ width: 960, height: 1280 }] }), 1280 / 960);
  assert.equal(tileRatio({ media: [{ width: 720, height: 1316 }] }), 1316 / 720);
  assert.equal(tileRatio({ media: [{ width: 400, height: 1600 }] }), 1.9, "a sliver is kept to phone-video height");
  assert.equal(tileRatio({ media: [{ width: 3000, height: 1000 }] }), 0.6, "a panorama is kept to a landscape");
  assert.equal(tileRatio({ media: [] }), 1.25);
  assert.equal(clampRatio(Number.NaN), 1.25);
  assert.equal(clampRatio(0), 1.25);
});
