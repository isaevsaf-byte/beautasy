import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUSINESS } from "./business";

/**
 * A completed fitting always asks for a Google review.
 *
 * The link is looked for in the Studio, then in an environment variable, and
 * last in business.ts. For weeks the Studio field was empty and the variable
 * unset, so nobody was asked — while the link sat in business.ts all along.
 */

const LOOKUP = readFileSync(join(process.cwd(), "src", "lib", "siteSettings.ts"), "utf8");

test("the profile link from business.ts is the last resort", () => {
  assert.match(LOOKUP, /process\.env\.GOOGLE_REVIEW_URL \|\| BUSINESS\.googleReviewUrl/);
});

test("that link opens the review box, not the profile page", () => {
  const url = BUSINESS.googleReviewUrl;
  assert.ok(url.includes("g.page/r/") || url.includes("writereview"), url);
  assert.match(url, /\/review\/?$/);
});
