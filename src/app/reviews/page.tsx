import type { Metadata } from "next";
import Link from "next/link";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";
import StarRating from "@/components/StarRating";
import { sanityClient } from "@/lib/sanity";
import { googleReviewUrl } from "@/lib/siteSettings";
import { BUSINESS } from "@/lib/business";
import { SITE_URL } from "@/lib/site";
import { SOCIAL_CARD_IMAGES } from "@/lib/socialCard";
import {
  PUBLISHED_REVIEWS_QUERY,
  reviewSubject,
  reviewSummary,
  type PublishedReview,
} from "@/lib/siteReviews";
import SiteReviewForm from "./SiteReviewForm";

/**
 * Reviews: what clients say, and the place to add your own.
 *
 * Two ways to leave one, side by side. Google comes first because a review
 * there is what brings the next client from the map; the form here is for
 * anyone without a Google account, or who would rather not post under their
 * name in public. Everything written here waits for Kristina's approval in the
 * Studio before it shows.
 *
 * beautasy.co.uk/review — the short address for WhatsApp, cards in the bag and
 * the email after a finished job — lands on #write (see next.config.ts).
 */

export const revalidate = 300;

const PAGE_URL = `${SITE_URL}/reviews`;

/**
 * Throws when Sanity can't be read, like /work: a page that fails to
 * regenerate keeps serving its last good version, where one built from an
 * empty answer would tell Google the reviews had gone.
 */
function readReviews(): Promise<PublishedReview[]> {
  return sanityClient.fetch<PublishedReview[]>(PUBLISHED_REVIEWS_QUERY, {}, { next: { revalidate: 300 } });
}

export async function generateMetadata(): Promise<Metadata> {
  const reviews = await readReviews();
  const description =
    "What clients say about Kristina's alterations, curtains and handmade pieces in Southampton, and a place to leave your own review.";
  return {
    title: "Reviews | Beautasy Atelier, Southampton",
    description,
    alternates: { canonical: PAGE_URL },
    // Until the first review is approved this page is a form and a link, which
    // is nothing worth showing in search
    robots: reviews.length ? undefined : { index: false, follow: true },
    openGraph: {
      title: "Reviews — Beautasy Atelier, Southampton",
      description,
      url: PAGE_URL,
      siteName: "Beautasy",
      locale: "en_GB",
      type: "website",
      images: SOCIAL_CARD_IMAGES,
    },
  };
}

export default async function ReviewsPage() {
  const [reviews, googleUrl] = await Promise.all([readReviews(), googleReviewUrl({ forPage: true })]);
  const { count, average } = reviewSummary(reviews);

  return (
    <>
      <HeaderWrapper />
      <main className="pt-28">
        <section className="py-16 md:py-20">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-12">
              <p className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4">Reviews</p>
              <h1 className="font-serif text-4xl sm:text-5xl mb-6">
                In their <span className="italic text-lavender">own words.</span>
              </h1>
              <p className="text-lg text-charcoal-light max-w-xl mx-auto leading-relaxed">
                What people say after a fitting, a set of curtains or a piece from the shop. Kristina reads every
                review before it goes up here.
              </p>
              {count > 0 && (
                <div className="mt-6 inline-flex items-center gap-3">
                  <StarRating rating={Math.round(average)} />
                  <span className="text-sm text-charcoal-light tabular-nums">
                    {average.toFixed(1)} from {count} {count === 1 ? "review" : "reviews"} on this site
                  </span>
                </div>
              )}
            </div>

            <div id="write" className="scroll-mt-28 grid gap-5 md:grid-cols-[1fr_1.5fr] items-start max-w-4xl mx-auto">
              <div className="bg-white/70 rounded-3xl p-7 sm:p-9 border border-lavender-soft/30">
                <p className="text-xs tracking-wider uppercase text-charcoal-light mb-2">Helps the most</p>
                <h2 className="font-serif text-2xl mb-2">Review us on Google</h2>
                <p className="text-sm text-charcoal-light leading-relaxed mb-6">
                  A review on Google is what helps neighbours in Southampton find Kristina. It takes a minute with a
                  Google account.
                </p>
                <a
                  href={googleUrl ?? BUSINESS.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-7 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300"
                >
                  Write it on Google
                </a>
                <a
                  href={BUSINESS.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-5 text-xs text-charcoal-light underline underline-offset-2 hover:text-charcoal"
                >
                  Read our Google reviews
                </a>
              </div>

              <SiteReviewForm googleUrl={googleUrl} />
            </div>

            {reviews.length > 0 && (
              <div className="max-w-3xl mx-auto mt-20">
                <h2 className="font-serif text-2xl sm:text-3xl mb-8 text-center">What people said</h2>
                <ul className="grid gap-4">
                  {reviews.map((review) => {
                    const subject = reviewSubject(review);
                    return (
                      <li key={review._id} className="bg-white/70 rounded-2xl p-6 border border-lavender-soft/30">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
                          <StarRating rating={review.rating} size={14} />
                          <span className="font-medium text-sm text-charcoal">{review.userName}</span>
                          {review.verifiedPurchase && (
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
                              <Link
                                href={`/shop/${review.product.slug}`}
                                className="underline underline-offset-2 hover:text-charcoal"
                              >
                                {subject}
                              </Link>
                            ) : (
                              subject
                            )}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </section>
      </main>
      <FooterWrapper />
    </>
  );
}
