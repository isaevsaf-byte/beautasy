import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BeaArt, GOLD } from "../BeaArt";
import { CREAM, PLUM, ease, sans, serifItalic } from "../BeaReel";
import { BOARD } from "../BeaCurtains";

/**
 * The pieces every episode is built from, taken from the four pilots and made
 * to take their timings as frames from the Episode composition.
 */

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Where the photo sits inside a print laid straight (tilt 0): the card's inner box */
export const BOX = { left: 126, top: 246, w: 828, h: 1115 };

export const Chip: React.FC<{ text: string; x: number; y: number; k: number; dark?: boolean }> = ({ text, x, y, k, dark }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `translate(-50%, -50%) scale(${0.7 + 0.3 * k})`,
      opacity: k,
      fontFamily: sans,
      fontWeight: 600,
      fontSize: 30,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      color: dark ? CREAM : PLUM,
      background: dark ? PLUM : "rgba(253,251,247,0.95)",
      border: `2px solid ${GOLD}`,
      padding: "10px 20px",
      borderRadius: 999,
      boxShadow: "0 10px 28px rgba(60,30,60,0.25)",
    }}
  >
    {text}
  </div>
);

/** In and out over a window, popping in */
export const popIn = (frame: number, from: number, to: number) =>
  Math.min(
    interpolate(frame, [from, from + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) }),
    interpolate(frame, [to - 8, to], [1, 0], clamp),
  );

/** The price, pinned beside the phone */
export const Tag: React.FC<{ text: string; k: number; top: number }> = ({ text, k, top }) => (
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
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

/** A gold tape measure unrolling down a print */
export const Tape: React.FC<{
  x: number;
  top: number;
  bottom: number;
  grow: number;
  topLabel?: string;
  bottomLabel?: string;
  topK: number;
  bottomK: number;
}> = ({ x, top, bottom, grow, topLabel, bottomLabel, topK, bottomK }) => {
  const px = BOX.left + BOX.w * x;
  const y0 = BOX.top + BOX.h * top;
  const y1 = BOX.top + BOX.h * bottom;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: px - 17,
          top: y0,
          width: 34,
          height: (y1 - y0) * grow,
          background: `repeating-linear-gradient(to bottom, ${PLUM} 0 3px, transparent 3px 22px), linear-gradient(90deg, #E9D18F, #F6E7B8 45%, #D9B36F)`,
          backgroundSize: "14px 100%, 100% 100%",
          backgroundRepeat: "no-repeat, no-repeat",
          border: `2px solid ${GOLD}`,
          borderRadius: 4,
          boxShadow: "0 8px 20px rgba(60,40,20,0.3)",
        }}
      />
      {topLabel && <Chip text={topLabel} x={px - 190} y={y0 + 50} k={topK} />}
      {bottomLabel && <Chip text={bottomLabel} x={px} y={y1 + 34} k={bottomK} dark />}
    </>
  );
};

/** A dashed gold line across a print, with a label above it */
export const Rule: React.FC<{ y: number; draw: number; label?: string; labelK: number }> = ({ y, draw, label, labelK }) => {
  const py = BOX.top + BOX.h * y;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: BOX.left,
          top: py,
          width: BOX.w * draw,
          height: 4,
          backgroundImage: `repeating-linear-gradient(90deg, ${GOLD} 0 16px, transparent 16px 26px)`,
          boxShadow: "0 0 14px rgba(233,209,143,0.8)",
        }}
      />
      {label && <Chip text={label} x={BOX.left + BOX.w / 2} y={py - 70} k={labelK} dark />}
    </>
  );
};

const PinMark: React.FC<{ left: number; top: number }> = ({ left, top }) => (
  <svg width={70} height={90} viewBox="0 0 70 90" style={{ position: "absolute", left, top, overflow: "visible" }}>
    <line x1={35} y1={30} x2={44} y2={86} stroke="#9A9A9A" strokeWidth={3} strokeLinecap="round" />
    <circle cx={35} cy={28} r={17} fill={PLUM} />
    <circle cx={29} cy={22} r={5} fill="#FFFFFF" opacity={0.55} />
  </svg>
);

/** A question written on a card and pinned to the board; words appear from `reveal` (frames into the scene) */
export const QuestionCard: React.FC<{ eyebrow: string; text: string; reveal: number }> = ({ eyebrow, text, reveal }) => {
  const f = useCurrentFrame();
  const k = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
  const words = text.split(" ");
  const size = text.length > 44 ? 84 : 104;
  return (
    <AbsoluteFill style={{ background: BOARD }}>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 470,
          width: 860,
          height: 760,
          background: "#FFFFFF",
          boxShadow: "0 30px 70px rgba(70,40,60,0.25)",
          transform: `rotate(-1.5deg) scale(${0.92 + 0.08 * k})`,
          opacity: k,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 34,
          padding: "0 70px",
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 30, letterSpacing: "0.22em", textTransform: "uppercase", color: GOLD }}>
          {eyebrow}
        </div>
        <div style={{ fontFamily: serifItalic, fontSize: size, lineHeight: 1.12, color: PLUM, textWrap: "balance" }}>
          {words.map((w, i) => (
            <span key={i} style={{ opacity: interpolate(f, [reveal + i * 5, reveal + i * 5 + 8], [0, 1], clamp) }}>
              {w}{" "}
            </span>
          ))}
        </div>
        <PinMark left={395} top={-40} />
      </div>
    </AbsoluteFill>
  );
};

/** The phone, showing the live site. Page frames are counted from the scene's start. */
export type PhonePage = { src: string; from: number; to: number; enter: boolean; exitAt?: number; scroll: [number, number][] };

const SCREEN = { w: 520, h: 1125, left: 264, top: 190, bezel: 16 };
const CSS = SCREEN.w / 390;

export const Phone: React.FC<{ pages: PhonePage[] }> = ({ pages }) => {
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
        {pages.map((page) => {
          if (f < page.from || f > page.to) return null;
          const enter = page.enter ? interpolate(f, [page.from, page.from + 12], [0, 1], { ...clamp, easing: ease }) : 1;
          const exit = page.exitAt !== undefined ? interpolate(f, [page.exitAt, page.exitAt + 12], [0, 1], { ...clamp, easing: ease }) : 0;
          const xs = page.scroll.map(([x]) => x);
          const ys = page.scroll.map(([, y]) => y);
          const scroll = xs.length > 1 ? interpolate(f, xs, ys, { ...clamp, easing: Easing.inOut(Easing.cubic) }) : ys[0] ?? 0;
          return (
            <Img
              key={page.src + page.from}
              src={staticFile(page.src)}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: SCREEN.w,
                transform: `translate(${(1 - enter - exit) * SCREEN.w}px, ${-scroll * CSS}px)`,
              }}
            />
          );
        })}
        <div style={{ position: "absolute", left: SCREEN.w / 2 - 70, top: 12, width: 140, height: 36, borderRadius: 18, background: "#2A2128" }} />
      </div>
    </AbsoluteFill>
  );
};

/** The logo settled, with up to four lines under it; line frames are counted from the scene's start */
export const EndCard: React.FC<{
  lead?: string;
  title: string;
  subtitle?: string;
  url?: string;
  at: { lead: number; title: number; subtitle: number; url: number };
  time: number;
}> = ({ lead, title, subtitle, url, at, time }) => {
  const f = useCurrentFrame();
  const show = (f0: number) => interpolate(f, [f0, f0 + 12], [0, 1], { ...clamp, easing: ease });
  const endIn = interpolate(f, [0, 14], [0, 1], clamp);
  const sheen = interpolate(f, [20, 52], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 38%, #FFFEFB 0%, ${CREAM} 55%, #F4ECE6 100%)` }}>
      <div style={{ position: "absolute", left: 90, top: 330, width: 900, height: 770, opacity: endIn }}>
        <BeaArt id="end" wash={1} girl={1.15} wreath={1.15} gold={1.15} time={time} alive={1} sheen={sheen} needle={false} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1140, textAlign: "center", color: PLUM }}>
        {lead && <div style={{ fontFamily: serifItalic, fontSize: 60, opacity: show(at.lead) }}>{lead}</div>}
        <div style={{ fontFamily: serifItalic, fontSize: lead ? 88 : 78, opacity: show(at.title), transform: `translateY(${(1 - show(at.title)) * 14}px)` }}>
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              marginTop: 18,
              fontFamily: sans,
              fontWeight: 500,
              fontSize: 32,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              opacity: show(at.subtitle),
            }}
          >
            {subtitle}
          </div>
        )}
        {url && <div style={{ marginTop: 24, fontFamily: sans, fontWeight: 600, fontSize: 42, color: GOLD, opacity: show(at.url) }}>{url}</div>}
      </div>
    </AbsoluteFill>
  );
};

/** A photo on a print card, pinned; used by the guess and the split */
const Card: React.FC<{
  src: string;
  label?: string;
  left: number;
  top: number;
  w: number;
  h: number;
  tilt: number;
  scale?: number;
  origin?: string;
  labelK: number;
  enter?: number;
  /** The label along the bottom edge, clear of Bea's brooch in the top corner */
  labelBottom?: boolean;
}> = ({ src, label, left, top, w, h, tilt, scale = 1, origin = "50% 50%", labelK, enter = 1, labelBottom }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: w,
      height: h,
      padding: 14,
      background: "#FFFFFF",
      boxShadow: "0 28px 64px rgba(70,40,60,0.27), 0 4px 12px rgba(70,40,60,0.12)",
      transform: `translateY(${(1 - enter) * 60}px) rotate(${tilt}deg)`,
      opacity: enter,
    }}
  >
    <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})`, transformOrigin: origin }} />
      {label && (
        <div style={{ position: "absolute", left: 0, right: 0, ...(labelBottom ? { bottom: 20 } : { top: 20 }), display: "flex", justifyContent: "center", opacity: labelK }}>
          <div
            style={{
              fontFamily: sans,
              fontWeight: 500,
              fontSize: 30,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: PLUM,
              background: "rgba(253,251,247,0.94)",
              padding: "12px 24px",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
        </div>
      )}
    </div>
    <PinMark left={w / 2 - 35} top={-40} />
  </div>
);

/**
 * Guess the price. Frames are counted from the scene's start: the countdown
 * runs from `countFrom` to `answerAt`, then the tag turns over to the answer
 * with a burst of gold stitches.
 */
export const GuessCard: React.FC<{
  src: string;
  label?: string;
  zoomTo: number;
  origin: string;
  ask?: string;
  answer: string;
  note?: string;
  countFrom: number;
  answerAt: number;
  count: number;
  frames: number;
}> = ({ src, label, zoomTo, origin, ask, answer, note, countFrom, answerAt, count, frames }) => {
  const f = useCurrentFrame();
  const zoom = interpolate(f, [0, Math.min(frames, answerAt)], [1, zoomTo], { ...clamp, easing: Easing.inOut(Easing.quad) });

  // The tag swings on its string, turns edge-on just before the answer and comes back showing it
  const turn = interpolate(f, [answerAt - 6, answerAt, answerAt + 10], [0, 90, 0], clamp);
  const shown = f >= answerAt;
  const pop = shown ? interpolate(f, [answerAt, answerAt + 6, answerAt + 16], [1, 1.18, 1], clamp) : 1;
  const swing = (shown ? 2.5 : 5) * Math.sin(f / 9) * interpolate(f, [answerAt, answerAt + 30], [1, 0.4], clamp);
  const tagIn = interpolate(f, [8, 22], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.5)) });
  const wobble = shown ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(f / 6));

  // Countdown: a gold ring running down, one number per beat
  const span = Math.max(1, answerAt - countFrom);
  const ringK = Math.min(
    interpolate(f, [countFrom - 6, countFrom + 6], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) }),
    interpolate(f, [answerAt - 4, answerAt + 4], [1, 0], clamp),
  );
  const left = interpolate(f, [countFrom, answerAt], [1, 0], clamp);
  const beat = Math.min(count - 1, Math.max(0, Math.floor(((f - countFrom) / span) * count)));
  const beatStart = countFrom + (beat * span) / count;
  const numberPop = interpolate(f, [beatStart, beatStart + 7], [1.35, 1], { ...clamp, easing: ease });
  const R = 108;
  const C = 2 * Math.PI * R;

  const burst = interpolate(f, [answerAt, answerAt + 22], [0, 1], { ...clamp, easing: ease });
  const noteK = interpolate(f, [answerAt + 14, answerAt + 26], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.5)) });
  const TAG = { x: 340, y: 1010 };

  return (
    <AbsoluteFill style={{ background: BOARD }}>
      <Card src={src} label={label} left={150} top={170} w={780} h={1000} tilt={-1.2} scale={zoom} origin={origin} labelK={interpolate(f, [10, 20], [0, 1], clamp)} />

      {/* Gold stitches flying out of the tag as it turns */}
      {burst > 0 && burst < 1 &&
        Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2;
          const r0 = 120 + 260 * burst;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: TAG.x + Math.cos(a) * r0 - 22,
                top: TAG.y + Math.sin(a) * r0 * 0.8 - 3,
                width: 44,
                height: 6,
                borderRadius: 3,
                background: GOLD,
                transform: `rotate(${a}rad)`,
                opacity: 1 - burst,
                boxShadow: "0 0 12px rgba(233,209,143,0.9)",
              }}
            />
          );
        })}

      {/* The swing tag */}
      <div
        style={{
          position: "absolute",
          left: TAG.x,
          top: TAG.y,
          transform: `translate(-50%, -50%) rotate(${-6 + swing}deg) rotateY(${turn}deg) scale(${tagIn * pop})`,
          transformOrigin: "50% 0%",
          opacity: tagIn,
        }}
      >
        <div
          style={{
            position: "relative",
            minWidth: 300,
            padding: "40px 46px 30px",
            background: PLUM,
            border: `4px solid ${GOLD}`,
            borderRadius: "26px 26px 26px 26px",
            boxShadow: "0 22px 50px rgba(60,30,60,0.38)",
            textAlign: "center",
            color: CREAM,
            fontFamily: serifItalic,
            fontSize: shown ? 92 : 110,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ position: "absolute", left: "50%", top: 12, width: 20, height: 20, marginLeft: -10, borderRadius: "50%", background: CREAM, border: `3px solid ${GOLD}` }} />
          {shown ? answer : <span>£ <span style={{ opacity: wobble }}>?</span></span>}
        </div>
      </div>

      {/* Countdown */}
      {ringK > 0 && (
        <div style={{ position: "absolute", left: 540 - 130, top: 1290 - 130, width: 260, height: 260, transform: `scale(${ringK})`, opacity: ringK }}>
          <svg width={260} height={260} viewBox="0 0 260 260" style={{ position: "absolute", inset: 0 }}>
            <circle cx={130} cy={130} r={R + 14} fill="rgba(253,251,247,0.96)" />
            <circle cx={130} cy={130} r={R} fill="none" stroke="rgba(233,209,143,0.3)" strokeWidth={14} />
            <circle
              cx={130}
              cy={130}
              r={R}
              fill="none"
              stroke={GOLD}
              strokeWidth={14}
              strokeLinecap="round"
              strokeDasharray={`${C * left} ${C}`}
              transform="rotate(-90 130 130)"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: serifItalic,
              fontSize: 140,
              color: PLUM,
              transform: `scale(${numberPop})`,
            }}
          >
            {count - beat}
          </div>
        </div>
      )}
      {ask && ringK > 0 && <Chip text={ask} x={540} y={1490} k={ringK} dark />}
      {note && noteK > 0 && <Chip text={note} x={540} y={1290} k={noteK} />}
    </AbsoluteFill>
  );
};

/** Before and after, side by side; frames from the scene's start */
export const SplitPrints: React.FC<{ before: string; after: string; beforeLabel: string; afterLabel: string; afterFrom: number }> = ({
  before,
  after,
  beforeLabel,
  afterLabel,
  afterFrom,
}) => {
  const f = useCurrentFrame();
  const afterIn = interpolate(f, [afterFrom, afterFrom + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.3)) });
  return (
    <AbsoluteFill style={{ background: BOARD }}>
      <Card src={before} label={beforeLabel} left={55} top={250} w={470} h={940} tilt={-1.5} labelK={interpolate(f, [8, 18], [0, 1], clamp)} labelBottom />
      <Card src={after} label={afterLabel} left={555} top={250} w={470} h={940} tilt={1.5} labelK={interpolate(f, [afterFrom + 8, afterFrom + 18], [0, 1], clamp)} enter={afterIn} labelBottom />
    </AbsoluteFill>
  );
};
