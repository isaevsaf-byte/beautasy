import Link from "next/link";
import { Heart } from "lucide-react";
import StarRating from "@/components/StarRating";
import { reviewSubject, type PublishedReview } from "@/lib/siteReviews";

/**
 * One review as the site shows it. A review written here carries its stars. A
 * recommendation from Nextdoor has none, so it carries the neighbour's area
 * and a mark saying where it was written — which leads to Beautasy's page on
 * Nextdoor once that is set in the Studio, for anyone who wants to see the
 * neighbours' words where they first appeared.
 */
export default function ReviewCard({
  review,
  nextdoorUrl,
}: {
  review: PublishedReview;
  nextdoorUrl: string | null;
}) {
  const subject = reviewSubject(review);
  const fromNextdoor = review.source === "nextdoor";

  return (
    <li className="bg-white/70 rounded-2xl p-6 border border-lavender-soft/30">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        {fromNextdoor ? (
          <NextdoorMark href={nextdoorUrl} />
        ) : typeof review.rating === "number" ? (
          <StarRating rating={review.rating} size={14} />
        ) : null}
        <span className="font-medium text-sm text-charcoal">{review.userName}</span>
        {fromNextdoor && review.neighbourhood && (
          <span className="text-xs text-charcoal-light">{review.neighbourhood}</span>
        )}
        {!fromNextdoor && review.verifiedPurchase && (
          <span className="text-[10px] tracking-wider uppercase text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            Verified purchase
          </span>
        )}
        <time dateTime={review.createdAt} className="text-xs text-charcoal-light">
          {new Date(review.createdAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "Europe/London",
          })}
        </time>
      </div>
      <p className="text-sm text-charcoal leading-relaxed whitespace-pre-line">{review.comment}</p>
      {subject && (
        <p className="text-xs text-charcoal-light mt-3">
          {review.product?.slug ? (
            <Link href={`/shop/${review.product.slug}`} className="underline underline-offset-2 hover:text-charcoal">
              {subject}
            </Link>
          ) : (
            subject
          )}
        </p>
      )}
    </li>
  );
}

const MARK_CLASS =
  "inline-flex items-center gap-1.5 text-[10px] tracking-wider uppercase text-charcoal bg-lavender-bg border border-lavender-soft/60 rounded-full px-2.5 py-0.5";

function NextdoorMark({ href }: { href: string | null }) {
  const mark = (
    <>
      <Heart size={11} aria-hidden="true" className="fill-lavender text-lavender" />
      Recommended on Nextdoor
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${MARK_CLASS} hover:border-lavender`}>
      {mark}
    </a>
  ) : (
    <span className={MARK_CLASS}>{mark}</span>
  );
}
