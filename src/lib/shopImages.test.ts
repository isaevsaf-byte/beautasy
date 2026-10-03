import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD, THUMB, sizedImageUrl } from "./shopImages";
import { cardAction } from "./shopCard";

const sanity =
  "https://cdn.sanity.io/images/5uun6fw6/production/abc-1200x1500.jpg?rect=0,10,1200,1500&w=800&h=1000&auto=format";

test("a Sanity photo is asked for at the size it is shown, crop and format kept", () => {
  assert.equal(
    sizedImageUrl(sanity, THUMB),
    "https://cdn.sanity.io/images/5uun6fw6/production/abc-1200x1500.jpg?rect=0,10,1200,1500&auto=format&w=160&h=200"
  );
  assert.match(sizedImageUrl(sanity, CARD), /&w=400&h=500$/);
  assert.equal(
    sizedImageUrl("https://cdn.sanity.io/images/p/d/plain.jpg", THUMB),
    "https://cdn.sanity.io/images/p/d/plain.jpg?w=160&h=200"
  );
});

test("anything that is not a Sanity photo is left alone", () => {
  const placeholder = "https://placehold.co/400x500/E6E6FA/4A4A4A?text=Product";
  assert.equal(sizedImageUrl(placeholder, THUMB), placeholder);
  assert.equal(sizedImageUrl("/beautasy-logo-gold.png", THUMB), "/beautasy-logo-gold.png");
});

test("a card sends a piece with a choice to its page, and adds only what has none", () => {
  assert.deepEqual(cardAction({ availableSizes: ["S"], colorCount: 2 }), { kind: "page", label: "Choose Size" });
  // The Cloud sleeping mask: four colours, no sizes — it went in the bag colourless
  assert.deepEqual(cardAction({ availableSizes: [], colorCount: 4 }), { kind: "page", label: "Choose Colour" });
  assert.deepEqual(cardAction({ availableSizes: [], colorCount: 0 }), { kind: "add" });
  // A listing that doesn't say how many colours cannot know there are none
  assert.deepEqual(cardAction({ availableSizes: [] }), { kind: "page", label: "View Options" });
});
