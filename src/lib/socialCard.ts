import { SITE_URL } from "@/lib/site";

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

export const SOCIAL_CARD_ALT =
  "Beautasy — handmade lingerie and accessories, Southampton";

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
