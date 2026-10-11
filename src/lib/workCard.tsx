import { ImageResponse } from "next/og";
import {
  CLOTH_BOTTOM,
  CLOTH_TOP,
  GOLD,
  GREY,
  INK,
  LABEL,
  LAVENDER,
  Sewn,
  artwork,
  bindAmpersands,
  face,
  svg,
  topstitch,
} from "@/lib/sewnCard";
import { SOCIAL_CARD_SIZE } from "@/lib/socialCard";
import type { WorkCardTag } from "@/lib/workCardVersion";

/**
 * The picture a link to one piece of work shows in a chat (11.10.2026): the
 * same lavender cloth and sewn-on label as the atelier's cards
 * (src/lib/sewnCard.tsx), with the piece's photo on the label in place of
 * Kristina's artwork — or, for a job with a before, the before and the after
 * side by side, sewn together down the middle in gold. Beside it the piece's
 * title, "in Southampton" with the seam and the needle, and a button that
 * says what the link opens.
 *
 * Drawn from photos the route fetched (src/app/cards/work/[file]/route.ts)
 * and handed in as data: URIs, so drawing itself reads nothing from the
 * network. When there is no photo to show — a film without a cover, or a
 * photo that would not load — Kristina's artwork takes the label, as on the
 * atelier's cards. When the look changes, change WORK_CARD_DESIGN in
 * lib/workCardVersion.ts.
 */

export interface WorkCardPicture {
  tag: WorkCardTag | null;
  /** A JPEG or PNG as a data: URI, already the size photoSize() gives */
  src: string;
}

const PAD = 52;
const GAP = 46;
const LABEL_HEIGHT = SOCIAL_CARD_SIZE.height - PAD * 2;
/** The label's border round the photos, with its topstitch in it */
const MARGIN = 20;
const PHOTO_HEIGHT = LABEL_HEIGHT - MARGIN * 2;
/** One photo at 3:4, as Kristina's are; two side by side a little narrower */
const SINGLE_WIDTH = Math.round((PHOTO_HEIGHT * 3) / 4);
const PAIR_WIDTH = 270;
/** The strip of label between the two, where they are sewn on */
const PAIR_GAP = 22;
const RADIUS = 12;

/** The size each photo is drawn at, so the route asks Sanity for exactly that */
export function photoSize(count: number): { width: number; height: number } {
  return { width: count === 2 ? PAIR_WIDTH : SINGLE_WIDTH, height: PHOTO_HEIGHT };
}

/**
 * Only what the card's face draws: Latin and Cyrillic letters, digits and
 * everyday punctuation. Anything else in a title — an emoji, a flag, a skin
 * tone, a keycap, another script — the renderer would fetch from a CDN to
 * draw, while the card is being sent.
 */
export function plainTitle(title: string): string {
  return title
    .normalize("NFC")
    .replace(/[^\p{Script=Latin}\p{Script=Cyrillic}0-9 .,:;!?'"‘’“”«»()&+%£€$°·•—–\-…#@*/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The heading's size: a longer title, a smaller face, so it stays within three lines */
function headingSize(title: string, pair: boolean): number {
  const sizes = pair ? [50, 44, 38] : [56, 50, 42];
  return title.length <= 30 ? sizes[0] : title.length <= 56 ? sizes[1] : sizes[2];
}

export function workCard({ title, photos }: { title: string; photos: WorkCardPicture[] }): ImageResponse {
  const font = face();
  const pair = photos.length === 2;
  const shown = photos.length === 1 || pair ? photos : [];
  const labelWidth = MARGIN * 2 + (pair ? PAIR_WIDTH * 2 + PAIR_GAP : SINGLE_WIDTH);
  const words = plainTitle(title);
  const size = headingSize(words, pair);
  const film = shown.some((photo) => photo.tag === "Film");
  const button = pair ? "BEFORE & AFTER" : film ? "WATCH THE FILM" : "SEE THE WORK";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: PAD,
          gap: GAP,
          backgroundImage: `linear-gradient(160deg, ${CLOTH_TOP} 0%, ${CLOTH_BOTTOM} 100%)`,
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: PAIR_GAP,
            flexShrink: 0,
            width: labelWidth,
            height: LABEL_HEIGHT,
            borderRadius: 26,
            backgroundColor: LABEL,
            boxShadow: "0 2px 4px rgba(90, 45, 92, 0.08), 0 14px 34px rgba(90, 45, 92, 0.16)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a picture, not a page */}
          <img
            src={topstitch(labelWidth, LABEL_HEIGHT, 9, 17, 2.5)}
            width={labelWidth}
            height={LABEL_HEIGHT}
            alt=""
            style={{ position: "absolute", top: 0, left: 0 }}
          />
          {shown.length === 0 ? <Artwork /> : shown.map((photo, k) => <Photo key={k} photo={photo} pair={pair} />)}
          {pair && <SewnTogether />}
        </div>

        {/* A width of its own: the renderer wraps words only inside a box it can measure */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: SOCIAL_CARD_SIZE.width - PAD * 2 - GAP - labelWidth,
            height: LABEL_HEIGHT,
          }}
        >
          <div style={{ display: "flex", fontSize: 22, letterSpacing: "0.16em", color: GREY, marginBottom: 22 }}>
            BEAUTASY · MADE &amp; MENDED
          </div>
          <div style={{ display: "flex", fontSize: size, lineHeight: 1.08, color: INK, textWrap: "balance" }}>
            {bindAmpersands(words)}
          </div>
          <Sewn size={size}>in Southampton</Sewn>
          <Button label={button} />
        </div>
      </div>
    ),
    {
      ...SOCIAL_CARD_SIZE,
      ...(font ? { fonts: [{ name: "Geist", data: font, weight: 400 as const, style: "normal" as const }] } : {}),
    },
  );
}

/** Kristina's artwork on the label, when there is no photo to put there */
function Artwork() {
  const art = artwork();
  const width = SINGLE_WIDTH - 30;
  // eslint-disable-next-line @next/next/no-img-element -- drawn into a picture, not a page
  return <img src={art.src} width={width} height={Math.round((width * art.height) / art.width)} alt="" />;
}

/** A photo on the label */
function Photo({ photo, pair }: { photo: WorkCardPicture; pair: boolean }) {
  const { width, height } = photoSize(pair ? 2 : 1);
  return (
    <div style={{ position: "relative", display: "flex", width, height }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a picture, not a page */}
      <img src={photo.src} width={width} height={height} alt="" style={{ borderRadius: RADIUS, objectFit: "cover" }} />
      {photo.tag && <Tag tag={photo.tag} />}
    </div>
  );
}

/** Before and After as the gallery's viewer labels them; a film's cover says it is one */
function Tag({ tag }: { tag: WorkCardTag }) {
  const tone =
    tag === "After"
      ? { backgroundColor: LAVENDER, color: INK }
      : tag === "Before"
        ? { backgroundColor: "rgba(255, 255, 255, 0.94)", color: INK }
        : { backgroundColor: "rgba(31, 27, 36, 0.74)", color: "#FFFFFF" };
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        left: 14,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 15px",
        borderRadius: 999,
        fontSize: 19,
        letterSpacing: "0.14em",
        boxShadow: "0 2px 8px rgba(31, 27, 36, 0.18)",
        ...tone,
      }}
    >
      {tag === "Film" && (
        // eslint-disable-next-line @next/next/no-img-element -- drawn into a picture, not a page
        <img src={svg(`<path d="M2 1.5 12 7 2 12.5Z" fill="#FFFFFF"/>`, "0 0 14 14")} width={14} height={14} alt="" />
      )}
      {tag.toUpperCase()}
    </div>
  );
}

/**
 * Down the strip between the before and the after, the site's own seam — the
 * gold running stitch under every "in Southampton" — turned upright, from its
 * knot at the top: the two sewn onto one label.
 */
const SEAM = { width: 5, stitch: 16, gap: 10 };
function SewnTogether() {
  const height = PHOTO_HEIGHT;
  const left = (PAIR_GAP - SEAM.width) / 2;
  const stitches: string[] = [];
  for (let y = 22; y + SEAM.stitch <= height - 6; y += SEAM.stitch + SEAM.gap) {
    stitches.push(`<rect x="${left}" y="${y}" width="${SEAM.width}" height="${SEAM.stitch}" rx="${SEAM.width / 2}" fill="url(#g)"/>`);
  }
  // Thread with light on it, across the stitch as across the heading's
  const gold =
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#CDA75E"/><stop offset=".55" stop-color="${GOLD}"/><stop offset="1" stop-color="#8E6A32"/>` +
    `</linearGradient></defs>`;
  const knot = `<circle cx="${PAIR_GAP / 2}" cy="10" r="5.5" fill="${GOLD}"/>`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- drawn into a picture, not a page
    <img
      src={svg(gold + knot + stitches.join(""), `0 0 ${PAIR_GAP} ${height}`)}
      width={PAIR_GAP}
      height={height}
      alt=""
      style={{ position: "absolute", top: MARGIN, left: MARGIN + PAIR_WIDTH }}
    />
  );
}

/** What the link opens, as the site's own topstitched lavender button */
function Button({ label }: { label: string }) {
  const height = 62;
  const width = Math.round(label.length * 18.5 + 112);
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "flex-start",
        gap: 12,
        marginTop: 46,
        width,
        height,
        borderRadius: height / 2,
        backgroundColor: LAVENDER,
        border: "1px solid rgba(90, 45, 92, 0.16)",
        boxShadow: "0 6px 16px rgba(90, 45, 92, 0.18)",
        fontSize: 24,
        letterSpacing: "0.08em",
        color: INK,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a picture, not a page */}
      <img
        src={topstitch(width, height, 6, height / 2 - 6, 2)}
        width={width}
        height={height}
        alt=""
        style={{ position: "absolute", top: 0, left: 0 }}
      />
      {label}
      <span style={{ fontSize: 26 }}>→</span>
    </div>
  );
}
