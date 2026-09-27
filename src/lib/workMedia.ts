import { urlFor } from "./sanity";
import { getLocalService } from "./localServices";
import {
  categoryLabel,
  isoDuration,
  type Showreel,
  type WorkCategory,
  type WorkImageSource,
  type WorkMedia,
  type WorkPhoto,
  type WorkPiece,
} from "./work";

/**
 * The gallery's pieces with their picture addresses worked out on the server.
 *
 * Sanity's CDN resizes and converts pictures itself (WebP or AVIF, whatever the
 * browser takes), so the page asks it directly for each size a screen might
 * need — the browser picks one from the list. Nothing goes through Vercel's
 * image optimiser, which the Hobby plan meters, and the browser bundle never
 * carries a Sanity library.
 */

export interface ShownPhoto {
  kind: "photo";
  key: string;
  alt: string;
  src: string;
  srcSet: string;
  /** For the full-screen viewer */
  full: string;
  width: number;
  height: number;
  lqip: string | null;
}

export interface ShownVideo {
  kind: "video";
  key: string;
  alt: string;
  src: string;
  poster: string | null;
  posterSrcSet: string | null;
  width: number;
  height: number;
  duration: number | null;
  lqip: string | null;
}

export type ShownMedia = ShownPhoto | ShownVideo;

export interface ShownPiece {
  id: string;
  /** The address of this piece on /work: /work#<anchor> opens it */
  anchor: string;
  title: string;
  caption: string | null;
  category: WorkCategory;
  categoryLabel: string;
  /** The service page this job belongs on, named the way its "Also done here" card names it */
  service: { slug: string; title: string } | null;
  shelf: string | null;
  date: string;
  before: ShownPhoto | null;
  media: ShownMedia[];
}

export interface ShownShowreel {
  src: string;
  poster: string | null;
}

/** The widths the browser can choose from. A phone at 3x wants the larger ones for a full-width tile. */
const WIDTHS = [320, 480, 640, 800, 1080, 1440];

/** Never ask for a picture wider than the one uploaded: Sanity would send the same pixels under a false label */
export function widthsFor(sourceWidth: number): number[] {
  const largest = Math.min(sourceWidth, WIDTHS[WIDTHS.length - 1]);
  return [...WIDTHS.filter((w) => w < largest), largest];
}

function sized(image: WorkImageSource, width: number): string {
  return urlFor(image).width(width).fit("max").quality(80).url();
}

export function srcSetFor(image: WorkImageSource, sourceWidth: number): string {
  return widthsFor(sourceWidth)
    .map((w) => `${sized(image, w)} ${w}w`)
    .join(", ");
}

function showPhoto(photo: WorkPhoto, fallbackAlt: string): ShownPhoto {
  const widths = widthsFor(photo.width);
  return {
    kind: "photo",
    key: photo.key,
    alt: photo.alt ?? fallbackAlt,
    src: sized(photo.image, widths[Math.min(2, widths.length - 1)]),
    srcSet: srcSetFor(photo.image, photo.width),
    full: sized(photo.image, Math.min(photo.width, 1600)),
    width: photo.width,
    height: photo.height,
    lqip: photo.lqip,
  };
}

function showMedia(item: WorkMedia, fallbackAlt: string): ShownMedia {
  if (item.kind === "photo") return showPhoto(item, fallbackAlt);
  // A poster is shown at the size of the video; its own width is not known here
  const posterWidth = Math.max(item.width, 1080);
  return {
    kind: "video",
    key: item.key,
    alt: item.alt ?? fallbackAlt,
    src: item.url,
    poster: item.poster ? sized(item.poster, 800) : null,
    posterSrcSet: item.poster ? srcSetFor(item.poster, posterWidth) : null,
    width: item.width,
    height: item.height,
    duration: item.duration,
    lqip: item.lqip,
  };
}

/** "workPiece-doorway-curtains" → "doorway-curtains"; an id the Studio made stays as it is */
export function anchorFor(id: string): string {
  return id.replace(/^workPiece[-.]/, "").replace(/[^A-Za-z0-9_-]/g, "-");
}

export function showPiece(piece: WorkPiece): ShownPiece {
  // A slug whose page has since gone is dropped rather than linked to a 404
  const service = piece.service ? getLocalService(piece.service) : undefined;
  return {
    id: piece.id,
    anchor: anchorFor(piece.id),
    title: piece.title,
    caption: piece.caption,
    category: piece.category,
    categoryLabel: categoryLabel(piece.category),
    service: service ? { slug: service.slug, title: service.h1.replace(" in Southampton", "") } : null,
    shelf: piece.shelf,
    date: piece.date,
    before: piece.before ? showPhoto(piece.before, `${piece.title} — before`) : null,
    media: piece.media.map((item, i) => showMedia(item, i === 0 && piece.before ? `${piece.title} — after` : piece.title)),
  };
}

export function showShowreel(showreel: Showreel | null): ShownShowreel | null {
  if (!showreel) return null;
  return { src: showreel.url, poster: showreel.poster ? sized(showreel.poster, 720) : null };
}

/** The picture a shared link to /work shows: the newest piece's cover, cropped to a link card */
export function shareImageFor(piece: WorkPiece | undefined): string | null {
  if (!piece) return null;
  const cover = piece.media[0];
  const source = cover.kind === "photo" ? cover.image : cover.poster;
  return source ? urlFor(source).width(1200).height(630).fit("crop").quality(80).url() : null;
}

/**
 * What search engines are told about the gallery: a page of Beautasy's work,
 * its photographs, and each film with its cover — Google lists a video only
 * with a picture to show for it, so one without a cover is left out here.
 */
export function workJsonLd(pieces: readonly ShownPiece[], pageUrl: string, businessId: string) {
  const photos = pieces.flatMap((piece) =>
    [...(piece.before ? [piece.before] : []), ...piece.media]
      .filter((m): m is ShownPhoto => m.kind === "photo")
      .map((photo) => ({
        "@type": "ImageObject",
        contentUrl: photo.full,
        name: piece.title,
        caption: photo.alt,
        width: photo.width,
        height: photo.height,
        creditText: "Beautasy",
        creator: { "@type": "Organization", name: "Beautasy" },
      }))
  );
  const videos = pieces.flatMap((piece) =>
    piece.media
      .filter((m): m is ShownVideo => m.kind === "video" && m.poster !== null)
      .map((video, i, all) => ({
        "@type": "VideoObject",
        name: all.length > 1 ? `${piece.title} (${i + 1})` : piece.title,
        description: piece.caption ?? video.alt,
        thumbnailUrl: [video.poster],
        contentUrl: video.src,
        uploadDate: piece.date,
        ...(video.duration ? { duration: isoDuration(video.duration) } : {}),
      }))
  );
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Made & Mended — Our Work",
    url: pageUrl,
    about: { "@id": businessId },
    mainEntity: { "@type": "ImageGallery", name: "Made & Mended", associatedMedia: photos },
    ...(videos.length ? { hasPart: videos } : {}),
  };
}
