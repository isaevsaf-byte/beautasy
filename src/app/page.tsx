import type { Metadata } from "next";
import HomeContent from "./HomeContent";
import WorkStrip from "@/components/work/WorkStrip";
import ReviewStrip from "@/components/reviews/ReviewStrip";
import { getWork } from "@/lib/getWork";
import { getReviews } from "@/lib/getReviews";
import { nextdoorPageUrl } from "@/lib/siteSettings";
import { showPiece } from "@/lib/workMedia";

// A piece Kristina publishes in Our Work, or a review she approves, shows here
// within five minutes
export const revalidate = 300;

/**
 * The home page's own metadata. Only a canonical address: the title,
 * description and card come from the root layout. It lives here and not in
 * the layout because every page without an address of its own would inherit
 * it there, and tell Google it is a copy of the home page.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  const [work, reviews, nextdoorUrl] = await Promise.all([getWork(), getReviews(), nextdoorPageUrl()]);
  // The newest of everything: the shop's pieces are made in the same room
  const recent = work.pieces.slice(0, 4).map(showPiece);
  // The newest three, whether about a fitting, curtains or a piece from the shop
  const kindWords = reviews.slice(0, 3);
  return (
    <HomeContent
      recentWork={
        recent.length > 0 ? (
          <WorkStrip pieces={recent} eyebrow="Made & Mended" heading="Fresh from the workroom" />
        ) : null
      }
      reviews={kindWords.length > 0 ? <ReviewStrip reviews={kindWords} nextdoorUrl={nextdoorUrl} /> : null}
    />
  );
}
