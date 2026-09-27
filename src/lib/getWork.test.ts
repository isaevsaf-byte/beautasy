import { test } from "node:test";
import assert from "node:assert/strict";
import { sanityClient } from "./sanity";
import { getWork, readWork } from "./getWork";

/**
 * What a Sanity outage does to the pages. /work must fail its rebuild — so the
 * last good page keeps being served — rather than rebuild as an empty gallery
 * that tells Google to forget it; the pages that only show a row of work carry
 * on without the row, and say they don't know rather than that there is none.
 */

test("when Sanity can't be read, /work's reader fails and the others say 'unknown'", async (t) => {
  const quiet = t.mock.method(console, "error", () => {});
  t.mock.method(sanityClient, "fetch", async () => {
    throw new Error("Sanity is down");
  });
  await assert.rejects(readWork(), /Sanity is down/);
  assert.deepEqual(await getWork(), { pieces: [], showreel: null, known: false });
  assert.equal(quiet.mock.callCount(), 1, "the failure is logged once");
});

test("an answer from Sanity is known, even an empty one", async (t) => {
  t.mock.method(sanityClient, "fetch", async () => ({ pieces: [], showreel: null }));
  assert.deepEqual(await readWork(), { pieces: [], showreel: null, known: true });
  assert.deepEqual(await getWork(), { pieces: [], showreel: null, known: true });
});
