import { sanityClient } from "./sanity";
import { PUBLISHED_REVIEWS_QUERY, type PublishedReview } from "./siteReviews";

/**
 * The approved reviews, newest first, read through the CDN and again every
 * five minutes — like Our Work (see ./getWork).
 *
 * Throws when Sanity can't be read. /reviews lets it: a page that fails to
 * regenerate keeps serving its last good version, where one built from an
 * empty answer would tell Google the reviews had gone.
 */
export function readReviews(): Promise<PublishedReview[]> {
  return sanityClient.fetch<PublishedReview[]>(PUBLISHED_REVIEWS_QUERY, {}, { next: { revalidate: 300 } });
}

/**
 * The same, for the pages that show a few reviews beside something else: when
 * Sanity can't be read they leave the reviews out rather than fail.
 */
export async function getReviews(): Promise<PublishedReview[]> {
  try {
    return (await readReviews()) ?? [];
  } catch (error) {
    console.error("Could not read the reviews:", error);
    return [];
  }
}
