import type { Template } from "sanity";

/**
 * The two review lists in the Studio sidebar, and the button that starts a
 * Nextdoor recommendation.
 *
 * «Отзывы» holds what people wrote on the site, which waits for Kristina's
 * approval. «Рекомендации Nextdoor», «Отзывы Google» and «Отзывы Etsy» hold
 * what she copies in herself from those sites. All are `review` documents, told apart by
 * `source`; documents saved before `source` existed have none, and they are
 * all the site's.
 */

export const SITE_REVIEWS_FILTER = `_type == "review" && coalesce(source, "site") == "site"`;
export const NEXTDOOR_REVIEWS_FILTER = `_type == "review" && source == "nextdoor"`;
export const GOOGLE_REVIEWS_FILTER = `_type == "review" && source == "google"`;
export const ETSY_REVIEWS_FILTER = `_type == "review" && source == "etsy"`;

export const NEXTDOOR_TEMPLATE_ID = "review-nextdoor";
export const GOOGLE_TEMPLATE_ID = "review-google";
export const ETSY_TEMPLATE_ID = "review-etsy";

/**
 * A recommendation starts marked as Nextdoor, already approved — Kristina is
 * the one typing it in, so «Опубликовать» is her approval — and dated today,
 * for her to change to the day the neighbour wrote it.
 */
export const nextdoorReviewTemplate: Template = {
  id: NEXTDOOR_TEMPLATE_ID,
  title: "Рекомендация Nextdoor",
  schemaType: "review",
  value: () => ({ source: "nextdoor", approved: true, createdAt: new Date().toISOString() }),
};

/**
 * A review from Google starts marked as Google and approved, dated today for
 * her to change; its stars are hers to set, as the review has them.
 */
export const googleReviewTemplate: Template = {
  id: GOOGLE_TEMPLATE_ID,
  title: "Отзыв из Google",
  schemaType: "review",
  value: () => ({ source: "google", approved: true, createdAt: new Date().toISOString() }),
};

/**
 * A review from Etsy starts marked as Etsy, approved and about a piece from
 * the shop — every Etsy review is — dated today for her to change.
 */
export const etsyReviewTemplate: Template = {
  id: ETSY_TEMPLATE_ID,
  title: "Отзыв из Etsy",
  schemaType: "review",
  value: () => ({ source: "etsy", approved: true, about: "shop", createdAt: new Date().toISOString() }),
};
