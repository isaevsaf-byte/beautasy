import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * One post a day, however many are due.
 *
 * The account has a few dozen followers. Approving a backlog used to mean
 * fifteen posts within a day and a half, which reads as spam and costs every
 * one of them reach. Scheduled dates alone do not prevent it: a date set two
 * weeks ago and approved today is already overdue, and so is each one after.
 */

const QUEUE = readFileSync(join(process.cwd(), "src", "lib", "socialQueue.ts"), "utf8");
const scheduled = QUEUE.slice(QUEUE.indexOf("export async function publishDuePosts"));

test("the schedule asks what already went out before choosing what to send", () => {
  const counted = scheduled.indexOf("PUBLISHED_RECENTLY");
  const chosen = scheduled.indexOf("DUE_POSTS");
  assert.notEqual(counted, -1, "publishing no longer checks what went out recently");
  assert.ok(counted < chosen, "Count recent posts before picking new ones.");
});

test("no more than one scheduled post in the window", () => {
  assert.match(scheduled, /Math\.max\(0, 1 - recent/, "The daily allowance is one post.");
  assert.match(scheduled, /allowance === 0\s*\? \[\]/, "An exhausted allowance sends nothing.");
});

test("'Post this now' is not paced — that is Kristina asking", () => {
  const manual = QUEUE.slice(QUEUE.indexOf("export async function publishPostById"));
  assert.ok(!manual.includes("PUBLISHED_RECENTLY"), "The manual button must not be held back.");
});
