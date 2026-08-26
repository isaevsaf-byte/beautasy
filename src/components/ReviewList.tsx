import StarRating from "./StarRating";

/* eslint-disable @next/next/no-img-element */

export interface Review {
  _id: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
  images?: string[];
  /** True when the review came from a review-request email for a real order */
  verifiedPurchase?: boolean;
}

/**
 * Renders published reviews from data fetched on the server.
 *
 * Reviews used to be fetched in the browser inside a `ssr: false` component, so
 * none of this text existed in the HTML — the strongest selling material on a
 * handmade product page was invisible to search engines. Presentational only:
 * no hooks, so it prerenders with the rest of the page.
 */
export default function ReviewList({
  reviews,
  averageRating,
}: {
  reviews: Review[];
  averageRating: number;
}) {
  if (reviews.length === 0) {
    return (
      <p className="text-sm text-charcoal-light text-center py-8">
        No reviews yet. Be the first to share your thoughts!
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <StarRating rating={Math.round(averageRating)} />
        <span className="text-sm text-charcoal-light">
          {averageRating.toFixed(1)} ({reviews.length} review
          {reviews.length !== 1 ? "s" : ""})
        </span>
      </div>

      {reviews.map((review) => (
        <article
          key={review._id}
          className="py-4 border-b border-lavender-soft/20 last:border-b-0"
        >
          <div className="flex items-center gap-3 mb-2">
            <StarRating rating={review.rating} size={14} />
            <span className="font-medium text-sm text-charcoal">{review.userName}</span>
            {review.verifiedPurchase && (
              <span className="text-[10px] tracking-wider uppercase text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                Verified purchase
              </span>
            )}
            <time
              dateTime={review.createdAt}
              className="text-xs text-charcoal-light"
            >
              {new Date(review.createdAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </time>
          </div>
          <p className="text-sm text-charcoal-light leading-relaxed">{review.comment}</p>
          {review.images && review.images.length > 0 && (
            <div className="flex gap-2 mt-3">
              {review.images.map((url, i) => (
                <img
                  key={url}
                  src={url}
                  alt={`Photo from ${review.userName}'s review, ${i + 1}`}
                  className="w-16 h-16 rounded-lg object-cover border border-lavender-soft/30"
                  loading="lazy"
                />
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
