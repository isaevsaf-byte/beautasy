import { sanityClient } from "./sanity";
import { WORK_QUERY, workFrom, type Showreel, type WorkPiece } from "./work";

/**
 * Our Work as the pages show it, read through the CDN and again every five
 * minutes — a piece Kristina publishes is on the site before she has put the
 * kettle on. Nothing, rather than an error page, when Sanity can't be read:
 * every page that shows work leaves its section out when there is none.
 */
export async function getWork(): Promise<{ pieces: WorkPiece[]; showreel: Showreel | null }> {
  try {
    return workFrom(await sanityClient.fetch(WORK_QUERY, {}, { next: { revalidate: 300 } }));
  } catch (error) {
    console.error("Could not read Our Work:", error);
    return { pieces: [], showreel: null };
  }
}
