import React from "react";
import { AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BeaArt, GOLD } from "./BeaArt";
import { CREAM, Caption, PLUM, Sewn, ease, sans, serifItalic } from "./BeaReel";
import { AwakeCameo, BOARD, Print } from "./BeaCurtains";

/**
 * "From the shop" — Bea shows Kristina's shop on a phone.
 *
 * The phone shows the live site, shot page by page at iPhone size
 * (scripts/site_shots.mjs): the scrunchie, the sleep mask, the Uzbek ikat
 * pouch. Bea scrolls each one to its name and price while Lily says what the
 * page itself says. The pilot of a series: any product page can be a scene.
 */

export const S = {
  voice: 24,
  phone: 100,
  kristina: 445,
  end: 568,
  total: 715,
};

const LINES: [number, number, string][] = [
  [0.99, 2.58, "Come and see Kristina's shop."],
  [2.86, 6.47, "Mulberry silk scrunchies, with a full metre of silk in every one."],
  [6.79, 8.81, "A silk sleep mask, to match."],
  [9.25, 11.94, "And a quilted pouch in real Uzbek ikat,"],
  [12.09, 13.76, "made from hand-loomed fabric."],
  [14.2, 17.98, "Every piece is made by hand, right here in Southampton."],
];
const at = (seconds: number) => S.voice + Math.round(seconds * 30);
const captionEnd = (i: number, end: number) =>
  i + 1 < LINES.length ? Math.min(at(end) + 4, at(LINES[i + 1][0]) - 10) : at(end) + 4;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** The phone: 390 css px of site drawn 520 px wide, so one css px is 4/3 of a frame pixel. */
const SCREEN = { w: 520, h: 1125, left: 264, top: 190, bezel: 16 };
const CSS = SCREEN.w / 390;

type Page = { src: string; from: number; to: number; scroll: [number, number][] /* [frame, css px] */ };

/** Frames here are the phone scene's own, counted from when it is sewn on. */
const PAGES: Page[] = [
  { src: "bea/shop-scrunchie.jpg", from: 0, to: 136, scroll: [[18, 0], [80, 420]] },
  { src: "bea/shop-mask.jpg", from: 122, to: 210, scroll: [[136, 0], [184, 420]] },
  { src: "bea/shop-pouch.jpg", from: 196, to: 480, scroll: [[212, 0], [262, 330], [282, 330], [330, 600]] },
];

const scrollAt = (page: Page, f: number) => {
  const xs = page.scroll.map(([x]) => x);
  const ys = page.scroll.map(([, y]) => y);
  return interpolate(f, xs, ys, { ...clamp, easing: Easing.inOut(Easing.cubic) });
};

const Phone: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: BOARD }}>
      <div
        style={{
          position: "absolute",
          left: SCREEN.left - SCREEN.bezel,
          top: SCREEN.top - SCREEN.bezel,
          width: SCREEN.w + SCREEN.bezel * 2,
          height: SCREEN.h + SCREEN.bezel * 2,
          borderRadius: 78,
          background: "#2A2128",
          boxShadow: "0 40px 90px rgba(60,30,55,0.35), inset 0 0 0 2px #4A3D47",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: SCREEN.left,
          top: SCREEN.top,
          width: SCREEN.w,
          height: SCREEN.h,
          borderRadius: 62,
          overflow: "hidden",
          background: "#FCFAF7",
        }}
      >
        {PAGES.map((page, i) => {
          if (f < page.from || f > page.to) return null;
          // A new page slides in from the right, as a tap on a product does
          const enter = i === 0 ? 1 : interpolate(f, [page.from, page.from + 12], [0, 1], { ...clamp, easing: ease });
          // …and the page before it slides out to the left at the same time
          const next = PAGES[i + 1];
          const exit = next ? interpolate(f, [next.from, next.from + 12], [0, 1], { ...clamp, easing: ease }) : 0;
          const x = (1 - enter - exit) * SCREEN.w;
          return (
            <Img
              key={page.src}
              src={staticFile(page.src)}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: SCREEN.w,
                transform: `translate(${x}px, ${-scrollAt(page, f) * CSS}px)`,
              }}
            />
          );
        })}
        {/* the notch, drawn over the site's own announcement bar */}
        <div style={{ position: "absolute", left: SCREEN.w / 2 - 70, top: 12, width: 140, height: 36, borderRadius: 18, background: "#2A2128" }} />
      </div>
    </AbsoluteFill>
  );
};

/** The price, pinned beside the phone as Lily names the piece. */
const Tag: React.FC<{ text: string; from: number; to: number; top: number }> = ({ text, from, to, top }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > to) return null;
  const k = Math.min(
    interpolate(frame, [from, from + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.8)) }),
    interpolate(frame, [to - 8, to], [1, 0], clamp),
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 760,
        top,
        transform: `rotate(4deg) scale(${0.7 + 0.3 * k})`,
        opacity: k,
        fontFamily: sans,
        fontWeight: 600,
        fontSize: 40,
        color: CREAM,
        background: PLUM,
        padding: "14px 30px",
        borderRadius: 999,
        boxShadow: "0 14px 34px rgba(60,30,60,0.3)",
        border: `3px solid ${GOLD}`,
      }}
    >
      {text}
    </div>
  );
};

export const BeaShop: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const hook = interpolate(frame, [0, 8], [0.35, 1], { ...clamp, easing: ease });
  const endIn = interpolate(frame, [S.end, S.end + 14], [0, 1], clamp);
  const endSheen = interpolate(frame, [S.end + 20, S.end + 52], [0, 1], clamp);
  const line = (f0: number) => interpolate(frame, [f0, f0 + 12], [0, 1], { ...clamp, easing: ease });
  const voiceEnd = at(21.92);
  const music = (f: number) => {
    const fadeIn = interpolate(f, [0, 10], [0, 1], { extrapolateRight: "clamp" });
    const fadeOut = interpolate(f, [S.total - 36, S.total - 2], [1, 0], clamp);
    return (f >= S.voice - 4 && f <= voiceEnd + 6 ? 0.13 : 0.3) * fadeIn * fadeOut;
  };
  const p = S.phone;

  return (
    <AbsoluteFill style={{ background: CREAM }}>
      <Audio src={staticFile("bea/music.mp3")} volume={music} />
      {/* Bea's take opens with "Morning!", which is cut so a film can go out at any hour */}
      <Sequence from={S.voice + 25} layout="none">
        <Audio src={staticFile("bea/voice-shop.mp3")} trimBefore={25} />
      </Sequence>

      {/* 1 — Bea wakes up */}
      {frame < S.phone + 22 && (
        <AbsoluteFill>
          <OffthreadVideo src={staticFile("bea/wake.mp4")} muted trimBefore={18} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 300,
              textAlign: "center",
              fontFamily: serifItalic,
              fontSize: 92,
              color: PLUM,
              opacity: hook,
              transform: `translateY(${(1 - hook) * 18}px)`,
            }}
          >
            Gifts, made by hand
          </div>
          <Caption text={LINES[0][2]} from={at(LINES[0][0])} to={captionEnd(0, LINES[0][1])} top={1440} />
        </AbsoluteFill>
      )}

      {/* 2 — the shop on a phone */}
      <Sewn at={S.phone}>
        <Phone />
      </Sewn>

      {/* 3 — the hands that made them */}
      <Sewn at={S.kristina}>
        <Print src="bea/kristina-scrunchies.jpg" label="Made by Kristina" tilt={-1.2} zoomTo={1.08} origin="45% 40%" frames={120} />
      </Sewn>

      {frame >= S.phone && frame < S.end && (
        <>
          <Tag text="from £12" from={p + 50} to={p + 120} top={760} />
          <Tag text="£25" from={p + 160} to={p + 196} top={760} />
          <Tag text="£22" from={p + 240} to={p + 342} top={760} />
          {LINES.slice(1).map(([a, b, text], i) => (
            <Caption key={text} text={text} from={at(a)} to={captionEnd(i + 1, b)} top={1390} />
          ))}
          <AwakeCameo from={S.phone + 10} to={S.end + 4} />
        </>
      )}

      {/* 4 — the logo, and where to find them */}
      <Sewn at={S.end}>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 38%, #FFFEFB 0%, ${CREAM} 55%, #F4ECE6 100%)` }}>
          <div style={{ position: "absolute", left: 90, top: 330, width: 900, height: 770, opacity: endIn }}>
            <BeaArt id="end" wash={1} girl={1.15} wreath={1.15} gold={1.15} time={t} alive={1} sheen={endSheen} needle={false} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 1150, textAlign: "center", color: PLUM }}>
            <div style={{ fontFamily: serifItalic, fontSize: 78, opacity: line(S.end + 8), transform: `translateY(${(1 - line(S.end + 8)) * 14}px)` }}>
              Made by hand.
            </div>
            <div
              style={{
                marginTop: 18,
                fontFamily: sans,
                fontWeight: 500,
                fontSize: 32,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                opacity: line(S.end + 24),
              }}
            >
              Gifts &amp; accessories · Southampton
            </div>
            <div style={{ marginTop: 26, fontFamily: sans, fontWeight: 600, fontSize: 44, color: GOLD, opacity: line(at(18.9)) }}>
              beautasy.co.uk
            </div>
          </div>
        </AbsoluteFill>
      </Sewn>
    </AbsoluteFill>
  );
};
