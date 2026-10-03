import { sanityWriteClient } from "./sanity";
import { fingerprint } from "./secrets";

/**
 * Review photos: which ones a review may carry, and clearing away the ones
 * that never made it into a review.
 *
 * A photo is uploaded the moment the customer picks it (see
 * src/app/api/reviews/upload), before the review it belongs to is written. So
 * the asset store holds photos that no review points at: the customer changed
 * her mind, closed the tab, or picked a second photo instead of the first. And
 * the review itself arrives later, from the browser, naming its photos by id —
 * any id it likes. Two consequences, both handled here:
 *
 *   - A review only keeps photos uploaded with its own link. Asset ids are not
 *     secret (the dataset is public), so without this a review could carry
 *     another customer's photo, or one of Kristina's own from the Studio, and
 *     show it on a product page as a buyer's.
 *
 *   - Photos uploaded with a link and never used are deleted after a day. Only
 *     those: every upload is marked, and anything without the mark is
 *     Kristina's media from the Studio, which is hers to keep whether or not a
 *     document points at it today.
 */

/** What every review upload is marked with, so it can be told from Kristina's own media. */
export const REVIEW_UPLOAD_SOURCE = "review-upload";

/**
 * The mark one order's uploads share. A keyed fingerprint rather than the
 * order's id: asset documents are readable by anyone (the dataset is public),
 * and a photo should not lead a stranger to the order it came with.
 */
export function reviewUploadMark(orderId: string): string {
  return fingerprint(`${REVIEW_UPLOAD_SOURCE}:${orderId}`);
}

interface Reader {
  fetch<T>(query: string, params: Record<string, unknown>): Promise<T>;
}

/** The asked-for ids that really are photos uploaded with this order's link. */
export const OWN_UPLOADS_QUERY = `*[
  _type == "sanity.imageAsset" && _id in $ids
  && source.name == $source && source.id == $mark
]._id`;

/**
 * Whether every photo a review names was uploaded with this order's own link.
 * All or nothing: a review with one photo that is not its own is refused
 * whole, rather than saved with that photo quietly dropped.
 *
 * Read past the CDN: the photo was usually uploaded seconds ago, and a cached
 * answer that has not seen it yet would turn a real customer away.
 */
export async function photosFromThisLink(
  ids: readonly string[],
  orderId: string,
  client: Reader = sanityWriteClient
): Promise<boolean> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return true;
  const found = await client.fetch<string[] | null>(OWN_UPLOADS_QUERY, {
    ids: wanted,
    source: REVIEW_UPLOAD_SOURCE,
    mark: reviewUploadMark(orderId),
  });
  const own = new Set(found ?? []);
  return wanted.every((id) => own.has(id));
}

/* ─── Clearing away photos no review kept ─── */

/**
 * How many abandoned photos one morning deletes. The daily job has sixty
 * seconds for everything, and each delete is a request of its own, so the
 * number is kept small; anything left over is still there tomorrow. One link
 * can upload twelve at most, so this is more than a normal day ever leaves.
 */
export const SWEEP_PER_RUN = 20;

/** How long a photo may wait for its review: a customer may write it tomorrow. */
export const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Review uploads that nothing points at and that are older than a day.
 *
 * `references()` counts drafts as well as published documents (this is read
 * with the write token, which sees both), so a photo on a review Kristina is
 * still editing is not abandoned. Oldest first, so a backlog clears in order.
 */
export const ABANDONED_UPLOADS_QUERY = `*[
  _type == "sanity.imageAsset" && source.name == $source
  && dateTime(_createdAt) < dateTime($before)
  && count(*[references(^._id)]) == 0
] | order(_createdAt asc) [0...${SWEEP_PER_RUN}]._id`;

interface SweepClient extends Reader {
  delete(id: string): Promise<unknown>;
}

export interface SweepDeps {
  client: SweepClient;
  configured: () => boolean;
  now: () => Date;
}

const realDeps: SweepDeps = {
  client: sanityWriteClient as unknown as SweepClient,
  configured: () => !!process.env.SANITY_API_WRITE_TOKEN,
  now: () => new Date(),
};

export interface SweepResult {
  found: number;
  deleted: number;
  failed: number;
  skipped?: string;
}

/**
 * Deletes review photos that never made it into a review, a few each morning.
 *
 * One at a time rather than in one transaction: a review written in the
 * moment between the question and the delete makes Sanity refuse to delete
 * that photo, and in a transaction that refusal would keep every other one too.
 */
export async function sweepAbandonedReviewPhotos(deps: SweepDeps = realDeps): Promise<SweepResult> {
  if (!deps.configured()) return { found: 0, deleted: 0, failed: 0, skipped: "SANITY_API_WRITE_TOKEN is not set" };

  const before = new Date(deps.now().getTime() - ABANDONED_AFTER_MS).toISOString();
  const ids =
    (await deps.client.fetch<string[] | null>(ABANDONED_UPLOADS_QUERY, {
      source: REVIEW_UPLOAD_SOURCE,
      before,
    })) ?? [];

  let deleted = 0;
  let failed = 0;
  for (const id of ids.slice(0, SWEEP_PER_RUN)) {
    try {
      await deps.client.delete(id);
      deleted++;
    } catch (err) {
      failed++;
      console.error(`Could not delete abandoned review photo ${id}:`, err);
    }
  }
  return { found: ids.length, deleted, failed };
}
