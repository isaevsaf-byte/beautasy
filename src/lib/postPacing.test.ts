import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * How the queue applies the posting rules.
 *
 * The rules are tested on their own in postingRules.test.ts. These guard the
 * wiring: that the scheduled run asks them before choosing anything, sends at
 * most one post, and that the Studio's own button is left alone.
 */

const QUEUE = readFileSync(join(process.cwd(), "src", "lib", "socialQueue.ts"), "utf8");
const scheduled = QUEUE.slice(
  QUEUE.indexOf("export async function publishDuePosts"),
  QUEUE.indexOf("export async function publishPostById")
);
const manual = QUEUE.slice(QUEUE.indexOf("export async function publishPostById"));

test("the schedule asks the rules before it chooses a post", () => {
  const asked = scheduled.indexOf("mayPublish(");
  const chosen = scheduled.indexOf("DUE_POSTS");
  assert.notEqual(asked, -1, "publishing no longer consults the posting rules");
  assert.ok(asked < chosen, "Ask the rules before picking anything to send.");
  assert.match(scheduled, /verdict\.ok\s*\?[\s\S]*?:\s*\[\]/, "A held run must send nothing.");
});

test("the rules are asked after Reels are finished, so those count", () => {
  assert.ok(
    scheduled.indexOf("await resumeReels(") < scheduled.indexOf("POSTING_STATE"),
    "Count today's posts after finishing Reels, or a finished Reel is invisible to the limit."
  );
});

test("one scheduled post per run", () => {
  assert.match(scheduled, /DUE_POSTS, \{[^}]*limit: 1 \}/);
});

test("today is counted from Southampton midnight, not a rolling window", () => {
  assert.match(scheduled, /startOfSouthamptonDay\(now\)/);
  assert.ok(!/PACE_HOURS/.test(QUEUE), "The old 20-hour window is gone.");
});

test("a post stuck on 'publishing' cannot block the queue forever", () => {
  assert.match(QUEUE, /status == "publishing"\s*&& dateTime\(_updatedAt\) > dateTime\(\$staleBefore\)/);
});

test("a post that went out without a date written still counts", () => {
  assert.match(QUEUE, /\(defined\(publishedAt\) \|\| status in \["publishing", "published"\]\)/);
  assert.match(QUEUE, /dateTime\(coalesce\(publishedAt, _updatedAt\)\) >= dateTime\(\$dayStart\)/);
});

test("dated posts are sent before older undated ones", () => {
  assert.match(QUEUE, /order\(defined\(scheduledFor\) desc, coalesce\(scheduledFor, createdAt\) asc\)/);
});

test("posting settings come from the document the Studio edits", () => {
  assert.match(QUEUE, /\$\{SITE_SETTINGS\}\.socialPosting/);
});

test("'Post this now' is not held by quiet hours or the daily limit", () => {
  assert.ok(!manual.includes("mayPublish("), "The manual button must not be held back.");
  assert.ok(!manual.includes("POSTING_STATE"), "The manual button must not be held back.");
});
