import { ImageResponse } from "next/og";
import { SOCIAL_CARD_ALT, SOCIAL_CARD_SIZE } from "@/lib/socialCard";

/**
 * The picture every forwarded link shows.
 *
 * Until now og:image pointed at /beautasy-icon.png, which is 1378x1179 — very
 * nearly a square. WhatsApp, Facebook, Telegram and iMessage all crop a link
 * card to roughly 1.91:1, so the icon arrived with its top and bottom sliced
 * off and the brand name cut in half. Every shared link looked worse than the
 * site it pointed at, and the shop is shared far more often than it is found.
 *
 * 1200x630 is the size those crops are cut from, so the card below is what the
 * recipient actually sees — nothing is trimmed.
 *
 * Next builds this once at build time and serves it as a static PNG, so no
 * visitor waits for it to render.
 */

/**
 * Next reads these three named exports to write the og:image tags for the root
 * layout. The alt and the size live in src/lib/socialCard.ts because the pages
 * that have to name this card themselves need the same two values, and a page
 * declaring a size the renderer does not draw is how the old markup came to
 * call a 1378x1179 icon a 1200x630 card.
 */
export const alt = SOCIAL_CARD_ALT;
export const size = SOCIAL_CARD_SIZE;
export const contentType = "image/png";

/**
 * There is deliberately no twitter-image.tsx beside this file.
 *
 * When the metadata export leaves `twitter.images` unset, Next copies the
 * Open Graph images onto the Twitter card for us, and the Open Graph images
 * come from this file by convention. A second file would be the same picture
 * rendered a second time on every build, and a second place to forget.
 */

/**
 * Typography, and why this does not use the site's fonts.
 *
 * The site sets Playfair Display and Inter through next/font, which works by
 * emitting CSS custom properties. The image renderer never sees CSS: it lays
 * out the tree itself and needs the actual font binary handed to it. Neither
 * face exists as a file in this repository — both are fetched from Google
 * Fonts by the browser — so using them here would mean downloading a font over
 * the network every time this image renders, which is a build step that can
 * fail for a reason that has nothing to do with us.
 *
 * So this passes no `fonts` option at all and takes the face that ships inside
 * Next for exactly this purpose, read from disk. One weight, one family: the
 * composition carries the brand instead, through wide letter-spacing, a lot of
 * empty cream and the lavender hairline — which is how the site's own headers
 * read anyway.
 *
 * Colours are the brand tokens from globals.css, copied as literals because
 * that file is CSS the renderer cannot read either.
 */

/**
 * One way is left for this card to reach the network, and it is worth naming,
 * because the brand voice runs on emoji.
 *
 * satori draws a glyph the font has no room for by downloading a picture of
 * it. Putting a single 💜 in the text below makes the render fetch
 * cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f49c.svg — at build
 * time, from Vercel's builder. Plain Latin, an em dash and Cyrillic all draw
 * from the bundled font and ask for nothing.
 *
 * This cannot be switched off from here: next/og assembles satori's options
 * itself and hardwires `loadAdditionalAsset`, so `ImageResponse` has no knob
 * for it. The guard is in socialPreview.test.ts instead — it wraps fetch for
 * the whole test file and fails on the first request to a real URL, which is
 * the only way to see one, because @vercel/og caches a downloaded asset for
 * the life of the process. The words on this card stay plain Latin; the emoji
 * belong in the captions, not here.
 */
const CREAM = "#FDFBF7";
const LAVENDER_BG = "#F5F0FF";
const LAVENDER = "#DCD0FF";
const LAVENDER_SOFT = "#E6E6FA";
const CHARCOAL = "#4A4A4A";
const CHARCOAL_LIGHT = "#6B6B6B";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          // The two small spaced-caps lines sit at the edges and bracket the
          // name, which centres the weight of the card. Centring all four as
          // one stack left the lower half empty and the last two lines
          // crowding each other.
          justifyContent: "space-between",
          paddingTop: 92,
          paddingBottom: 92,
          backgroundColor: CREAM,
          backgroundImage: `linear-gradient(155deg, ${CREAM} 0%, ${CREAM} 55%, ${LAVENDER_BG} 100%)`,
        }}
      >
        {/* A hairline frame set in from the edge. It survives the crop that
            messaging apps apply and reads as a printed card rather than a
            screenshot. */}
        <div
          style={{
            position: "absolute",
            top: 34,
            right: 34,
            bottom: 34,
            left: 34,
            border: `1px solid ${LAVENDER_SOFT}`,
          }}
        />

        <div
          style={{
            display: "flex",
            fontSize: 18,
            letterSpacing: "0.28em",
            paddingLeft: "0.28em",
            color: CHARCOAL_LIGHT,
          }}
        >
          SOUTHAMPTON, UK
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* The letter-spacing hangs off the final S, which would push the
              word left of centre; the matching padding puts it back. */}
          <div
            style={{
              fontSize: 118,
              letterSpacing: "0.3em",
              paddingLeft: "0.3em",
              color: CHARCOAL,
              lineHeight: 1,
            }}
          >
            BEAUTASY
          </div>

          <div
            style={{
              width: 88,
              height: 1,
              marginTop: 42,
              marginBottom: 42,
              backgroundColor: LAVENDER,
            }}
          />

          <div
            style={{
              fontSize: 36,
              letterSpacing: "0.04em",
              color: CHARCOAL,
            }}
          >
            Handmade lingerie &amp; accessories
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 19,
            letterSpacing: "0.3em",
            paddingLeft: "0.3em",
            color: CHARCOAL_LIGHT,
          }}
        >
          MADE TO FEEL, NOT JUST WEAR
        </div>
      </div>
    ),
    { ...size },
  );
}
