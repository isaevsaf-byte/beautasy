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

test("a name typed loosely still never says 'the' or 'collection' twice", () => {
  const cases: [name: string, season: string | null, expected: string][] = [
    ["  The   Essence Collection. ", null, "Shop The Essence Collection — handmade pieces crafted with love in Southampton."],
    ["the essence collection", null, "Shop the essence collection — handmade pieces crafted with love in Southampton."],
    ["Essence Collections", null, "Shop the Essence Collections — handmade pieces crafted with love in Southampton."],
    ["Collection of Linen", null, "Shop the Collection of Linen — handmade pieces crafted with love in Southampton."],
    ["THE ESSENCE", null, "Shop THE ESSENCE collection — handmade pieces crafted with love in Southampton."],
    ["Essence", "Autumn Collection 2026", "Shop the Essence (Autumn Collection 2026) — handmade pieces crafted with love in Southampton."],
  ];
  for (const [name, season, expected] of cases) {
    const description = collectionDescription(name, season);
    assert.equal(description, expected, name);
    assert.doesNotMatch(description, /\bthe\s+the\b/i, name);
    assert.ok((description.match(/\bcollections?\b/gi) ?? []).length <= 1, `${name}: "collection" once at most`);
  }
});

test("a word that only starts with 'the' is not taken for 'the'", () => {
  assert.equal(
    collectionDescription("Theodora"),
    "Shop the Theodora collection — handmade pieces crafted with love in Southampton."
  );
});

test("a season typed loosely is tidied too", () => {
  assert.equal(
    collectionDescription("Essence", "  Autumn   2026. "),
    "Shop the Essence collection (Autumn 2026) — handmade pieces crafted with love in Southampton."
  );
});
