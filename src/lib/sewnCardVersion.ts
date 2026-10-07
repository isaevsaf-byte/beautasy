import { createHash } from "node:crypto";

/**
 * Which drawing of the link-preview cards is live (src/lib/sewnCard.tsx).
 *
 * Facebook and WhatsApp keep a picture by its address, so a card has to move
 * to a new address whenever it changes. Next's own ?hash only follows the
 * opengraph-image.tsx file; a price in localServices.ts, the drawing in
 * sewnCard.tsx or Kristina's artwork would change behind the same address.
 * The address therefore ends in a short hash of what the card shows — its
 * words, its price — and of this design mark, which is changed by hand with
 * the look. socialPreview.test.ts holds the mark to a drawn sample and to the
 * artwork file, so a new look without a new mark fails the tests.
 *
 * No files are read here: every page that names the atelier's card imports
 * this, and a page should not need the artwork on disk to say where it is.
 */
export const CARD_DESIGN = "2026-10-07.3";

/** The home page's heading before "in Southampton" — the atelier's card sews it too */
export const ATELIER_LEAD = "Alterations & repairs";

/** A page's heading without the words the card sews under it */
export function sewnLead(heading: string): string {
  return heading.replace(/ in Southampton$/, "");
}

/** What a screen reader in the chat app says for a card */
export function sewnCardAlt(lead: string, priceFrom: string | null): string {
  return `${lead} in Southampton${priceFrom ? `, from ${priceFrom}` : ""}. Choose a time online at Beautasy Atelier.`;
}

/** The last part of a card's address: what it shows, in 10 characters */
export function cardVersion(lead: string, priceFrom: string | null): string {
  return createHash("sha1").update(`${CARD_DESIGN}|${lead}|${priceFrom ?? ""}`).digest("hex").slice(0, 10);
}
