import Link from "next/link";
import { Heart } from "lucide-react";
import StarRating from "@/components/StarRating";
import { BUSINESS } from "@/lib/business";
import { reviewSubject, type PublishedReview } from "@/lib/siteReviews";

/**
 * One review as the site shows it. A review written here carries its stars.
 * One copied in from Google or Etsy carries its stars too, and a mark saying
 * where it was written that leads there, for anyone who wants to read it in
 * its own place. A recommendation from Nextdoor has no stars, so it carries
 * the neighbour's area and its mark, which leads to Beautasy's page on
 * Nextdoor.
 */
export default function ReviewCard({
  review,
  nextdoorUrl,
  clamp = false,
  className = "",
}: {
  review: PublishedReview;
  nextdoorUrl: string | null;
  /** Beside other things on a page, a long review stops at six lines; /reviews has it whole */
  clamp?: boolean;
  className?: string;
}) {
  const subject = reviewSubject(review);
  const fromNextdoor = review.source === "nextdoor";

  return (
    <li className={`bg-white/70 rounded-2xl p-6 border border-lavender-soft/30 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        {!fromNextdoor && typeof review.rating === "number" && <StarRating rating={review.rating} size={14} />}
        <ReviewSourceMark source={review.source} nextdoorUrl={nextdoorUrl} />
        <span className="font-medium text-sm text-charcoal">{review.userName}</span>
        {fromNextdoor && review.neighbourhood && (
          <span className="text-xs text-charcoal-light">{review.neighbourhood}</span>
        )}
        {review.source === "site" && review.verifiedPurchase && (
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
      <p className={`text-sm text-charcoal leading-relaxed whitespace-pre-line ${clamp ? "line-clamp-6" : ""}`}>
        {review.comment}
      </p>
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

/**
 * Where a review was written, when that is not here: a mark that leads to it.
 * Nothing for a review written on this site.
 */
export function ReviewSourceMark({
  source,
  nextdoorUrl,
}: {
  source: PublishedReview["source"];
  nextdoorUrl: string | null;
}) {
  if (source === "nextdoor") return <NextdoorMark href={nextdoorUrl} />;
  const elsewhere = ELSEWHERE[source as keyof typeof ELSEWHERE];
  return elsewhere ? <SourceMark label={elsewhere.label} href={elsewhere.href} /> : null;
}

/** The sites whose reviews are copied in with their stars, and where each one's reviews are read */
const ELSEWHERE = {
  google: { label: "Google review", href: BUSINESS.googleMapsUrl },
  etsy: { label: "Etsy review", href: `${BUSINESS.etsyUrl}#reviews` },
} as const;

const MARK_CLASS =
  "inline-flex items-center gap-1.5 text-[10px] tracking-wider uppercase text-charcoal bg-lavender-bg border border-lavender-soft/60 rounded-full px-2.5 py-0.5";

function SourceMark({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${MARK_CLASS} hover:border-lavender`}>
      {label}
    </a>
  );
}

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
