import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the one ordering that keeps a post from going out twice.
 *
 * Publishing is not like the rest of this codebase: a duplicate is public,
 * arrives on customers' feeds, and cannot be taken back. Five callers can ask
 * for the same post at the same moment — the morning cron, either GitHub
 * schedule, the Studio button, and any stranger, since /api/social/publish
 * deliberately carries no secret. What separates them is that the post is
 * claimed with `ifRevisionId` before anything is sent, so Sanity lets exactly
 * one caller through.
 *
 * Reorder those two steps and everything still type-checks, every other test
 * still passes, and the bug only shows up as two identical pictures on
 * Instagram. So the order is asserted here, on the source itself: mocking the
 * Sanity client would test a stand-in, not the thing that actually has to hold.
 */

const SOURCE = readFileSync(join(process.cwd(), "src", "lib", "socialQueue.ts"), "utf8");

/** The body of publishOne, where the ordering matters. */
function publishOneBody(): string {
  const start = SOURCE.indexOf("async function publishOne");
  assert.notEqual(start, -1, "publishOne has been renamed — update this test");
  const next = SOURCE.indexOf("\nexport async function", start);
  return SOURCE.slice(start, next === -1 ? undefined : next);
}

test("a post is claimed before it is sent to Instagram", () => {
  const body = publishOneBody();
  const claimAt = body.indexOf("claim(post)");
  const sendAt = body.indexOf("publishToInstagram(");

  assert.notEqual(claimAt, -1, "publishOne no longer claims the post");
  assert.notEqual(sendAt, -1, "publishOne no longer sends to Instagram");
  assert.ok(
    claimAt < sendAt,
    "The claim has to happen first. Sending before claiming leaves the post reading as approved-and-due for as long as Instagram takes to answer, and every other caller in that window sends the same picture."
  );
});

test("the claim is conditional on the revision it read", () => {
  assert.match(
    SOURCE,
    /ifRevisionId\(post\._rev\)/,
    "Without ifRevisionId the claim overwrites whatever another run just wrote, so both callers think they won and both post."
  );
});

test("the publish queries only ever pick up approved posts", () => {
  // A post mid-flight sits on "publishing". Widening either query to include
  // it — or dropping the status check — hands the same post to a second run.
  for (const name of ["DUE_POSTS", "ONE_POST"]) {
    const start = SOURCE.indexOf(`const ${name}`);
    assert.notEqual(start, -1, `${name} has been renamed — update this test`);
    const query = SOURCE.slice(start, SOURCE.indexOf("`;", start));

    assert.ok(
      query.includes(`status == "approved"`),
      `${name} must select only approved posts`
    );
    assert.ok(
      query.includes("_rev"),
      `${name} must read _rev, or the claim cannot be conditional on it`
    );
  }
});
