import type { Metadata } from "next";
import HomeContent from "./HomeContent";
import WorkStrip from "@/components/work/WorkStrip";
import { getWork } from "@/lib/getWork";
import { showPiece } from "@/lib/workMedia";

// A piece Kristina publishes in Our Work shows here within five minutes
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
  // The newest of everything: the shop's pieces are made in the same room
  const recent = (await getWork()).pieces.slice(0, 4).map(showPiece);
  return (
    <HomeContent
      recentWork={
        recent.length > 0 ? (
          <WorkStrip pieces={recent} eyebrow="Made & Mended" heading="Fresh from the workroom" />
        ) : null
      }
    />
  );
}
