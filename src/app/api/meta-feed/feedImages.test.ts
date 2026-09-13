import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
