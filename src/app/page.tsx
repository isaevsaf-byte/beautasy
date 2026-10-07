import type { Metadata } from "next";
import HomeContent from "./HomeContent";
import WorkStrip from "@/components/work/WorkStrip";
import ReviewStrip from "@/components/reviews/ReviewStrip";
import MeetKristina from "@/components/MeetKristina";
import { getWork } from "@/lib/getWork";
import { getReviews } from "@/lib/getReviews";
import { meetKristina, nextdoorPageUrl } from "@/lib/siteSettings";
import { showPiece } from "@/lib/workMedia";
import { SITE_URL } from "@/lib/site";
import { ATELIER_CARD_IMAGES } from "@/lib/socialCard";
import { SITE_DESCRIPTION, SITE_TITLE, lowestPrice } from "@/lib/siteCopy";

// A piece Kristina publishes in Our Work, or a review she approves, shows here
// within five minutes
export const revalidate = 300;

/**
 * The home page's own metadata: its canonical address, and the same address
 * as og:url. Both live here and not in the root layout because every page
 * without an address of its own would inherit them there, and tell Google —
 * and Facebook — that it is a copy of the home page.
 *
 * The openGraph block replaces the layout's whole, so the title, description
 * and picture are named again (see src/lib/socialCard.ts). The picture is the
 * atelier's card, which sews this page's own heading: the bare domain is the
 * link people paste most in a group's comments.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "Beautasy",
    locale: "en_GB",
    type: "website",
    images: ATELIER_CARD_IMAGES,
  },
};

export default async function Home() {
  // Asked alongside the rest, not after it
  const kristinaAsSet = meetKristina();
  const [work, reviews, nextdoorUrl] = await Promise.all([getWork(), getReviews(), nextdoorPageUrl()]);
  const kristina = await kristinaAsSet;
  // The newest of everything: the shop's pieces are made in the same room
  const recent = work.pieces.slice(0, 4).map(showPiece);
  // The newest three, whether about a fitting, curtains or a piece from the shop
  const kindWords = reviews.slice(0, 3);
  // The cheapest job, worked out here on the server: the price lists it comes
  // from are the service pages' whole copy, too much to send to a phone
  const priceFrom = lowestPrice();
  return (
    <HomeContent
      recentWork={
        recent.length > 0 ? (
          <WorkStrip pieces={recent} eyebrow="Made & Mended" heading="Latest from the atelier" />
        ) : null
      }
      reviews={kindWords.length > 0 ? <ReviewStrip reviews={kindWords} nextdoorUrl={nextdoorUrl} /> : null}
      priceFrom={priceFrom}
      meetKristina={kristina ? <MeetKristina content={kristina} /> : null}
    />
  );
}
