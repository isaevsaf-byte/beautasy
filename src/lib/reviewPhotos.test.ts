import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, parse } from "groq-js";
import {
  ABANDONED_UPLOADS_QUERY,
  REVIEW_UPLOAD_SOURCE,
  SWEEP_PER_RUN,
  photosFromThisLink,
  reviewUploadMark,
  sweepAbandonedReviewPhotos,
  type SweepDeps,
} from "./reviewPhotos";

// The mark is a keyed fingerprint; it reads the key when it is made, not on import
process.env.DATA_SECRET = "test-secret-for-the-review-photos-suite";

/**
 * Review photos are uploaded before the review is written, and the review
 * names its photos by id, from the browser. So two things are guarded here:
 * a review keeps only photos uploaded with its own link, and photos no review
 * kept are cleared away after a day — never anything else in the asset store,
 * which is Kristina's own media from the Studio.
 *
 * The queries are run, not read: groq-js is Sanity's own evaluator.
 */

const NOW = new Date("2026-10-03T09:00:00Z");
const HOUR = 60 * 60 * 1000;

type Doc = Record<string, unknown>;

function upload(id: string, orderId: string, hoursAgo = 30): Doc {
  return {
    _id: id,
    _type: "sanity.imageAsset",
    _createdAt: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(),
    source: { name: REVIEW_UPLOAD_SOURCE, id: reviewUploadMark(orderId) },
  };
}

/** One of Kristina's own: uploaded in the Studio, no mark at all. */
function studioMedia(id: string, hoursAgo = 30 * 24): Doc {
  return { _id: id, _type: "sanity.imageAsset", _createdAt: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString() };
}

function review(id: string, ...assetIds: string[]): Doc {
  return {
    _id: id,
    _type: "review",
    images: assetIds.map((ref) => ({ _key: ref, _type: "image", asset: { _type: "reference", _ref: ref } })),
  };
}

/** A Sanity that answers with groq-js over these documents, and deletes from them. */
function fakeSanity(dataset: Doc[], options: { refuse?: string[] } = {}) {
  const deleted: string[] = [];
  const client = {
    fetch: async <T>(query: string, params: Record<string, unknown>): Promise<T> => {
      const answer = await evaluate(parse(query), { dataset, params });
      return (await answer.get()) as T;
    },
    delete: async (id: string) => {
      if (options.refuse?.includes(id)) throw new Error(`Document ${id} cannot be deleted as there are references to it`);
      deleted.push(id);
      dataset.splice(dataset.findIndex((doc) => doc._id === id), 1);
    },
  };
  return { client, deleted };
}

/* ─── Which photos a review may carry ─── */

test("a review keeps the photos uploaded with its own link", async () => {
  const { client } = fakeSanity([upload("image-a-jpg", "order-1"), upload("image-b-heic", "order-1", 1)]);
  assert.equal(await photosFromThisLink(["image-a-jpg", "image-b-heic"], "order-1", client), true);
  assert.equal(await photosFromThisLink(["image-a-jpg", "image-a-jpg"], "order-1", client), true, "the same photo twice is still its own");
  assert.equal(await photosFromThisLink([], "order-1", client), true, "no photos needs no asking");
});

test("a review cannot carry another customer's photo, or one of Kristina's", async () => {
  const { client } = fakeSanity([
    upload("image-mine-jpg", "order-1"),
    upload("image-theirs-jpg", "order-2"),
    studioMedia("image-kristina-jpg"),
    { _id: "image-other-source-jpg", _type: "sanity.imageAsset", source: { name: "unsplash", id: reviewUploadMark("order-1") } },
  ]);
  assert.equal(await photosFromThisLink(["image-theirs-jpg"], "order-1", client), false, "another order's upload");
  assert.equal(await photosFromThisLink(["image-kristina-jpg"], "order-1", client), false, "Studio media");
  assert.equal(await photosFromThisLink(["image-other-source-jpg"], "order-1", client), false, "the right id under another source");
  assert.equal(await photosFromThisLink(["image-made-up-jpg"], "order-1", client), false, "a photo that does not exist");
  assert.equal(
    await photosFromThisLink(["image-mine-jpg", "image-theirs-jpg"], "order-1", client),
    false,
    "one stranger's photo refuses the lot, rather than being dropped in silence"
  );
});

test("a link's mark is keyed, so a photo does not lead back to its order", () => {
  const mark = reviewUploadMark("order-1");
  assert.match(mark, /^[0-9a-f]{64}$/);
  assert.equal(mark.includes("order-1"), false);
  assert.notEqual(mark, reviewUploadMark("order-2"));
});

/* ─── Clearing away what no review kept ─── */

function deps(client: SweepDeps["client"], configured = true): SweepDeps {
  return { client, configured: () => configured, now: () => NOW };
}

test("a photo no review kept is deleted a day on, and nothing else is", async () => {
  const dataset: Doc[] = [
    upload("image-abandoned-jpg", "order-1", 30),
    upload("image-in-a-review-jpg", "order-1", 30),
    upload("image-in-a-draft-jpg", "order-1", 30),
    upload("image-this-morning-jpg", "order-2", 3),
    studioMedia("image-kristina-unused-jpg"),
    { _id: "image-other-source-jpg", _type: "sanity.imageAsset", _createdAt: "2026-09-01T00:00:00Z", source: { name: "unsplash", id: "x" } },
    { _id: "file-review-upload-pdf", _type: "sanity.fileAsset", _createdAt: "2026-09-01T00:00:00Z", source: { name: REVIEW_UPLOAD_SOURCE, id: "x" } },
    review("review-1", "image-in-a-review-jpg"),
    review("drafts.review-2", "image-in-a-draft-jpg"),
  ];
  const { client, deleted } = fakeSanity(dataset);
  const result = await sweepAbandonedReviewPhotos(deps(client));
  assert.deepEqual(deleted, ["image-abandoned-jpg"]);
  assert.deepEqual(result, { found: 1, deleted: 1, failed: 0 });
  for (const kept of [
    "image-in-a-review-jpg",
    "image-in-a-draft-jpg",
    "image-this-morning-jpg",
    "image-kristina-unused-jpg",
    "image-other-source-jpg",
    "file-review-upload-pdf",
  ]) {
    assert.ok(dataset.some((doc) => doc._id === kept), `${kept} was deleted`);
  }
});

test("a morning deletes a few, oldest first, and leaves the rest for tomorrow", async () => {
  const dataset: Doc[] = Array.from({ length: SWEEP_PER_RUN + 5 }, (_, i) => upload(`image-${String(i).padStart(2, "0")}-jpg`, "order-1", 100 - i));
  const { client, deleted } = fakeSanity(dataset);
  const result = await sweepAbandonedReviewPhotos(deps(client));
  assert.equal(result.deleted, SWEEP_PER_RUN);
  assert.equal(deleted[0], "image-00-jpg", "the oldest goes first");
  assert.equal(dataset.length, 5);
  assert.ok(SWEEP_PER_RUN <= 25, "each delete is a request, and the morning has sixty seconds for everything");
});

test("a photo Sanity will not delete does not stop the others", async () => {
  const { client, deleted } = fakeSanity([upload("image-a-jpg", "order-1"), upload("image-b-jpg", "order-1", 29)], {
    refuse: ["image-a-jpg"],
  });
  const result = await sweepAbandonedReviewPhotos(deps(client));
  assert.deepEqual(deleted, ["image-b-jpg"]);
  assert.deepEqual(result, { found: 2, deleted: 1, failed: 1 });
});

test("without the write token nothing is asked or deleted", async () => {
  let asked = false;
  const client = {
    fetch: async <T>(): Promise<T> => {
      asked = true;
      return [] as T;
    },
    delete: async () => assert.fail("nothing is deleted"),
  };
  const result = await sweepAbandonedReviewPhotos(deps(client, false));
  assert.equal(asked, false);
  assert.equal(result.deleted, 0);
  assert.ok(result.skipped);
});

test("the query names the asset kind and the mark, so nobody else's file can match", () => {
  assert.match(ABANDONED_UPLOADS_QUERY, /_type == "sanity\.imageAsset" && source\.name == \$source/);
  assert.match(ABANDONED_UPLOADS_QUERY, /count\(\*\[references\(\^\._id\)\]\) == 0/);
});

/* ─── Where these are used ─── */

const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), "utf8");

test("the review is checked against its link's photos before it is written, and keeps only those", () => {
  const route = read("src", "app", "api", "reviews", "by-token", "route.ts");
  const checked = route.indexOf("await photosFromThisLink(photoIds, order._id)");
  const written = route.indexOf("sanityWriteClient.create(");
  assert.ok(checked !== -1 && written !== -1 && checked < written, "checked before the review exists");
  assert.match(route, /images: photoIds\.map\(/, "the ids that were checked are the ids that are stored");
  assert.doesNotMatch(route, /imageAssetIds \|\| \[\]\)\.map/);
});

test("uploads are marked the way the review and the clean-up read them", () => {
  const upload = read("src", "app", "api", "reviews", "upload", "route.ts");
  assert.match(upload, /const mark = reviewUploadMark\(order\._id\);/);
  assert.match(upload, /from "@\/lib\/reviewPhotos"/);
});

test("the morning job clears them, once, inside allSettled, and reads the answer back in its place", () => {
  const cron = read("src", "app", "api", "cron", "daily", "route.ts");
  const settled = cron.slice(cron.indexOf("Promise.allSettled(["), cron.indexOf("]);", cron.indexOf("Promise.allSettled([")));
  assert.match(settled, /sweepAbandonedReviewPhotos\(\),/);
  assert.equal((cron.match(/sweepAbandonedReviewPhotos\(/g) ?? []).length, 1);
  const jobs = settled.match(/^\s{4}(\w+)\(/gm)?.map((line) => line.trim().replace("(", "")) ?? [];
  assert.equal(jobs.indexOf("sweepAbandonedReviewPhotos"), jobs.length - 1, "last in the list");
  assert.match(cron, /referrals,\n\s+reviewPhotos,\n\s+\] = results\.map/, "and last read back");
});
