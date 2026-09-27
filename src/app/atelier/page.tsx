import AtelierContent from "./AtelierContent";
import WorkStrip from "@/components/work/WorkStrip";
import { getWork } from "@/lib/getWork";
import { atelierPieces } from "@/lib/work";
import { showPiece } from "@/lib/workMedia";

// A piece Kristina publishes in Our Work shows here within five minutes
export const revalidate = 300;

export default async function AtelierPage() {
  const { pieces } = await getWork();
  const recent = atelierPieces(pieces, 4).map(showPiece);
  return (
    <AtelierContent
      recentWork={
        recent.length > 0 ? (
          <WorkStrip pieces={recent} eyebrow="Made & Mended" heading="Recent work from the atelier" />
        ) : null
      }
    />
  );
}
