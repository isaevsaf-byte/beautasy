import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Cloudflare Worker that wakes the publisher.
 *
 * It replaced GitHub's scheduler as the main alarm clock after GitHub ran an
 * every-15-minutes schedule 4 times in a day. It lives outside the shop's
 * build, so nothing else checks it — these do.
 */

const DIR = join(process.cwd(), "workers", "publish-cron");
const CONFIG = readFileSync(join(DIR, "wrangler.jsonc"), "utf8");
const WORKER = readFileSync(join(DIR, "src", "index.ts"), "utf8");

test("it runs several times an hour, off the hour", () => {
  const crons = [...CONFIG.matchAll(/"crons":\s*\[([^\]]*)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/"([^"]+)"/g)].map((c) => c[1])
  );
  assert.ok(crons.length > 0, "No cron trigger — the Worker would never wake.");
  for (const cron of crons) {
    const minutes = cron.split(/\s+/)[0].split(",");
    assert.ok(minutes.length >= 2, `"${cron}" runs less than twice an hour.`);
    assert.ok(!minutes.includes("0"), `"${cron}" starts on the hour.`);
  }
});

test("it is not reachable from the internet", () => {
  assert.match(CONFIG, /"workers_dev":\s*false/, "A cron-only Worker needs no public address.");
  assert.ok(!/async fetch\(/.test(WORKER), "No fetch handler: nothing for a stranger to call.");
});

test("the secret is never written into the config", () => {
  assert.ok(!/"CRON_SECRET"\s*:/.test(CONFIG), "CRON_SECRET belongs in `wrangler secret put`, not in vars.");
});

test("a failed knock is reported, not swallowed", () => {
  assert.match(WORKER, /if \(!res\.ok\)[\s\S]*?throw new Error/, "A non-2xx answer must fail the invocation.");
  assert.match(WORKER, /if \(!env\.CRON_SECRET\)[\s\S]*?throw new Error/, "A missing secret must fail loudly.");
});
