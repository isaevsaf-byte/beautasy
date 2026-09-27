import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * "Book by hand", "Move to another time", "Show contact details" and the
 * dashboard prove who is asking by handing the site the Studio's session
 * token (see ./studioToken.ts). Under Sanity's default login the session sits
 * in a cookie on Sanity's own domain wherever the browser allows one — out of
 * the page's reach — and in Chrome all four answered "Could not find your
 * Studio session".
 */
test("the Studio keeps its session where its own tools can hand it to the site", () => {
  const config = readFileSync(join(process.cwd(), "sanity.config.ts"), "utf8");
  assert.match(config, /auth: \{ loginMethod: "token" \}/);
});
