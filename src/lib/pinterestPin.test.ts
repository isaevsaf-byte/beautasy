import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pinTextFrom } from "./pinterest";

/**
 * What a Pin is for, and what must not take a post down with it.
 *
 * Pinterest is a search engine: the link is the entire return on the work, and
 * a description full of hashtags is clutter that ranks for nothing. Those are
 * the two things worth pinning down in code.
 *
 * The other half is ordering. A Pin is the second thing that happens to a
 * post, and a shop that pinned something Instagram never received would be the
 * wrong way round.
 */

const QUEUE = readFileSync(join(process.cwd(), "src", "lib", "socialQueue.ts"), "utf8");

test("hashtags are left out of a Pin — they rank for nothing there", () => {
  const { description } = pinTextFrom({
    productName: 'The "Amour" Cotton Briefs',
    caption: "A scalloped edge takes longer.\n\nMade here.\n\n#handmadelingerie #southampton",
    category: "Lingerie",
  });
  assert.ok(!description.includes("#"), "A Pin description should carry words, not tags.");
  assert.match(description, /Made here\./, "The words themselves must survive.");
});

test("the town goes in, because it is a search people make", () => {
  const { description } = pinTextFrom({ caption: "Something", category: "Lingerie" });
  assert.match(description, /Southampton/);
});

test("Pinterest's limits are respected rather than discovered", () => {
  const { title, description } = pinTextFrom({
    productName: "x".repeat(400),
    caption: "y".repeat(2000),
    category: "Lingerie",
  });
  assert.ok(title.length <= 100, "Pinterest truncates a long title silently.");
  assert.ok(description.length <= 800, "Pinterest truncates a long description silently.");
});

test("a Pin is only made once the post is actually published", () => {
  const publish = QUEUE.indexOf('status: "published"');
  const pin = QUEUE.indexOf("await pinIfWanted(post)");
  assert.notEqual(pin, -1, "the queue no longer pins anything");
  assert.ok(publish < pin, "Pin as part of recording the publish, never before it.");
});

test("a Pin that fails cannot fail the post", () => {
  const fn = QUEUE.slice(QUEUE.indexOf("async function pinIfWanted"));
  assert.match(fn, /catch \(error\)/, "Pinning must swallow its own errors.");
  assert.match(fn, /pinError:/, "…and record them where Kristina can see them.");
});

test("the Pin carries a link to the product, not just to the shop", () => {
  assert.match(
    QUEUE,
    /\/shop\/\$\{post\.productSlug\}/,
    "A Pin without a product link is a picture on somebody else's website."
  );
});
