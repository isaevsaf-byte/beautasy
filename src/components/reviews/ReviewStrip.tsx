import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PublishedReview } from "@/lib/siteReviews";
import ReviewCard from "./ReviewCard";

/**
 * A few reviews beside something else on a page: the newest on the home page,
 * the atelier's own on /atelier, the ones about this kind of job first on a
 * service page. It leads to /reviews, where the rest are and where anyone can
 * add theirs.
 *
 * Nothing at all when there is nothing to show — like WorkStrip, a heading
 * over an empty row says the opposite of what the section is for. And never
 * in a page's structured data: reviews from Nextdoor are another site's, and
 * Google does not allow a business to mark up reviews of itself.
 */
export default function ReviewStrip({
  reviews,
  nextdoorUrl,
  eyebrow,
  heading = "What clients say",
  featured = false,
  className = "",
}: {
  reviews: PublishedReview[];
  nextdoorUrl: string | null;
  /** A small line over the heading, only where it adds something: "Kind
   *  words" over "What clients say" said it twice, so by default there is none */
  eyebrow?: string;
  heading?: string;
  /** One quote large and the others small beside it, rather than a row of
   *  equal cards — the home page's way (see FeaturedReviews) */
  featured?: boolean;
  className?: string;
}) {
  if (reviews.length === 0) return null;
  // As many columns as there are reviews, so one review never sits beside two gaps
  const columns =
    reviews.length >= 3 ? "md:grid-cols-3" : reviews.length === 2 ? "md:grid-cols-2" : "max-w-xl";
  return (
    <section className={className}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          {eyebrow && <p className="mb-2 text-xs tracking-[0.25em] uppercase text-charcoal-light">{eyebrow}</p>}
          <h2 className="font-serif text-2xl sm:text-3xl">{heading}</h2>
        </div>
        <Link
          href="/reviews"
          className="group inline-flex items-center gap-1.5 text-sm text-charcoal-light transition-colors hover:text-charcoal"
        >
          Read or write a review
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </div>
      {/* One column on a phone is grid-cols-1, not just "grid": an unsized
          column grows to fit its widest word, and one long one made the
          page scroll sideways */}
      {featured && reviews.length > 1 ? (
        <FeaturedReviews reviews={reviews} nextdoorUrl={nextdoorUrl} />
      ) : (
        <ul className={`grid grid-cols-1 gap-4 ${columns}`}>
          {reviews.map((review) => (
            <ReviewCard key={review._id} review={review} nextdoorUrl={nextdoorUrl} clamp />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Three equal cards in a row is the layout every template has, and it gives a
 * two-word review the same weight as a paragraph. Here the fullest review is
 * the quote, set large in the heading face and stopped at six lines, and the
 * others stand beside it as small cards of three lines. Every card leads to
 * /reviews, where each is whole. The others keep their order: newest first.
 */
function FeaturedReviews({ reviews, nextdoorUrl }: { reviews: PublishedReview[]; nextdoorUrl: string | null }) {
  const lead = reviews.reduce((longest, review) => (review.comment.length > longest.comment.length ? review : longest));
  const rest = reviews.filter((review) => review !== lead);
  return (
    // Five columns from a tablet up: the quote takes three, the small cards
    // two, stacked. One column on a phone, as grid-cols-1 (see above).
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-5">
      <ReviewCard
        review={lead}
        nextdoorUrl={nextdoorUrl}
        featured
        clamp={6}
        href="/reviews"
        className={`md:col-span-3 ${rest.length > 1 ? "md:row-span-2" : ""}`}
      />
      {rest.map((review) => (
        <ReviewCard
          key={review._id}
          review={review}
          nextdoorUrl={nextdoorUrl}
          clamp={3}
          href="/reviews"
          className="md:col-span-2"
        />
      ))}
    </ul>
  );
}
