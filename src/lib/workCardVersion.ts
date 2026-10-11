import { createHash } from "node:crypto";
import { SITE_URL } from "@/lib/site";
import { SOCIAL_CARD_SIZE } from "@/lib/socialCard";
import type { WorkImageSource, WorkPiece } from "@/lib/work";

/**
 * Which pictures a piece of work's link-preview card shows, and the address
 * it is served at (the drawing is src/lib/workCard.tsx, the file
 * src/app/cards/work/[file]/route.ts).
 *
 * Until 11.10.2026 a piece could only be sent as /work#<piece>, and a chat
 * app never sends what follows the # to the server: every piece Kristina's
 * clients forwarded showed the newest piece's photo, whatever was sent. Now a
 * piece has its own page, /work/<piece>, and its own card: the photo sewn on
 * a label on the lavender cloth, or the before and the after sewn together.
 *
 * As with the atelier's cards (src/lib/sewnCardVersion.ts), the address ends
 * in a hash of what the card shows — the title, which photos, Kristina's crop
 * of them — and of this design mark, changed by hand with the look; a chat
 * app that kept an older picture asks again. No files are read here.
 */
export const WORK_CARD_DESIGN = "2026-10-11.1";

/** The tag on a photo: which side of the job it is, or that it is a film's cover */
export type WorkCardTag = "Before" | "After" | "Film";

export interface WorkCardPhoto {
  tag: WorkCardTag | null;
  image: WorkImageSource;
}

export interface WorkCardContent {
  title: string;
  /** The before and the after, one cover, or none — then Kristina's artwork stands in */
  photos: WorkCardPhoto[];
}

/** The pictures the viewer opens on (src/components/work/WorkViewer.tsx slidesOf): a pair only with a photo after */
export function workCardOf(piece: WorkPiece): WorkCardContent {
  const [cover] = piece.media;
  const title = piece.title;
  if (cover?.kind === "photo") {
    return piece.before
      ? { title, photos: [{ tag: "Before", image: piece.before.image }, { tag: "After", image: cover.image }] }
      : { title, photos: [{ tag: null, image: cover.image }] };
  }
  if (cover?.kind === "video" && cover.poster) return { title, photos: [{ tag: "Film", image: cover.poster }] };
  return { title, photos: [] };
}

/** Kristina's crop and focus point as plain numbers, in a fixed order */
function framing({ asset, crop, hotspot }: WorkImageSource) {
  return [
    asset._ref,
    crop ? [crop.top, crop.bottom, crop.left, crop.right] : null,
    hotspot ? [hotspot.x, hotspot.y, hotspot.width, hotspot.height] : null,
  ];
}

/** The last part of a card's address: what it shows, in 10 characters */
export function workCardVersion({ title, photos }: WorkCardContent): string {
  const shown = JSON.stringify(photos.map((photo) => [photo.tag, ...framing(photo.image)]));
  return createHash("sha1").update(`${WORK_CARD_DESIGN}|${title}|${shown}`).digest("hex").slice(0, 10);
}

/** What a screen reader in the chat app says for a card */
export function workCardAlt({ title, photos }: WorkCardContent): string {
  const pair = photos.some((photo) => photo.tag === "Before");
  return `${title}${pair ? ", before and after" : ""}: work from Beautasy Atelier in Southampton.`;
}

/** A piece's card as its page's openGraph (and twitter) images */
export function workCardImages(piece: WorkPiece, anchor: string) {
  const content = workCardOf(piece);
  return [
    {
      url: `${SITE_URL}/cards/work/${anchor}.jpg?v=${workCardVersion(content)}`,
      width: SOCIAL_CARD_SIZE.width,
      height: SOCIAL_CARD_SIZE.height,
      alt: workCardAlt(content),
      type: "image/jpeg",
    },
  ];
}

/**
 * The line a chat app prints under the card: the piece's caption, cut where
 * Google and Facebook cut a description (about 155 characters), at a word
 */
export function workPieceDescription(piece: Pick<WorkPiece, "title" | "caption">): string {
  const caption = piece.caption?.replace(/\s+/g, " ").trim();
  if (!caption) return `${piece.title}: real work from Beautasy's Southampton workroom.`;
  if (caption.length <= 155) return caption;
  const cut = caption.slice(0, 154);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:—–-]+$/, "")}…`;
}
