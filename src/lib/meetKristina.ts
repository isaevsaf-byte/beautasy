import { SITE_SETTINGS } from "./siteSettingsDocument";

/**
 * «Знакомьтесь, Кристина»: the person behind the atelier, on the pages people
 * land on.
 *
 * Someone deciding whether to hand their clothes to a stranger — and to come
 * to a private address for the fitting — wants to see who they will meet. The
 * photos are Kristina's to take, so the block waits for them: until a portrait
 * is uploaded in the Studio (Настройки сайта → «Знакомьтесь, Кристина») it is
 * not on the site at all. An empty frame or a borrowed face would say the
 * opposite of what the block is for.
 *
 * Plain data and plain functions, with no Sanity client: the Studio's schema
 * takes its limits from here, and the site builds the picture addresses on the
 * server (see meetKristina() in ./siteSettings).
 */

/** The most the text may run to: three or four sentences beside a photo */
export const MEET_KRISTINA_TEXT_MAX = 400;

/** The shorter side a photo needs to stay sharp on a large phone screen */
export const MEET_KRISTINA_MIN_SIDE = 1200;

/**
 * What the block says while Kristina has written nothing of her own. Only
 * what the site already says about her work — no years, no qualifications —
 * so it can never claim something she would have to correct.
 */
export const MEET_KRISTINA_DEFAULT_TEXT =
  "Hi, I'm Kristina. I alter, mend and make clothes by hand in my quiet home workroom in Southampton. " +
  "Everything is pinned on you, priced before I start, and sewn by the same pair of hands.";

/** Said for a photo that somehow arrives without its description */
const FALLBACK_ALT = {
  photo: "Kristina of Beautasy Atelier",
  atWork: "Kristina at work in her Southampton workroom",
} as const;

/**
 * Both photos are shown in the same upright shape, so they read as a pair and
 * the page keeps its place while they load. Kristina's focus point decides
 * what stays inside it. 1080 wide is the largest the page draws one (540px on
 * a laptop) at twice the pixels, which is what a laptop screen has.
 */
export const PORTRAIT = { width: 1080, height: 1350 } as const;

/**
 * The settings as the site reads them: each photo with its own description and
 * the blurred thumbnail Sanity keeps for it, and the text.
 */
export const MEET_KRISTINA_QUERY = `${SITE_SETTINGS}.meetKristina{
  "photo": photo{ asset, hotspot, crop, alt, "lqip": asset->metadata.lqip },
  "atWork": atWork{ asset, hotspot, crop, alt, "lqip": asset->metadata.lqip },
  text
}`;

/** A Sanity image as the image-url builder takes it: the asset plus Kristina's crop and focus point */
export interface PortraitImage {
  asset: { _ref: string };
  hotspot?: { x: number; y: number; height: number; width: number };
  crop?: { top: number; bottom: number; left: number; right: number };
}

export interface MeetKristinaPhoto {
  image: PortraitImage;
  alt: string;
  lqip: string | null;
}

/** What the Studio holds, checked: never a photo without a picture in it */
export interface MeetKristinaSource {
  photo: MeetKristinaPhoto;
  atWork: MeetKristinaPhoto | null;
  /** Kristina's own words, or the default when she has written none */
  paragraphs: string[];
}

/** A photo as the page draws it, its address already worked out on the server */
export interface ShownPortrait {
  src: string;
  alt: string;
  width: number;
  height: number;
  lqip: string | null;
}

export interface MeetKristinaContent {
  photo: ShownPortrait;
  atWork: ShownPortrait | null;
  paragraphs: string[];
}

/**
 * The size of an uploaded picture, read from its asset id: Sanity names every
 * image "image-<hash>-<width>x<height>-<format>". Null for anything else.
 */
export function imageSizeFromRef(ref: unknown): { width: number; height: number } | null {
  if (typeof ref !== "string") return null;
  const found = /^image-[A-Za-z0-9]+-(\d+)x(\d+)-[a-z0-9]+$/.exec(ref);
  if (!found) return null;
  const width = Number(found[1]);
  const height = Number(found[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The Studio's warning for a photo too small to stay sharp, or true. A warning
 * and not a block: a slightly soft portrait is still better than none.
 */
export function photoSizeProblem(value: unknown): string | true {
  const ref = (value as { asset?: { _ref?: unknown } } | null | undefined)?.asset?._ref;
  const size = imageSizeFromRef(ref);
  if (!size) return true;
  const shorter = Math.min(size.width, size.height);
  return shorter >= MEET_KRISTINA_MIN_SIDE
    ? true
    : `Фото маленькое: ${size.width}×${size.height}. Нужно не меньше ${MEET_KRISTINA_MIN_SIDE} пикселей по короткой стороне, иначе на телефоне оно будет мыльным. Возьмите оригинал с телефона, а не скриншот или фото из WhatsApp.`;
}

function photoFrom(raw: unknown, fallbackAlt: string): MeetKristinaPhoto | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as {
    asset?: { _ref?: unknown };
    hotspot?: PortraitImage["hotspot"];
    crop?: PortraitImage["crop"];
    alt?: unknown;
    lqip?: unknown;
  };
  const ref = value.asset?._ref;
  if (typeof ref !== "string" || !ref.startsWith("image-")) return null;
  const alt = typeof value.alt === "string" ? value.alt.trim() : "";
  return {
    image: {
      asset: { _ref: ref },
      ...(value.hotspot ? { hotspot: value.hotspot } : {}),
      ...(value.crop ? { crop: value.crop } : {}),
    },
    alt: alt || fallbackAlt,
    lqip: typeof value.lqip === "string" && value.lqip.startsWith("data:image/") ? value.lqip : null,
  };
}

/**
 * The text as paragraphs: a blank line in the Studio starts a new one, a
 * single line break is only where the box happened to wrap.
 */
export function paragraphsOf(text: unknown): string[] {
  const written = typeof text === "string" ? text : "";
  const paragraphs = written
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : [MEET_KRISTINA_DEFAULT_TEXT];
}

/**
 * What the block shows, or null when there is no portrait — and then nothing
 * is shown at all. The photo at work is only ever the second picture: on its
 * own it would leave the block without a face.
 */
export function meetKristinaFrom(raw: unknown): MeetKristinaSource | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { photo?: unknown; atWork?: unknown; text?: unknown };
  const photo = photoFrom(value.photo, FALLBACK_ALT.photo);
  if (!photo) return null;
  return {
    photo,
    atWork: photoFrom(value.atWork, FALLBACK_ALT.atWork),
    paragraphs: paragraphsOf(value.text),
  };
}
