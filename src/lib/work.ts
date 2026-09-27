/**
 * "Made & Mended" — Kristina's work, at /work.
 *
 * A visitor deciding whether to trust a stranger with their wedding dress
 * wants to see what that stranger has already done. Until now the site said
 * "expert alterations" and showed a logo. Each piece here is one job told in
 * pictures: a before and an after, a few photos of the making, a video.
 *
 * Kristina adds pieces in the Studio under "Our Work". Photos go straight in —
 * the Studio turns back one whose file still says where it was taken (see
 * @/lib/photoLocation). Videos come only through scripts/gallery-import.mjs,
 * which makes them small enough to play on a phone and strips where they were
 * filmed.
 *
 * Pure: the page, the gallery in the browser, the Studio and the tests all
 * read it, so nothing here may pull in a Sanity client.
 */

import { SITE_SETTINGS } from "./siteSettingsDocument";

export type WorkCategory = "alterations" | "home" | "made" | "kids" | "accessories" | "workroom";

/** In the order the filters show them. A filter with nothing in it is not shown. */
export const WORK_CATEGORIES: readonly { value: WorkCategory; label: string }[] = [
  { value: "alterations", label: "Alterations" },
  { value: "home", label: "Curtains & home" },
  { value: "made", label: "Made from scratch" },
  { value: "kids", label: "Mini" },
  { value: "accessories", label: "Accessories" },
  { value: "workroom", label: "Behind the seams" },
];

/**
 * The atelier's side of the room — what a customer can bring in or order.
 * The atelier page shows these; the shop's own pieces have the shop.
 */
export const ATELIER_CATEGORIES: readonly WorkCategory[] = ["alterations", "home", "made", "workroom"];

/**
 * Where in the shop a piece can send someone who liked it. Written the way the
 * menu writes them, so `placeLink` in @/lib/shelves keeps, moves or drops each
 * one by what is actually on the shelf.
 */
export const WORK_SHELVES: readonly { value: string; title: string; cta: string }[] = [
  { value: "/shop/accessories?category=hair-accessories", title: "Hair accessories", cta: "Shop hair accessories" },
  { value: "/shop/accessories?category=pouches", title: "Pouches", cta: "Shop pouches" },
  { value: "/shop/accessories?category=sleeping-masks", title: "Sleeping masks", cta: "Shop sleeping masks" },
  { value: "/shop/kids?category=underwear", title: "Kids' underwear", cta: "Shop kids' underwear" },
  { value: "/shop/kids", title: "Mini Beautasy", cta: "Shop Mini Beautasy" },
  { value: "/shop/lingerie", title: "Lingerie", cta: "Shop lingerie" },
  { value: "/shop/home", title: "Home decor", cta: "Shop home decor" },
  { value: "/gift-cards", title: "Gift cards", cta: "Give a gift card" },
];

/** A Sanity image as the image-url builder takes it: the asset plus Kristina's crop and focus point */
export interface WorkImageSource {
  asset: { _ref: string };
  hotspot?: { x: number; y: number; height: number; width: number };
  crop?: { top: number; bottom: number; left: number; right: number };
}

export interface WorkPhoto {
  kind: "photo";
  key: string;
  alt: string | null;
  image: WorkImageSource;
  width: number;
  height: number;
  /** A blurred thumbnail the size of a postage stamp, shown while the photo loads */
  lqip: string | null;
}

export interface WorkVideo {
  kind: "video";
  key: string;
  alt: string | null;
  url: string;
  width: number;
  height: number;
  /** Seconds, when the import recorded it. A video added by hand in the Studio has none. */
  duration: number | null;
  poster: WorkImageSource | null;
  lqip: string | null;
}

export type WorkMedia = WorkPhoto | WorkVideo;

export interface WorkPiece {
  id: string;
  title: string;
  caption: string | null;
  category: WorkCategory;
  /** A service page slug under /alterations, when the piece belongs on one */
  service: string | null;
  /** A shop link, as written in WORK_SHELVES */
  shelf: string | null;
  date: string;
  /** The "before" photo. When there is one, the first of `media` is the "after". */
  before: WorkPhoto | null;
  media: WorkMedia[];
}

export interface Showreel {
  url: string;
  poster: WorkImageSource | null;
}

const PHOTO = `
  "key": coalesce(_key, "before"),
  "kind": "photo",
  alt,
  "image": { asset, hotspot, crop },
  "width": asset->metadata.dimensions.width,
  "height": asset->metadata.dimensions.height,
  "lqip": asset->metadata.lqip
`;

/**
 * Every piece, newest first. A piece can be given a date to move it up or down;
 * one without keeps the day it was created.
 */
export const WORK_QUERY = `{
  "pieces": *[_type == "workPiece" && defined(title) && count(media) > 0]
    | order(coalesce(date, _createdAt) desc, _createdAt desc) {
    "id": _id,
    title,
    caption,
    category,
    service,
    shelf,
    "date": coalesce(date, _createdAt),
    "before": before{ ${PHOTO} },
    "media": media[]{
      _type == "workPhoto" => { ${PHOTO} },
      _type == "workVideo" => {
        "key": _key,
        "kind": "video",
        alt,
        "url": file.asset->url,
        width,
        height,
        duration,
        "poster": select(defined(poster.asset) => poster{ asset, hotspot, crop }),
        "lqip": poster.asset->metadata.lqip
      }
    }
  },
  "showreel": (${SITE_SETTINGS}){
    "url": workPage.showreel.asset->url,
    "poster": select(defined(workPage.showreelPoster.asset) => workPage.showreelPoster{ asset, hotspot, crop })
  }
}`;

const CATEGORY_VALUES = new Set<string>(WORK_CATEGORIES.map((c) => c.value));

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function imageSource(value: unknown): WorkImageSource | null {
  const source = value as WorkImageSource | null | undefined;
  return typeof source?.asset?._ref === "string" && source.asset._ref ? source : null;
}

function photoFrom(raw: Record<string, unknown> | null | undefined): WorkPhoto | null {
  const image = imageSource(raw?.image);
  const width = positive(raw?.width);
  const height = positive(raw?.height);
  // An image field left empty in the Studio still arrives as an object
  if (!raw || !image || !width || !height) return null;
  return {
    kind: "photo",
    key: text(raw.key) ?? image.asset._ref,
    alt: text(raw.alt),
    image,
    width,
    height,
    lqip: text(raw.lqip),
  };
}

function videoFrom(raw: Record<string, unknown> | null | undefined): WorkVideo | null {
  const url = text(raw?.url);
  if (!raw || !url) return null;
  // A phone films upright: a video added by hand, with no size recorded, is
  // laid out as one until it plays
  return {
    kind: "video",
    key: text(raw.key) ?? url,
    alt: text(raw.alt),
    url,
    width: positive(raw.width) ?? 9,
    height: positive(raw.height) ?? 16,
    duration: positive(raw.duration),
    poster: imageSource(raw.poster),
    lqip: text(raw.lqip),
  };
}

interface RawWork {
  pieces?: Record<string, unknown>[] | null;
  showreel?: Record<string, unknown> | null;
}

/**
 * The pieces as the page shows them. Whatever is half-filled in the Studio —
 * a photo slot with no photo, a video still uploading, a piece with nothing
 * left to show — is left out rather than drawn as an empty frame.
 */
export function workFrom(raw: RawWork | null | undefined): { pieces: WorkPiece[]; showreel: Showreel | null } {
  const pieces: WorkPiece[] = [];
  for (const piece of raw?.pieces ?? []) {
    const id = text(piece?.id);
    const title = text(piece?.title);
    if (!id || !title) continue;
    const media = ((piece.media as Record<string, unknown>[] | null) ?? [])
      .map((item) => (item?.kind === "video" ? videoFrom(item) : photoFrom(item)))
      .filter((item): item is WorkMedia => item !== null);
    if (media.length === 0) continue;
    const category = text(piece.category);
    pieces.push({
      id,
      title,
      caption: text(piece.caption),
      // A piece saved before its category was chosen still belongs somewhere
      category: category && CATEGORY_VALUES.has(category) ? (category as WorkCategory) : "workroom",
      service: text(piece.service),
      shelf: text(piece.shelf),
      date: text(piece.date) ?? "",
      before: photoFrom(piece.before as Record<string, unknown> | null),
      media,
    });
  }
  const url = text(raw?.showreel?.url);
  return {
    pieces,
    showreel: url ? { url, poster: imageSource(raw?.showreel?.poster) } : null,
  };
}

/** The filters worth showing: only categories with something in them, in the fixed order */
export function categoriesIn(
  pieces: readonly { category: WorkCategory }[]
): { value: WorkCategory; label: string; count: number }[] {
  return WORK_CATEGORIES.map((c) => ({ ...c, count: pieces.filter((p) => p.category === c.value).length })).filter(
    (c) => c.count > 0
  );
}

/** What a service page shows: the pieces Kristina filed under it */
export function piecesForService(pieces: readonly WorkPiece[], slug: string): WorkPiece[] {
  return pieces.filter((p) => p.service === slug);
}

/** What the atelier page shows: the newest from the atelier's side of the room */
export function atelierPieces<T extends { category: WorkCategory }>(pieces: readonly T[], limit: number): T[] {
  return pieces.filter((p) => ATELIER_CATEGORIES.includes(p.category)).slice(0, limit);
}

/** A before and an after that can be shown side by side */
export function isBeforeAfter(piece: WorkPiece): piece is WorkPiece & { before: WorkPhoto } {
  return piece.before !== null && piece.media[0]?.kind === "photo";
}

/** "0:14", "1:05" — how long a video runs, as a player shows it */
export function durationLabel(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** "PT14S", "PT1M5S" — how schema.org wants a duration */
export function isoDuration(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `PT${minutes ? `${minutes}M` : ""}${rest ? `${rest}S` : ""}`;
}

/** The label a filter shows, or the category's own name for an unknown one */
export function categoryLabel(category: WorkCategory): string {
  return WORK_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

/** What the button to a shop shelf says: "Shop hair accessories" */
export function shelfCta(href: string): string | null {
  return WORK_SHELVES.find((s) => s.value === href)?.cta ?? null;
}
