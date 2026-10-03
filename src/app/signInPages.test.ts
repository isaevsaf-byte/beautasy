import { test } from "node:test";
import assert from "node:assert/strict";
import robots from "./robots";
import { metadata as signIn } from "./sign-in/[[...sign-in]]/page";
import { metadata as signUp } from "./sign-up/[[...sign-up]]/page";

/**
 * Signing in is not something to find in a search. robots.txt keeps crawlers
 * out of both addresses — as prefixes, so /sign-in itself is covered as well
 * as everything under it — and each page also says noindex, for anything
 * that fetches it regardless, under a title of its own.
 */

test("robots.txt keeps crawlers out of signing in and signing up", () => {
  const rules = [robots().rules].flat();
  const everyone = rules.find((rule) => rule.userAgent === "*");
  const disallow = [everyone?.disallow ?? []].flat();
  assert.ok(disallow.includes("/sign-in"), "/sign-in, with no trailing slash, so the bare address is covered too");
  assert.ok(disallow.includes("/sign-up"));
});

test("both pages say noindex, under their own titles", () => {
  for (const [where, meta] of [["sign-in", signIn], ["sign-up", signUp]] as const) {
    assert.deepEqual(meta.robots, { index: false, follow: true }, where);
    assert.match(String(meta.title), /\| Beautasy$/, where);
  }
  assert.notEqual(signIn.title, signUp.title);
});
