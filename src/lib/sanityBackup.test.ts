import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  backupDay,
  backupKey,
  expiredBackups,
  exportTally,
  streamToBucket,
  type BackupBucket,
  type MultipartUpload,
  type UploadedPart,
} from "../../workers/sanity-backup/src/backup";
import worker, { backUp, type Env } from "../../workers/sanity-backup/src/index";

/**
 * The Cloudflare Worker that copies the Sanity dataset into R2 every night.
 *
 * Before it there was no copy of the dataset anywhere, and Sanity's free plan
 * keeps none. It lives outside the shop's build, so nothing else checks it —
 * these do, against a bucket and a Sanity made of plain objects.
 */

const DIR = join(process.cwd(), "workers", "sanity-backup");
const CONFIG = readFileSync(join(DIR, "wrangler.jsonc"), "utf8");
const WORKER = readFileSync(join(DIR, "src", "index.ts"), "utf8");
const README = readFileSync(join(DIR, "README.md"), "utf8");

const TOKEN = "sk-test-token-that-must-never-be-logged";
// A customer's name the way it would sit in a booking; it must never reach a log.
const PRIVATE = "Margaret Private-Surname";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function ndjson(count: number, extra = ""): string {
  let out = "";
  for (let i = 0; i < count; i++) {
    out += JSON.stringify({ _id: `doc-${i}`, _type: "booking", displayName: `${PRIVATE} ${i}${extra}` }) + "\n";
  }
  return out;
}

/** A stream that hands out the bytes in pieces of `size`, and can break off with a network error. */
function streamOf(text: string | Uint8Array, size = 64, breakAfter = -1): ReadableStream<Uint8Array> {
  const bytes = typeof text === "string" ? encoder.encode(text) : text;
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (breakAfter >= 0 && at >= breakAfter) {
        controller.error(new Error("connection reset"));
        return;
      }
      if (at >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(bytes.length, at + size, breakAfter >= 0 ? breakAfter : Infinity);
      controller.enqueue(bytes.slice(at, end));
      at = end;
    },
  });
}

/** An in-memory R2 bucket that keeps a record of what was asked of it. */
function fakeBucket(pageSize = 1000) {
  const objects = new Map<string, Uint8Array>();
  const calls = { puts: 0, multiparts: 0, completed: 0, aborted: 0, partSizes: [] as number[][] };
  const bucket: BackupBucket = {
    async put(key, value) {
      calls.puts += 1;
      objects.set(key, value.slice());
    },
    async createMultipartUpload(key) {
      calls.multiparts += 1;
      const parts = new Map<number, Uint8Array>();
      const upload: MultipartUpload = {
        async uploadPart(partNumber, value) {
          parts.set(partNumber, value.slice());
          return { partNumber, etag: `etag-${partNumber}` };
        },
        async complete(done: UploadedPart[]) {
          calls.completed += 1;
          const ordered = done.map((part) => parts.get(part.partNumber)!);
          calls.partSizes.push(ordered.map((part) => part.length));
          const whole = new Uint8Array(ordered.reduce((sum, part) => sum + part.length, 0));
          let at = 0;
          for (const part of ordered) {
            whole.set(part, at);
            at += part.length;
          }
          objects.set(key, whole);
        },
        async abort() {
          calls.aborted += 1;
        },
      };
      return upload;
    },
    async list({ prefix, cursor }) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
      const from = cursor ? Number(cursor) : 0;
      const page = keys.slice(from, from + pageSize);
      const truncated = from + pageSize < keys.length;
      return { objects: page.map((key) => ({ key })), truncated, cursor: truncated ? String(from + pageSize) : undefined };
    },
    async delete(keys) {
      for (const key of keys) objects.delete(key);
    },
  };
  return { bucket, objects, calls };
}

/** Runs `fn` with console output caught, and hands back everything that was printed. */
async function capturingLogs(fn: () => Promise<void>): Promise<{ logs: string; error: Error | null }> {
  const lines: string[] = [];
  const saved = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  const keep = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  Object.assign(console, { log: keep, error: keep, warn: keep, info: keep, debug: keep });
  let error: Error | null = null;
  try {
    await fn();
  } catch (caught) {
    error = caught as Error;
  } finally {
    Object.assign(console, saved);
  }
  return { logs: lines.join("\n"), error };
}

/** Puts a stand-in for Sanity's export where `fetch` is, for the length of `fn`. */
async function withSanity(
  answer: () => Response,
  fn: (requests: { url: string; headers: Headers }[]) => Promise<void>
): Promise<void> {
  const requests: { url: string; headers: Headers }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers) });
    return answer();
  }) as typeof fetch;
  try {
    await fn(requests);
  } finally {
    globalThis.fetch = real;
  }
}

function env(bucket: BackupBucket, token: string | null = TOKEN): Env {
  return { SANITY_PROJECT_ID: "5uun6fw6", SANITY_DATASET: "production", SANITY_READ_TOKEN: token ?? undefined, BACKUPS: bucket };
}

const TONIGHT = new Date(Date.UTC(2026, 9, 3, 2, 17));

/* ─── What a copy is called, and when it goes ─── */

test("each night's copy is named by its UTC day", () => {
  assert.equal(backupKey("production", TONIGHT), "sanity/production-2026-10-03.ndjson");
  assert.equal(backupKey("production", new Date(Date.UTC(2026, 9, 3, 23, 59, 59))), "sanity/production-2026-10-03.ndjson");
  assert.equal(backupKey("production", new Date(Date.UTC(2027, 0, 5, 0, 0))), "sanity/production-2027-01-05.ndjson");
});

test("only names this Worker writes are read as copies", () => {
  assert.deepEqual(backupDay("sanity/production-2026-10-03.ndjson", "production"), new Date(Date.UTC(2026, 9, 3)));
  for (const other of [
    "sanity/notes.txt",
    "sanity/production-2026-10-03.ndjson.gz",
    "sanity/production-old-2026-10-03.ndjson",
    "sanity/staging-2026-10-03.ndjson",
    "elsewhere/production-2026-10-03.ndjson",
    "sanity/production-2026-02-31.ndjson",
    "sanity/production-2026-13-01.ndjson",
    "sanity/production-latest.ndjson",
  ]) {
    assert.equal(backupDay(other, "production"), null, other);
  }
});

test("copies more than thirty days old go; the rest, and anything else in the bucket, stay", () => {
  const keys: string[] = [];
  for (let day = new Date(Date.UTC(2026, 7, 1)); day <= TONIGHT; day = new Date(day.getTime() + 86_400_000)) {
    keys.push(backupKey("production", day));
  }
  keys.push("sanity/notes.txt", "sanity/production-2026-01-01.ndjson.gz", "sanity/production-2026-12-25.ndjson");

  const expired = expiredBackups(keys, "production", TONIGHT);
  // 2 September is 31 days before 3 October; 3 September is exactly 30.
  assert.ok(expired.includes("sanity/production-2026-09-02.ndjson"));
  assert.ok(!expired.includes("sanity/production-2026-09-03.ndjson"));
  assert.ok(expired.includes("sanity/production-2026-08-01.ndjson"));
  assert.equal(expired.length, 33, "1 August to 2 September");
  for (const kept of ["sanity/notes.txt", "sanity/production-2026-01-01.ndjson.gz", "sanity/production-2026-12-25.ndjson", backupKey("production", TONIGHT)]) {
    assert.ok(!expired.includes(kept), kept);
  }
  // The hour of the run does not move the line.
  assert.deepEqual(expiredBackups(keys, "production", new Date(Date.UTC(2026, 9, 3, 23, 59))), expired);
});

/* ─── Whether an export arrived whole ─── */

test("a whole export passes however the network cuts it into chunks", () => {
  const text = ndjson(7);
  const bytes = encoder.encode(text);
  for (let size = 1; size <= bytes.length; size += size < 20 ? 1 : 37) {
    const tally = exportTally();
    for (let at = 0; at < bytes.length; at += size) tally.see(bytes.slice(at, at + size));
    assert.deepEqual(tally.finish(), { documents: 7, bytes: bytes.length }, `chunks of ${size}`);
  }
});

test("a last document without a newline, and blank lines, are still a whole export", () => {
  const tally = exportTally();
  tally.see(encoder.encode(ndjson(2) + "\n" + JSON.stringify({ _id: "last", _type: "t" })));
  assert.equal(tally.finish().documents, 3);
});

test("an export that stops in the middle of a document is refused, without quoting it", () => {
  const text = ndjson(5);
  const tally = exportTally();
  tally.see(encoder.encode(text.slice(0, text.length - 15)));
  assert.throws(() => tally.finish(), (error: Error) => {
    assert.match(error.message, /stopped in the middle of a document/);
    assert.ok(!error.message.includes(PRIVATE), "the message must not quote the export");
    return true;
  });
});

test("an export that ends with Sanity's error object is refused", () => {
  // What Sanity's own exporter guards against: a 200, then an error where the next document should be.
  for (const ending of ['{"error":{"description":"Internal error"},"statusCode":500}\n', '{"_id":"doc-9","displ{"error":{"description":"Internal error"}}\n']) {
    const tally = exportTally();
    tally.see(encoder.encode(ndjson(3) + ending));
    assert.throws(() => tally.finish(), /ended with an error from Sanity/);
  }
});

test("an empty export is refused — production is never empty", () => {
  const tally = exportTally();
  tally.see(new Uint8Array(0));
  assert.throws(() => tally.finish(), /empty/);
});

/* ─── Getting it into R2 ─── */

test("a small export goes up in one put, byte for byte", async () => {
  const { bucket, objects, calls } = fakeBucket();
  const text = ndjson(20);
  const summary = await streamToBucket(bucket, "k", streamOf(text, 7), exportTally());
  assert.deepEqual(summary, { documents: 20, bytes: encoder.encode(text).length });
  assert.equal(decoder.decode(objects.get("k")), text);
  assert.deepEqual([calls.puts, calls.multiparts], [1, 0]);
});

test("a big export streams up in equal parts, never held whole", async () => {
  // Parts of 100 bytes stand in for R2's 5 MB, which keeps the test small.
  for (const size of [1, 13, 100, 333]) {
    const { bucket, objects, calls } = fakeBucket();
    const text = ndjson(40);
    await streamToBucket(bucket, "k", streamOf(text, size), exportTally(), 100);
    assert.equal(decoder.decode(objects.get("k")), text, `chunks of ${size}`);
    assert.deepEqual([calls.puts, calls.multiparts, calls.completed], [0, 1, 1]);
    const sizes = calls.partSizes[0];
    // R2's rule: every part but the last exactly the same size.
    assert.ok(sizes.slice(0, -1).every((partSize) => partSize === 100), `${sizes}`);
    assert.ok(sizes[sizes.length - 1] > 0 && sizes[sizes.length - 1] <= 100);
  }
});

test("an export of exactly whole parts sends no empty last part", async () => {
  const { bucket, objects, calls } = fakeBucket();
  const bytes = encoder.encode(ndjson(10));
  const partBytes = bytes.length / 2;
  assert.ok(Number.isInteger(partBytes));
  await streamToBucket(bucket, "k", streamOf(bytes, 9), exportTally(), partBytes);
  assert.deepEqual(calls.partSizes, [[partBytes, partBytes]]);
  assert.equal(objects.get("k")!.length, bytes.length);
});

test("a broken export leaves nothing behind, small or big", async () => {
  const text = ndjson(40);
  const cut = text.slice(0, text.length - 10);
  for (const partBytes of [1_000_000, 100]) {
    const { bucket, objects, calls } = fakeBucket();
    await assert.rejects(streamToBucket(bucket, "k", streamOf(cut, 50), exportTally(), partBytes), /incomplete/);
    assert.equal(objects.size, 0, "nothing was saved");
    assert.equal(calls.completed, 0);
    if (partBytes === 100) assert.equal(calls.aborted, 1, "the parts already sent are abandoned");
  }
  // A connection that drops part way through is the same story.
  const { bucket, objects, calls } = fakeBucket();
  await assert.rejects(streamToBucket(bucket, "k", streamOf(text, 50, 700), exportTally(), 100), /connection reset/);
  assert.equal(objects.size, 0);
  assert.equal(calls.aborted, 1);
});

/* ─── The night's run, end to end ─── */

test("a night's run saves tonight's copy and prunes the old ones", async () => {
  const { bucket, objects } = fakeBucket(1); // one key a page, so the listing has to follow the cursor
  for (const key of ["sanity/production-2026-08-15.ndjson", "sanity/production-2026-09-02.ndjson", "sanity/production-2026-09-03.ndjson", "sanity/production-2026-10-02.ndjson", "sanity/notes.txt"]) {
    objects.set(key, encoder.encode("old"));
  }
  const text = ndjson(12);

  await withSanity(
    () => new Response(streamOf(text, 33), { status: 200 }),
    async (requests) => {
      const { logs, error } = await capturingLogs(() => worker.scheduled({ cron: "17 2 * * *", scheduledTime: TONIGHT.getTime() }, env(bucket)));
      assert.equal(error, null);

      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, "https://5uun6fw6.api.sanity.io/v2021-06-07/data/export/production");
      assert.equal(requests[0].headers.get("authorization"), `Bearer ${TOKEN}`);
      assert.ok(!requests[0].url.includes(TOKEN), "the token goes in a header, not the address");

      assert.equal(decoder.decode(objects.get("sanity/production-2026-10-03.ndjson")), text);
      assert.deepEqual([...objects.keys()].sort(), [
        "sanity/notes.txt",
        "sanity/production-2026-09-03.ndjson",
        "sanity/production-2026-10-02.ndjson",
        "sanity/production-2026-10-03.ndjson",
      ]);

      assert.match(logs, /"documents":12/, "the log says how many documents, so a sudden drop shows");
      assert.ok(!logs.includes(TOKEN), "the token is never logged");
      assert.ok(!logs.includes(PRIVATE), "no document content is logged");
    }
  );
});

test("a failed night saves nothing, prunes nothing, and says so without the token or the data", async () => {
  const text = ndjson(12);
  const answers: [string, () => Response, RegExp][] = [
    ["refused", () => new Response(`{"error":"Unauthorized","token":"${TOKEN}"}`, { status: 401 }), /answered 401/],
    ["cut off", () => new Response(streamOf(text.slice(0, -20), 33), { status: 200 }), /incomplete/],
    ["dropped", () => new Response(streamOf(text, 33, 200), { status: 200 }), /connection reset/],
  ];
  for (const [what, answer, expected] of answers) {
    const { bucket, objects } = fakeBucket();
    objects.set("sanity/production-2026-08-01.ndjson", encoder.encode("old"));
    await withSanity(answer, async () => {
      const { logs, error } = await capturingLogs(() => backUp(env(bucket), TONIGHT));
      assert.ok(error, `${what}: the run must fail, so the dashboard shows it`);
      assert.match(error!.message, expected, what);
      assert.ok(!objects.has("sanity/production-2026-10-03.ndjson"), `${what}: nothing saved`);
      assert.ok(objects.has("sanity/production-2026-08-01.ndjson"), `${what}: old copies kept when tonight failed`);
      for (const said of [logs, error!.message]) {
        assert.ok(!said.includes(TOKEN), `${what}: token leaked`);
        assert.ok(!said.includes(PRIVATE), `${what}: data leaked`);
      }
    });
  }
});

test("without its token the Worker fails loudly and asks Sanity for nothing", async () => {
  const { bucket } = fakeBucket();
  await withSanity(
    () => new Response(ndjson(1)),
    async (requests) => {
      await assert.rejects(backUp(env(bucket, null), TONIGHT), /SANITY_READ_TOKEN is not set/);
      assert.equal(requests.length, 0);
    }
  );
});

/* ─── The Worker's settings ─── */

test("it runs once a night, at a fixed time", () => {
  const crons = [...CONFIG.matchAll(/"crons":\s*\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((c) => c[1]));
  assert.equal(crons.length, 1, "One schedule: more would take more than one copy a night.");
  const [minute, hour, ...rest] = crons[0].split(/\s+/);
  assert.match(minute, /^\d+$/);
  assert.match(hour, /^\d+$/);
  assert.deepEqual(rest, ["*", "*", "*"]);
});

test("it is not reachable from the internet", () => {
  assert.match(CONFIG, /"workers_dev":\s*false/, "A cron-only Worker needs no public address.");
  assert.ok(!/async fetch\(/.test(WORKER), "No fetch handler: nothing for a stranger to call.");
});

test("the token is never written into the config, and the names line up", () => {
  assert.ok(!/"SANITY_READ_TOKEN"\s*:/.test(CONFIG), "SANITY_READ_TOKEN belongs in `wrangler secret put`, not in vars.");
  assert.match(CONFIG, /"binding":\s*"BACKUPS"/, "the code writes to env.BACKUPS");
  assert.match(CONFIG, /"bucket_name":\s*"beautasy-backups"/);
  assert.match(CONFIG, /"SANITY_PROJECT_ID":\s*"5uun6fw6"/);
  assert.match(CONFIG, /"SANITY_DATASET":\s*"production"/);
  // The guide is what a person follows on a bad day; it has to name the same things.
  assert.match(README, /wrangler secret put SANITY_READ_TOKEN/);
  assert.match(README, /wrangler r2 bucket create beautasy-backups/);
});

test("a downloaded copy cannot be committed from the Worker's folder", () => {
  const ignored = readFileSync(join(DIR, ".gitignore"), "utf8");
  assert.match(ignored, /^\*\.ndjson$/m, "the repository is public, and a copy holds customers' names");
  assert.match(ignored, /^\.dev\.vars/m);
});
