import AtelierContent from "./AtelierContent";
import WorkStrip from "@/components/work/WorkStrip";
import ReviewStrip from "@/components/reviews/ReviewStrip";
import { getWork } from "@/lib/getWork";
import { getReviews } from "@/lib/getReviews";
import { nextdoorPageUrl } from "@/lib/siteSettings";
import { atelierReviews } from "@/lib/siteReviews";
import { atelierPieces } from "@/lib/work";
import { showPiece } from "@/lib/workMedia";

// A piece Kristina publishes in Our Work, or a review she approves, shows here
// within five minutes
export const revalidate = 300;

export default async function AtelierPage() {
  const [{ pieces }, reviews, nextdoorUrl] = await Promise.all([getWork(), getReviews(), nextdoorPageUrl()]);
  const recent = atelierPieces(pieces, 4).map(showPiece);
  // About the atelier's work only: a review of a piece from the shop belongs to the shop
  const kindWords = atelierReviews(reviews).slice(0, 3);
  return (
    <AtelierContent
      recentWork={
        recent.length > 0 ? (
          <WorkStrip pieces={recent} eyebrow="Made & Mended" heading="Recent work from the atelier" />
        ) : null
      }
      reviews={kindWords.length > 0 ? <ReviewStrip reviews={kindWords} nextdoorUrl={nextdoorUrl} /> : null}
    />
  );
}
