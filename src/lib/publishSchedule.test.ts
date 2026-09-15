import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The schedule is what turns "Go out on 21:21" into a post.
 *
 * GitHub treats scheduled workflows as best-effort and is busiest on the hour.
 * Two daily runs at :00 were measured arriving a median of two to four hours
 * late, which left an approved post sitting until nearly midnight. These guard
 * against drifting back to that shape.
 */

const YML = readFileSync(join(process.cwd(), ".github", "workflows", "social-publish.yml"), "utf8");
const crons = [...YML.matchAll(/-\s*cron:\s*"([^"]+)"/g)].map((m) => m[1]);

test("the publisher is scheduled at all", () => {
  assert.ok(crons.length > 0, "No schedule — posts would only ever go out at the morning Vercel run.");
});

test("no run sits on the hour, where GitHub's queue is slowest", () => {
  for (const cron of crons) {
    const minutes = cron.split(/\s+/)[0].split(",");
    assert.ok(!minutes.includes("0"), `"${cron}" starts on the hour.`);
  }
});

test("runs come often enough that a late one is soon followed", () => {
  const perHour = crons
    .filter((c) => c.split(/\s+/)[1] === "*")
    .reduce((n, c) => n + c.split(/\s+/)[0].split(",").length, 0);
  assert.ok(perHour >= 2, `Only ${perHour} run(s) an hour; a delayed run leaves posts waiting for hours.`);
});

test("overlapping runs queue rather than race", () => {
  assert.match(YML, /concurrency:\s*\n\s*group:\s*social-publish/);
});
