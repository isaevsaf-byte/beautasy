import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCaptionOptions, buildHashtags } from "./socialCaptions";

const bralette = {
  name: "Silk Bralette",
  category: "Lingerie",
  price: 5800,
  color: "Ivory",
  productionTime: "5–7 days",
};

test("five captions are offered, and no two of them are the same", () => {
  const options = buildCaptionOptions(bralette);
  assert.equal(options.length, 5);
  assert.equal(new Set(options).size, 5);
});

test("prices are shown in pounds, not the pence they are stored as", () => {
  const options = buildCaptionOptions(bralette).join(" ");
  assert.match(options, /£58\b/);
  assert.doesNotMatch(options, /5800/);
});

test("a round price loses its trailing pennies", () => {
  const options = buildCaptionOptions({ name: "Scrunchie", price: 900 }).join(" ");
  assert.match(options, /£9\b/);
  assert.doesNotMatch(options, /£9\.00/);
});

test("a product with no price never invents one", () => {
  const options = buildCaptionOptions({ name: "Sample Piece" }).join(" ");
  assert.doesNotMatch(options, /£/);
});

test("made-to-measure gets its own angle instead of the colour line", () => {
  const options = buildCaptionOptions({ ...bralette, madeToMeasureAvailable: true }).join(" ");
  assert.match(options, /measurements/i);
});

test("captions carry no hashtags — those are added at posting time", () => {
  for (const caption of buildCaptionOptions(bralette)) {
    assert.doesNotMatch(caption, /#/);
  }
});

test("hashtags mix the category with the local ones", () => {
  const tags = buildHashtags(bralette);
  assert.match(tags, /#handmadelingerie/);
  assert.match(tags, /#southampton/);
});

test("an unknown category still gets usable hashtags", () => {
  const tags = buildHashtags({ name: "Something New", category: "Nonsense" });
  assert.match(tags, /#handmadeuk/);
  assert.match(tags, /#beautasy/);
});

/*
 * Her voice, not a copywriter's. The first brief banned emoji and warmth, and
 * the drafts it produced were accurate and never approved — so these guard the
 * shape of how Kristina actually writes.
 */

test("captions keep their paragraph breaks — they are how she writes", () => {
  for (const caption of buildCaptionOptions(bralette)) {
    assert.match(caption, /\n\n/, `No blank line in: ${caption}`);
  }
});

test("captions open with a feeling, not with the product name", () => {
  for (const caption of buildCaptionOptions(bralette)) {
    assert.ok(!caption.startsWith(bralette.name), `Opens with the name: ${caption}`);
  }
});

test("each caption carries a little of her warmth — an emoji, but never a row of them", () => {
  const emoji = /\p{Extended_Pictographic}/gu;
  for (const caption of buildCaptionOptions(bralette)) {
    const count = (caption.match(emoji) ?? []).length;
    assert.ok(count >= 1 && count <= 3, `${count} emoji in: ${caption}`);
  }
});

test("a product name reads as a sentence, never 'Every The ...'", () => {
  const options = buildCaptionOptions({ name: 'The "Cloud" Silk Scrunchie', price: 1500 }).join(" ");
  assert.doesNotMatch(options, /\b(Every|each) The\b/i);
});
