/**
 * Where the Studio's lists went when the sidebar was folded into folders.
 *
 * A list's address in the Studio starts with its id: /studio/structure/
 * product;<document>. Inside a folder it gains the folder's id in front —
 * /studio/structure/shop;product;<document> — and the old address, kept in
 * a bookmark or pasted into WhatsApp, would open an empty pane. The
 * middleware sends it on instead, with everything after the list's id kept.
 *
 * Only full page loads come through here (a bookmark, a pasted link, a
 * reload); clicks inside the Studio never leave it. Links in emails use
 * /studio/intent/…, which find the document wherever its list lives, and are
 * not touched.
 *
 * Pure, for the middleware bundle; @/sanity/structure is the other half and
 * a test keeps the two in step.
 */

/** Every list that moved into a folder, by its id, and the folder's id */
export const STUDIO_MOVES: Readonly<Record<string, string>> = {
  review: "reviews",
  nextdoor: "reviews",
  "google-reviews": "reviews",
  "etsy-reviews": "reviews",

  postyVOcheredi: "social",
  reels: "social",
  uzheOpublikovany: "social",
  facebookGroup: "social",

  product: "shop",
  order: "shop",
  giftCard: "shop",
  collection: "shop",
  giftBox: "shop",
  sizeGuide: "shop",
  stockAlert: "shop",
  abandonedCart: "shop",
  subscriber: "shop",

  partners: "friends",
  referrer: "friends",
  referral: "friends",

  workPiece: "settings",
  chasyDlyaPrimerok: "settings",
  legalPage: "settings",
  nastroikiSaita: "settings",
};

/** The folders' ids — never a key above, so a moved address is never moved again */
export const STUDIO_FOLDERS = ["reviews", "social", "shop", "friends", "settings"] as const;

const STRUCTURE = /^\/studio\/structure\/([^;,|/%]+)(.*)$/;

/** Where an old Studio address now lives, or null for any address that did not move */
export function movedStudioPath(pathname: string): string | null {
  const found = STRUCTURE.exec(pathname);
  if (!found) return null;
  const [, first, rest] = found;
  const folder = STUDIO_MOVES[first];
  return folder ? `/studio/structure/${folder};${first}${rest}` : null;
}
