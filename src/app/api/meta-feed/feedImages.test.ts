import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SOCIAL_CARD_SIZE, SOCIAL_CARD_URL } from "../../../lib/socialCard";

/**
 * The product feed is read by Meta's and Pinterest's catalogue crawlers, not by
 * browsers. The shop's urlFor adds auto=format, which serves WebP to anyone who
 * accepts it — right for a browser, and a silent reject waiting to happen for a
 * catalogue that documents JPEG and PNG.
 */

const FEED = readFileSync(join(process.cwd(), "src", "app", "api", "meta-feed", "route.ts"), "utf8");

test("catalogue pictures are never negotiated into WebP", () => {
  assert.ok(!/urlFor\(/.test(FEED), "urlFor adds auto=format; build catalogue URLs without it.");
  assert.match(FEED, /\.format\("jpg"\)/, "Pin the format to JPEG explicitly.");
});

test("children's pieces are labelled as children's", () => {
  assert.match(FEED, /Kids:\s*\{\s*ageGroup:\s*"kids"\s*\}/, "Kids without an age group compete with adult lingerie.");
});

/**
 * Meta refuses a catalogue image smaller than 500 on either side. The fallback
 * used to be public/beautasy-icon.png, which was re-saved at 512x438 while the
 * social card was being built — under the limit on height, and nothing in the
 * feed would have said so. Meta simply drops the product.
 */
test("a product with no photograph still carries a picture Meta will accept", () => {
  assert.match(
    FEED,
    /allImages\[0\] \?\? SOCIAL_CARD_URL/,
    "Name the fallback through socialCard.ts so its size travels with it."
  );
  assert.ok(
    !/\?\?\s*`\$\{SITE_URL\}\/beautasy-icon\.png`/.test(FEED),
    "The favicon is 512x438 and fails Meta's 500x500 minimum on height."
  );
  assert.ok(
    SOCIAL_CARD_SIZE.width >= 500 && SOCIAL_CARD_SIZE.height >= 500,
    `The fallback card is ${SOCIAL_CARD_SIZE.width}x${SOCIAL_CARD_SIZE.height}; Meta wants 500 on both sides.`
  );
  assert.ok(SOCIAL_CARD_URL.startsWith("http"), "Meta fetches this URL from outside; it has to be absolute.");
});
