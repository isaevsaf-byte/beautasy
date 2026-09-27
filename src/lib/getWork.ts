import { sanityClient } from "./sanity";
import { WORK_QUERY, workFrom, type Showreel, type WorkPiece } from "./work";

export interface Work {
  pieces: WorkPiece[];
  showreel: Showreel | null;
  /** False when Sanity could not be read: the pieces are unknown, not none */
  known: boolean;
}

/**
 * Our Work as the pages show it, read through the CDN and again every five
 * minutes — a piece Kristina publishes is on the site before she has put the
 * kettle on.
 *
 * Throws when Sanity can't be read. /work lets it: a page that fails to
 * regenerate keeps serving its last good version, where one built from an
 * empty answer would tell Google the gallery was gone.
 */
export async function readWork(): Promise<Work> {
  return { ...workFrom(await sanityClient.fetch(WORK_QUERY, {}, { next: { revalidate: 300 } })), known: true };
}

/**
 * The same, for the pages that only show a row of work beside something else:
 * when Sanity can't be read they leave the row out rather than fail.
 */
export async function getWork(): Promise<Work> {
  try {
    return await readWork();
  } catch (error) {
    console.error("Could not read Our Work:", error);
    return { pieces: [], showreel: null, known: false };
  }
}
