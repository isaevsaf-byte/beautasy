import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionDescription } from "./collectionMeta";

test("a collection named in full is not named twice", () => {
  assert.equal(
    collectionDescription("The Essence Collection"),
    "Shop The Essence Collection — handmade pieces crafted with love in Southampton."
  );
});

test("a short name gets what it lacks, and the season when there is one", () => {
  assert.equal(
    collectionDescription("Essence", "Autumn 2026"),
    "Shop the Essence collection (Autumn 2026) — handmade pieces crafted with love in Southampton."
  );
  assert.doesNotMatch(collectionDescription("The Bloom"), /the The/i);
  assert.doesNotMatch(collectionDescription("Bloom Collection"), /collection collection/i);
});
