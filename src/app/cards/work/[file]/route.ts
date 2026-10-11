import sharp from "sharp";
import { readWork } from "@/lib/getWork";
import { urlFor } from "@/lib/sanity";
import { sewnCard } from "@/lib/sewnCard";
import { sewnCardFor } from "@/lib/socialCard";
import { anchorFor } from "@/lib/workMedia";
import { photoSize, workCard, type WorkCardPicture } from "@/lib/workCard";
import { workCardOf, workCardVersion, type WorkCardPhoto } from "@/lib/workCardVersion";
import type { WorkImageSource } from "@/lib/work";

/**
 * One piece of work's link-preview card as a file, /cards/work/<piece>.jpg —
 * see src/lib/workCard.tsx. A page names it with ?v= and the card's version
 * on the end (src/lib/workCardVersion.ts).
 *
 * Drawn on request rather than at build: Kristina publishes a piece from the
 * Studio and its link can be sent the same minute. Vercel's CDN keeps each
 * address it serves, query included, so a card is drawn about once a day
 * per version: only the address with the card's current version is drawn
 * and kept, for a day — a piece taken down leaves the CDN by the next. Any
 * other ?v=, or none, is sent on to the current one, so a made-up version
 * costs a redirect, not a drawing. A card drawn without its photos, because
 * one would not load, is kept five minutes and then drawn again.
 *
 * A JPEG, not the renderer's PNG: with a photo in it the PNG is 500-700 KB,
 * and WhatsApp is widely seen to drop a preview picture over about 300 KB.
 */
export const dynamic = "force-dynamic";

const KEEP = "public, max-age=86400, s-maxage=86400";
const BRIEFLY = "public, max-age=300, s-maxage=300";

/** A photo from Sanity's CDN, cut to the size the card draws it, as a data: URI */
async function photo(image: WorkImageSource, width: number, height: number): Promise<string> {
  const response = await fetch(urlFor(image).width(width).height(height).fit("crop").format("jpg").quality(85).url(), {
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !/^image\/jpe?g/.test(type)) throw new Error(`Sanity sent ${response.status} ${type}`);
  return `data:image/jpeg;base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
}

/** Every photo, or none: a pair with one side missing would say nothing */
async function pictures(photos: WorkCardPhoto[]): Promise<WorkCardPicture[] | null> {
  const { width, height } = photoSize(photos.length);
  try {
    return await Promise.all(photos.map(async ({ tag, image }) => ({ tag, src: await photo(image, width, height) })));
  } catch (error) {
    console.error("A work card's photo did not load:", error);
    return null;
  }
}

async function jpeg(picture: Response, cacheControl: string): Promise<Response> {
  const bytes = await sharp(Buffer.from(await picture.arrayBuffer())).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": cacheControl } });
}

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const anchor = /^([A-Za-z0-9_-]+)\.jpg$/.exec(file)?.[1];
  if (!anchor) return new Response("Not Found", { status: 404 });

  let pieces;
  try {
    ({ pieces } = await readWork());
  } catch (error) {
    // Which piece is unknown: the atelier's own card, until Sanity answers
    console.error("A work card could not read Our Work:", error);
    return jpeg(sewnCard(sewnCardFor("atelier")!), BRIEFLY);
  }
  const piece = pieces.find((p) => anchorFor(p.id) === anchor);
  if (!piece) return new Response("Not Found", { status: 404, headers: { "Cache-Control": BRIEFLY } });

  const content = workCardOf(piece);
  const version = workCardVersion(content);
  // Exactly ?v=<version>: anything added to it would be one more address for
  // the CDN to keep, and one more drawing
  const address = new URL(request.url);
  if (address.search !== `?v=${version}`) {
    const current = new URL(`/cards/work/${anchor}.jpg?v=${version}`, address);
    return new Response(null, { status: 307, headers: { Location: current.href, "Cache-Control": BRIEFLY } });
  }
  const drawn = await pictures(content.photos);
  return jpeg(workCard({ title: content.title, photos: drawn ?? [] }), drawn ? KEEP : BRIEFLY);
}
