import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readWork } from "@/lib/getWork";
import { anchorFor } from "@/lib/workMedia";
import { workCardImages, workPieceDescription } from "@/lib/workCardVersion";
import { SITE_URL } from "@/lib/site";
import { pieceTitle } from "@/components/work/pieceAddress";
import WorkPageContent from "../WorkPageContent";

/**
 * One piece of work at an address of its own, /work/<piece> — what the
 * gallery shows while a piece is open, and what "Send this to a friend"
 * sends (11.10.2026).
 *
 * The gallery used to open a piece at /work#<piece>, but a chat app never
 * sends what follows the # to the server, so every piece shared that way
 * previewed as the gallery, with the newest piece's photo. Here the page
 * names the piece's own card (src/lib/workCardVersion.ts) and its caption;
 * the gallery under it opens the piece from the address
 * (src/components/work/pieceAddress.ts).
 *
 * The page is its own canonical: Facebook is held to read as far as
 * og:url, but a canonical naming /work could still send its scraper to the
 * gallery's card. It is the gallery under another address, so search engines
 * are asked not to list it — that changes nothing in a chat. A piece taken
 * down sends its link to the gallery.
 */
export const revalidate = 300;
export const dynamicParams = true;

type Params = { params: Promise<{ piece: string }> };

export async function generateStaticParams() {
  const { pieces } = await readWork();
  return pieces.map((piece) => ({ piece: anchorFor(piece.id) }));
}

async function pieceAt(anchor: string) {
  const { pieces } = await readWork();
  return pieces.find((piece) => anchorFor(piece.id) === anchor) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { piece: anchor } = await params;
  const piece = await pieceAt(anchor);
  if (!piece) return { robots: { index: false, follow: true } };
  const title = `${piece.title} | Beautasy Atelier, Southampton`;
  const description = workPieceDescription(piece);
  const images = workCardImages(piece, anchor);
  const url = `${SITE_URL}/work/${anchor}`;
  return {
    title: pieceTitle(piece.title),
    description,
    alternates: { canonical: url },
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: "Beautasy",
      locale: "en_GB",
      type: "website",
      images,
    },
    twitter: { card: "summary_large_image", title, description, images: images.map((image) => image.url) },
  };
}

export default async function WorkPiecePage({ params }: Params) {
  const { piece: anchor } = await params;
  if (!(await pieceAt(anchor))) redirect("/work");
  return <WorkPageContent />;
}
