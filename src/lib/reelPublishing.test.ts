import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards what stops a Reel going out twice, or not at all.
 *
 * Video is the one thing in this pipeline that does not finish inside a
 * request: Instagram transcodes before it will publish, and that regularly
 * outlasts the sixty seconds a function on this plan is given. So a Reel is
 * uploaded in one run and published in a later one, which means the moment
 * between them is exposed — and a duplicate Reel is public and cannot be taken
 * back.
 *
 * Three things hold it together: the post is claimed before anything is
 * uploaded, the container id is written down before the publish is attempted,
 * and running out of time is reported as "still working" rather than as a
 * failure. Break any one and everything still compiles.
 */

const QUEUE = readFileSync(join(process.cwd(), "src", "lib", "socialQueue.ts"), "utf8");
const IG = readFileSync(join(process.cwd(), "src", "lib", "instagram.ts"), "utf8");

test("the post is claimed before a single frame is uploaded", () => {
  const claim = QUEUE.indexOf("if (!(await claim(post)))");
  const upload = QUEUE.indexOf("return await publishReel(");
  assert.notEqual(claim, -1, "the queue no longer claims a post before sending it");
  assert.notEqual(upload, -1, "the queue no longer sends Reels");
  assert.ok(claim < upload, "Claim first, or two runs upload the same film.");
});

test("the container id is saved before the publish is attempted", () => {
  const reel = QUEUE.slice(QUEUE.indexOf("async function publishReel"));
  const saved = reel.indexOf("igCreationId: started.creationId");
  const publish = reel.indexOf("await finishReel(");
  assert.notEqual(saved, -1, "the half-finished upload is no longer written down");
  assert.ok(saved < publish, "Save the container first, or a crash orphans the upload.");
});

test("running out of time is not a failure", () => {
  assert.match(
    QUEUE,
    /result\.error === "still-processing"/,
    "A Reel Instagram is still preparing must be resumed, not marked failed."
  );
});

test("every run finishes what the last one started, before starting more", () => {
  const resume = QUEUE.indexOf("await resumeReels(limit)");
  const fetchDue = QUEUE.indexOf("DUE_POSTS, {");
  assert.notEqual(resume, -1, "the queue no longer resumes Reels left transcoding");
  assert.ok(resume < fetchDue, "Finish uploaded Reels before queueing new work.");
});

test("a Reel goes to the feed as well as the Reels tab", () => {
  assert.match(
    IG,
    /share_to_feed: "true"/,
    "Without this, the people who already follow the shop never see it."
  );
});

test("waiting for a container reports working, ready or failed — never a lie", () => {
  assert.match(IG, /budgetMs/, "The wait is no longer bounded by a budget.");
  assert.match(
    IG,
    /if \(Date\.now\(\) \+ wait >= until\) return "working";/,
    "Running out of budget must be reported as still working, not as ready."
  );
});
