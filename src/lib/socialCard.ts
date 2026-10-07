import { SITE_URL } from "@/lib/site";
import { lowestPrice } from "@/lib/siteCopy";
import { LOCAL_SERVICES, getLocalService } from "@/lib/localServices";
import { ATELIER_LEAD, cardVersion, sewnCardAlt, sewnLead } from "@/lib/sewnCardVersion";

/**
 * The one picture a forwarded link shows, and why every page has to ask for it
 * by name.
 *
 * `src/app/opengraph-image.tsx` draws the card, and Next attaches it to the
 * root layout for free. It does not travel any further down. Metadata is
 * resolved one route segment at a time, and `openGraph` is replaced whole
 * rather than merged: the moment a page exports an `openGraph` block of its
 * own — even just a title and a description — the parent's `images` leave with
 * the parent's title. The generated card is only folded in at the segment that
 * holds the file, so no page below the root ever sees it unless it says so.
 *
 * That is not a theory about how Next might behave. Before this module, the
 * built HTML under .next/server/app showed /gift-cards, /refer and /gift-boxes
 * emitting no og:image tag at all, because all three declare a page-specific
 * openGraph title. /refer is the referral page whose entire job is to be
 * forwarded in a chat, and it was being forwarded as a blank rectangle.
 *
 * So: a page that wants its own title in the preview has to name the picture
 * again, and this is the single place that knows which picture that is. Do not
 * copy the URL or the numbers into a page — import them, or the next time the
 * card changes size we will be back to markup that claims one thing and serves
 * another.
 */

/** The atelier first, as the card itself now reads (see @/lib/siteCopy) */
export const SOCIAL_CARD_ALT =
  "Beautasy — alterations, repairs and handmade lingerie, Southampton";

/**
 * The size the card is drawn at, and the size messaging apps crop from.
 * `opengraph-image.tsx` exports this as its `size`, so the two cannot drift.
 */
export const SOCIAL_CARD_SIZE = { width: 1200, height: 630 };

/**
 * Where Next serves the generated card.
 *
 * The rendered tags carry a `?<hash>` cache-buster on the end, but the route
 * itself is plain `/opengraph-image` — it is a static route in the build
 * manifest, so linking it without the hash serves the same PNG.
 */
export const SOCIAL_CARD_URL = `${SITE_URL}/opengraph-image`;

/**
 * Drop this straight into a page's `openGraph.images`.
 *
 * Leave `twitter.images` alone when you do: with that key absent, Next copies
 * the Open Graph images onto the Twitter card, so naming the picture once is
 * enough for both.
 */
export const SOCIAL_CARD_IMAGES = [
  {
    url: SOCIAL_CARD_URL,
    width: SOCIAL_CARD_SIZE.width,
    height: SOCIAL_CARD_SIZE.height,
    alt: SOCIAL_CARD_ALT,
  },
];

/**
 * The atelier's link-preview cards (src/lib/sewnCard.tsx, served by
 * src/app/cards/[card]/route.tsx): Kristina's artwork on a sewn-on label
 * beside a heading, sewn, and its lowest price. "atelier" sews the home
 * page's heading and is the card for the home page, /atelier, and the links
 * that sell an alteration rather than a page of their own — a friend's /r/,
 * a salon's /p/, /alterations, /refer, /reviews, /work until it has a photo.
 * Each alteration page has its own, named by its slug.
 */
export const SEWN_CARDS = ["atelier", ...LOCAL_SERVICES.map((service) => service.slug)] as const;

/** What a card shows: the words before "in Southampton" and the lowest price */
export function sewnCardFor(name: string): { lead: string; priceFrom: string | null } | null {
  if (name === "atelier") return { lead: ATELIER_LEAD, priceFrom: lowestPrice() };
  const service = getLocalService(name);
  return service ? { lead: sewnLead(service.h1), priceFrom: lowestPrice(service.prices) } : null;
}

/**
 * A card as a page's openGraph (and twitter) images. The address ends in the
 * card's version (src/lib/sewnCardVersion.ts), which changes with its words,
 * its price and its look, so a chat app that kept the old picture asks again.
 */
export function sewnCardImages(name: string) {
  const content = sewnCardFor(name);
  if (!content) throw new Error(`No link-preview card called ${name}`);
  return [
    {
      url: `${SITE_URL}/cards/${name}.png?v=${cardVersion(content.lead, content.priceFrom)}`,
      width: SOCIAL_CARD_SIZE.width,
      height: SOCIAL_CARD_SIZE.height,
      alt: sewnCardAlt(content.lead, content.priceFrom),
      type: "image/png",
    },
  ];
}

export const ATELIER_CARD_IMAGES = sewnCardImages("atelier");
