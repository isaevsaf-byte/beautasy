/**
 * Reviews written on the site itself, at /reviews: by anyone, with no account.
 *
 * Nothing written there appears until Kristina has read it and ticked
 * «Одобрен» in the Studio. The form is open to the whole internet and a review
 * is words printed under her business, so what it may carry is decided here,
 * in one pure function the route and its test share.
 *
 * Product reviews from buyers still come through the emailed link
 * (/review/[token]) and carry "Verified purchase"; both kinds live in the same
 * `review` documents and show together.
 */

/** What a review can be about. The labels are what visitors read on the site. */
export const REVIEW_TOPICS = [
  { value: "alterations", label: "Alterations" },
  { value: "repairs", label: "Repairs" },
  { value: "made", label: "Made to measure" },
  { value: "home", label: "Curtains & home" },
  { value: "shop", label: "A piece from the shop" },
  { value: "other", label: "Something else" },
] as const;

export type ReviewTopic = (typeof REVIEW_TOPICS)[number]["value"];

export function topicLabel(value: string | null | undefined): string | null {
  return REVIEW_TOPICS.find((topic) => topic.value === value)?.label ?? null;
}

export const NAME_MAX = 40;
export const COMMENT_MIN = 10;
export const COMMENT_MAX = 1000;

export interface SiteReview {
  name: string;
  topic: ReviewTopic;
  /** Set when the review is about one piece from the shop, from that piece's page */
  productId?: string;
  rating: number;
  comment: string;
}

export type SiteReviewCheck =
  | { ok: true; trap: true }
  | { ok: true; trap: false; review: SiteReview }
  | { ok: false; error: string };

// Everything below U+0020 except the line break, and DEL: invisible in the
// page, but enough to smuggle odd formatting into an email to Kristina
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/g;
// A published document id — drafts are not a place a review can point
const SANITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

/**
 * Whether a body sent by the form is a review we can keep, and if so, cleaned.
 *
 * The honeypot is a field people never see. When a bot fills it in, the
 * answer is "thank you" all the same, so it has no reason to try another way.
 */
export function checkSiteReview(body: unknown): SiteReviewCheck {
  const input = (body !== null && typeof body === "object" ? body : {}) as Record<string, unknown>;

  if (typeof input.company === "string" && input.company.trim() !== "") return { ok: true, trap: true };

  const name = typeof input.name === "string" ? input.name.replace(CONTROL, "").replace(/\s+/g, " ").trim() : "";
  if (name.length < 2) return { ok: false, error: "Please add your first name." };
  if (name.length > NAME_MAX) return { ok: false, error: `Your name can be up to ${NAME_MAX} letters.` };

  const rating = input.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Please choose from one to five stars." };
  }

  const comment =
    typeof input.comment === "string"
      ? input.comment.replace(CONTROL, "").replace(/\n{3,}/g, "\n\n").trim()
      : "";
  if (comment.length < COMMENT_MIN) {
    return { ok: false, error: "A sentence or two, please: what did we make or mend, and how did it turn out?" };
  }
  if (comment.length > COMMENT_MAX) {
    return { ok: false, error: `Reviews can be up to ${COMMENT_MAX.toLocaleString("en-GB")} characters.` };
  }

  const topic = REVIEW_TOPICS.find((candidate) => candidate.value === input.topic)?.value;
  if (!topic) return { ok: false, error: "Please choose what we made or mended for you." };

  let productId: string | undefined;
  if (input.productId !== undefined && input.productId !== null && input.productId !== "") {
    if (topic !== "shop" || typeof input.productId !== "string" || !SANITY_ID.test(input.productId)) {
      return { ok: false, error: "We couldn't tell which piece this review is about." };
    }
    productId = input.productId;
  }

  return { ok: true, trap: false, review: { name, topic, productId, rating, comment } };
}

/* ─── What the site shows ─── */

export interface PublishedReview {
  _id: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
  about?: string | null;
  verifiedPurchase?: boolean | null;
  product?: { name: string; slug: string } | null;
}

/**
 * Every review Kristina has approved, newest first: the ones written on the
 * site and the buyers' reviews of pieces from the shop.
 */
export const PUBLISHED_REVIEWS_QUERY = `*[
  _type == "review" && approved == true && !(_id in path("drafts.**"))
] | order(createdAt desc) [0...60] {
  _id, userName, rating, comment, createdAt, about, verifiedPurchase,
  "product": product->{ name, "slug": slug.current }
}`;

export function reviewSummary(reviews: Pick<PublishedReview, "rating">[]): { count: number; average: number } {
  const count = reviews.length;
  const average = count ? reviews.reduce((sum, review) => sum + review.rating, 0) / count : 0;
  return { count, average };
}

/** What the review was about, in the words a visitor reads */
export function reviewSubject(review: Pick<PublishedReview, "about" | "product">): string | null {
  return review.product?.name ?? topicLabel(review.about);
}

/** When the newest approved review was written — null when there is none yet */
export const LATEST_REVIEW_QUERY = `*[
  _type == "review" && approved == true && !(_id in path("drafts.**"))
] | order(createdAt desc) [0].createdAt`;
