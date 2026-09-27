import { sanityClient } from "./sanity";
import { SHELVES_QUERY, shelvesFrom, type Shelves } from "./shelves";

/**
 * The shop's shelves, read the way site settings are (see @/lib/siteSettings):
 * through the CDN, and again every five minutes, so a new product's section
 * appears within minutes of being published.
 *
 * Null when Sanity cannot be read. Every caller then shows its links as they
 * are written — see `placeLink` in @/lib/shelves.
 */
export async function getShelves(): Promise<Shelves | null> {
  try {
    return shelvesFrom(await sanityClient.fetch(SHELVES_QUERY, {}, { next: { revalidate: 300 } }));
  } catch (error) {
    console.error("Could not read which shelves of the shop are stocked:", error);
    return null;
  }
}
