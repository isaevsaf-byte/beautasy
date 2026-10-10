import type { Metadata } from "next";
import { Heart, Star } from "lucide-react";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";
import StarRating from "@/components/StarRating";
import { googleReviewUrl, nextdoorPageUrl } from "@/lib/siteSettings";
import { BUSINESS } from "@/lib/business";
import { SITE_URL } from "@/lib/site";
import { ATELIER_CARD_IMAGES } from "@/lib/socialCard";
import { featuredReview, nextdoorRecommendUrl, reviewSummary } from "@/lib/siteReviews";
import { readReviews } from "@/lib/getReviews";
import { ReviewSourceMark } from "@/components/reviews/ReviewCard";
import SiteReviewForm from "./SiteReviewForm";
import ReviewWall from "./ReviewWall";

/**
 * Reviews: what clients say, and the place to add your own.
 *
 * Two ways to leave one, side by side. Google comes first because a review
 * there is what brings the next client from the map; the form here is for
 * anyone without a Google account, or who would rather not post under their
 * name in public. Everything written here waits for Kristina's approval in the
 * Studio before it shows.
 *
 * Reviews from Nextdoor, Google and Etsy show here too, copied in by Kristina
 * in the Studio. The page opens with how many each site holds and the fullest
 * word about the atelier, then the whole wall, then the two ways to add one.
 *
 * beautasy.co.uk/review — the short address for WhatsApp, cards in the bag and
 * the email after a finished job — lands on #write (see next.config.ts).
 */

export const revalidate = 300;

const PAGE_URL = `${SITE_URL}/reviews`;

export async function generateMetadata(): Promise<Metadata> {
  const reviews = await readReviews();
  const description =
    "What clients say about Kristina's alterations, curtains and handmade pieces in Southampton, and a place to leave your own review.";
  const shareTitle = "Reviews — Beautasy Atelier, Southampton";
  return {
    title: "Reviews | Beautasy Atelier, Southampton",
    description,
    alternates: { canonical: PAGE_URL },
    // Until the first review is approved this page is a form and a link, which
    // is nothing worth showing in search
    robots: reviews.length ? undefined : { index: false, follow: true },
    // This link is sent to clients after a finished job (beautasy.co.uk/review),
    // and nearly every review is about the atelier: so the atelier's picture,
    // as a friend's /r/ link has, rather than the shop's card
    openGraph: {
      title: shareTitle,
      description,
      url: PAGE_URL,
      siteName: "Beautasy",
      locale: "en_GB",
      type: "website",
      images: ATELIER_CARD_IMAGES,
    },
    // Its own words here too: without this block the root's twitter one is
    // inherited whole, and X previews the link as the home page
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      // No images: with the key absent Next copies the Open Graph ones here.
    },
  };
}

export default async function ReviewsPage() {
  const [reviews, googleUrl, nextdoorUrl] = await Promise.all([
    readReviews(),
    googleReviewUrl({ forPage: true }),
    nextdoorPageUrl(),
  ]);
  const { count, average, nextdoor, google, etsy } = reviewSummary(reviews);
  const featured = featuredReview(reviews);
  const wall = featured ? reviews.filter((review) => review._id !== featured._id) : reviews;

  // How many each site holds, each leading there. Counted, never averaged:
  // Google's and Etsy's stars are theirs to add up.
  const sources = [
    count > 0 && { key: "site", text: `${average.toFixed(1)} from ${count} ${count === 1 ? "review" : "reviews"} here`, href: null, heart: false },
    nextdoor > 0 && {
      key: "nextdoor",
      text: `${nextdoor} ${nextdoor === 1 ? "recommendation" : "recommendations"} on Nextdoor`,
      href: nextdoorUrl,
      heart: true,
    },
    google > 0 && { key: "google", text: `${google} ${google === 1 ? "review" : "reviews"} from Google`, href: BUSINESS.googleMapsUrl, heart: false },
    etsy > 0 && { key: "etsy", text: `${etsy} ${etsy === 1 ? "review" : "reviews"} from Etsy`, href: `${BUSINESS.etsyUrl}#reviews`, heart: false },
  ].filter((source) => source !== false);

  return (
    <>
      <HeaderWrapper />
      <main id="main" className="pt-28">
        {/* ──── The opening: what people say, and where ──── */}
        {/* pt-16 md:pt-24 under the main's pt-28, as the shop, /contact and
            /gift-cards open: at md:pt-20 this heading stood higher than theirs */}
        <section className="relative overflow-hidden pt-16 pb-12 md:pt-24">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-lavender-bg to-transparent pointer-events-none"
          />
          <div className="relative max-w-5xl mx-auto px-6 text-center">
            <p className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4">Reviews</p>
            <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl mb-6 text-balance">
              In their <span className="italic text-lavender">own words.</span>
            </h1>
            <p className="text-lg text-charcoal-light max-w-xl mx-auto leading-relaxed">
              What people say after a fitting, a set of curtains or a piece from the shop — here, on Nextdoor, Google
              and Etsy. Kristina reads every review before it goes up.
            </p>

            {sources.length > 0 && (
              <ul className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
                {sources.map((source) => {
                  const inner = (
                    <>
                      {source.heart ? (
                        <Heart size={14} aria-hidden="true" className="fill-lavender text-lavender" />
                      ) : (
                        <Star size={14} aria-hidden="true" className="fill-lavender text-lavender" />
                      )}
                      <span className="tabular-nums">{source.text}</span>
                    </>
                  );
                  const pill =
                    "inline-flex items-center gap-2 rounded-full border border-lavender-soft bg-white/80 px-4 py-2 text-sm text-charcoal";
                  return (
                    <li key={source.key}>
                      {source.href ? (
                        <a
                          href={source.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${pill} hover:border-lavender transition-colors`}
                        >
                          {inner}
                        </a>
                      ) : (
                        <span className={pill}>{inner}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <a
              href="#write"
              className="press inline-flex items-center gap-2 mt-8 px-7 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover"
            >
              Write a review
            </a>
          </div>

          {/* ──── The fullest word about the atelier ──── */}
          {/* The fullest that still fits as a quote: featuredReview keeps it to
              FEATURED_REVIEW_MAX, so it never fills a phone's screen many
              times over before the page's own button */}
          {featured && (
            <figure className="relative max-w-3xl mt-14 mx-6 sm:mx-auto rounded-3xl bg-white/80 border border-lavender-soft/60 px-7 pt-12 pb-9 sm:px-14 text-center shadow-[0_20px_60px_-30px_rgba(90,45,92,0.22)]">
              <span
                aria-hidden="true"
                className="absolute left-1/2 -translate-x-1/2 -top-7 font-serif text-8xl leading-none text-lavender select-none"
              >
                &ldquo;
              </span>
              <blockquote className="font-serif text-xl sm:text-2xl leading-relaxed text-charcoal whitespace-pre-line [overflow-wrap:anywhere]">
                {featured.comment}
              </blockquote>
              <figcaption className="mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-charcoal-light">
                {typeof featured.rating === "number" && <StarRating rating={featured.rating} size={14} />}
                <span className="font-medium text-charcoal">{featured.userName}</span>
                <ReviewSourceMark source={featured.source} nextdoorUrl={nextdoorUrl} />
              </figcaption>
            </figure>
          )}
        </section>

        {/* ──── Everything else ──── */}
        {wall.length > 0 && (
          <section className="pb-20 md:pb-24">
            <div className="max-w-6xl mx-auto px-6">
              <h2 className="font-serif text-2xl sm:text-3xl mb-8 text-center">What people said</h2>
              <ReviewWall reviews={wall} nextdoorUrl={nextdoorUrl} />
            </div>
          </section>
        )}

        {/* ──── Two ways to add one ──── */}
        <section className="pb-24">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-10">
              <p className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-3">Your turn</p>
              <h2 className="font-serif text-3xl sm:text-4xl">Worked with Kristina?</h2>
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
                  className="press inline-flex items-center gap-2 px-7 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover"
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
                {nextdoorUrl && (
                  <div className="mt-7 pt-6 border-t border-lavender-soft/40">
                    <p className="text-sm text-charcoal-light leading-relaxed mb-3">
                      Found Kristina through Nextdoor? A recommendation there helps your neighbours find her too.
                    </p>
                    <a
                      href={nextdoorRecommendUrl(nextdoorUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-charcoal underline underline-offset-4 decoration-lavender hover:decoration-charcoal"
                    >
                      <Heart size={14} aria-hidden="true" className="fill-lavender text-lavender" />
                      Recommend us on Nextdoor
                    </a>
                    <p className="mt-2 text-xs text-charcoal-light">
                      Opens Nextdoor&rsquo;s recommendation form &mdash; sign in there if it asks.
                    </p>
                  </div>
                )}
              </div>

              <SiteReviewForm googleUrl={googleUrl} />
            </div>
          </div>
        </section>
      </main>
      <FooterWrapper />
    </>
  );
}
