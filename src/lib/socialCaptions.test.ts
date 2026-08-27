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
