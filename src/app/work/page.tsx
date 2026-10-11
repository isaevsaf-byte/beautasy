import type { Metadata } from "next";
import { readWork } from "@/lib/getWork";
import { shareImageFor } from "@/lib/workMedia";
import { SITE_URL } from "@/lib/site";
import { ATELIER_CARD_IMAGES } from "@/lib/socialCard";
import { GALLERY_TITLE } from "@/components/work/pieceAddress";
import WorkPageContent from "./WorkPageContent";

// A piece Kristina publishes shows within five minutes. If Sanity can't be
// read, readWork throws and the last good page keeps being served.
export const revalidate = 300;

const TITLE = GALLERY_TITLE;
// Kept to 155 characters, where Google trims a description: at 203 the
// before-and-after photos — the reason to click — were the part cut off
const DESCRIPTION =
  "Curtains taken up to skim the floor, a nursery quilt pieced square by square: real work from Beautasy's Southampton workroom, with before-and-after photos.";
const PAGE_URL = `${SITE_URL}/work`;

export async function generateMetadata(): Promise<Metadata> {
  const { pieces } = await readWork();
  const share = shareImageFor(pieces[0]);
  const images = share
    ? [{ url: share, width: 1200, height: 630, alt: "Work from the Beautasy atelier in Southampton" }]
    : ATELIER_CARD_IMAGES;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PAGE_URL },
    // A gallery with nothing in it is a "soft 404" to Google, as an empty shop
    // shelf is — see @/lib/shelves
    ...(pieces.length === 0 ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: PAGE_URL,
      siteName: "Beautasy",
      locale: "en_GB",
      type: "website",
      images,
    },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: images.map((i) => i.url) },
  };
}

export default function WorkPage() {
  return <WorkPageContent />;
}
