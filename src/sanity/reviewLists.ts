import type { Template } from "sanity";

/**
 * The two review lists in the Studio sidebar, and the button that starts a
 * Nextdoor recommendation.
 *
 * «Отзывы» holds what people wrote on the site, which waits for Kristina's
 * approval. «Рекомендации Nextdoor» holds what she copies in herself from
 * Nextdoor, where the recommendations can't be read by another site. Both are
 * `review` documents, told apart by `source`; documents saved before `source`
 * existed have none, and they are all the site's.
 */

export const SITE_REVIEWS_FILTER = `_type == "review" && coalesce(source, "site") == "site"`;
export const NEXTDOOR_REVIEWS_FILTER = `_type == "review" && source == "nextdoor"`;

export const NEXTDOOR_TEMPLATE_ID = "review-nextdoor";

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
