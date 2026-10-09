import React from "react";
import { AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BeaArt, GOLD } from "./BeaArt";
import { CREAM, Caption, PLUM, Sewn, ease, sans, serifItalic } from "./BeaReel";
import { AwakeCameo, BOARD, Print } from "./BeaCurtains";

/**
 * "Ask Kristina" — a client's question, Kristina's answer, Bea reading it out.
 *
 * The answer is the curtains page's own FAQ, word for word ("How do I measure
 * my curtains?"), so Bea says nothing the site does not. The photos are the
 * published curtain job; the tape measure and the floor line are drawn over
 * them, the photos themselves are untouched.
 */

export const Q = {
  voice: 24,
  question: 104,
  tape: 178,
  floor: 330,
  price: 470,
  end: 590,
  total: 715,
};

const LINES: [number, number, string][] = [
  [0.0, 2.82, "Morning! Here's this week's question for Kristina."],
  [3.42, 5.04, "How do I measure my curtains?"],
  [5.36, 8.21, "Kristina says: measure from the top of the pole,"],
  [8.45, 10.04, "down to where you want the hem."],
  [10.48, 13.05, "Floor length, or one centimetre above,"],
  [13.2, 14.65, "so they clear the carpet."],
  [15.09, 18.58, "Email her the numbers, and get a price before you bring them in."],
];
const at = (seconds: number) => Q.voice + Math.round(seconds * 30);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const CAPTIONS = LINES.map(([a, b, text], i) => ({
  text,
  from: at(a),
  to: i + 1 < LINES.length ? Math.min(at(b) + 4, at(LINES[i + 1][0]) - 10) : at(b) + 4,
}));

/** Where the photo sits inside a print laid straight (tilt 0): the card's inner box. */
const BOX = { left: 126, top: 246, w: 828, h: 1115 };

const Chip: React.FC<{ text: string; x: number; y: number; k: number; dark?: boolean }> = ({ text, x, y, k, dark }) => (
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

/** The question, written on a card and pinned to the board. */
const QuestionCard: React.FC = () => {
  const f = useCurrentFrame();
  const k = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
  const words = "How do I measure my curtains?".split(" ");
  const start = at(3.42) - Q.question;
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
          Ask Kristina
        </div>
        <div style={{ fontFamily: serifItalic, fontSize: 104, lineHeight: 1.12, color: PLUM, textWrap: "balance" }}>
          {words.map((w, i) => {
            const show = interpolate(f, [start + i * 6, start + i * 6 + 8], [0, 1], clamp);
            return (
              <span key={i} style={{ opacity: show }}>
                {w}{" "}
              </span>
            );
          })}
        </div>
        <svg width={70} height={90} viewBox="0 0 70 90" style={{ position: "absolute", left: 395, top: -40, overflow: "visible" }}>
          <line x1={35} y1={30} x2={44} y2={86} stroke="#9A9A9A" strokeWidth={3} strokeLinecap="round" />
          <circle cx={35} cy={28} r={17} fill={PLUM} />
          <circle cx={29} cy={22} r={5} fill="#FFFFFF" opacity={0.55} />
        </svg>
      </div>
    </AbsoluteFill>
  );
};

/** A gold tape measure unrolls from the top of the pole to the hem as Lily says it. */
const TapeOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < Q.tape || frame >= Q.floor) return null;
  const x = BOX.left + BOX.w * 0.66;
  const top = BOX.top + BOX.h * 0.07;
  const hem = BOX.top + BOX.h * 0.885;
  const grow = interpolate(frame, [at(7.1), at(9.6)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const len = (hem - top) * grow;
  const topChip = interpolate(frame, [at(7.1), at(7.1) + 10], [0, 1], clamp);
  const hemChip = interpolate(frame, [at(9.5), at(9.5) + 10], [0, 1], clamp);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x - 17,
          top,
          width: 34,
          height: len,
          background: `repeating-linear-gradient(to bottom, ${PLUM} 0 3px, transparent 3px 22px), linear-gradient(90deg, #E9D18F, #F6E7B8 45%, #D9B36F)`,
          backgroundSize: "14px 100%, 100% 100%",
          backgroundRepeat: "no-repeat, no-repeat",
          border: `2px solid ${GOLD}`,
          borderRadius: 4,
          boxShadow: "0 8px 20px rgba(60,40,20,0.3)",
        }}
      />
      <Chip text="Top of the pole" x={x - 190} y={top + 50} k={topChip} />
      <Chip text="Hem" x={x} y={hem + 34} k={hemChip} dark />
    </>
  );
};

/** On the hem that just clears the floor: a gold line at the floor and the 1 cm between. */
const FloorOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < Q.floor || frame >= Q.price) return null;
  const floorY = BOX.top + BOX.h * 0.94;
  const line = interpolate(frame, [at(10.5), at(11.4)], [0, 1], { ...clamp, easing: ease });
  const chip = interpolate(frame, [at(11.5), at(11.5) + 10], [0, 1], clamp);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: BOX.left,
          top: floorY,
          width: BOX.w * line,
          height: 4,
          backgroundImage: `repeating-linear-gradient(90deg, ${GOLD} 0 16px, transparent 16px 26px)`,
          boxShadow: "0 0 14px rgba(233,209,143,0.8)",
        }}
      />
      <Chip text="1 cm above the floor" x={BOX.left + BOX.w / 2} y={floorY - 70} k={chip} dark />
    </>
  );
};

const PriceOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < Q.price || frame >= Q.end + 4) return null;
  const a = interpolate(frame, [at(15.2), at(15.2) + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  const b = interpolate(frame, [at(17.0), at(17.0) + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  return (
    <>
      <Chip text="Email the numbers" x={540} y={1060} k={a} />
      <Chip text="Curtain hems from £20 a panel" x={540} y={1150} k={b} dark />
    </>
  );
};

export const BeaAsk: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const endIn = interpolate(frame, [Q.end, Q.end + 14], [0, 1], clamp);
  const endSheen = interpolate(frame, [Q.end + 20, Q.end + 52], [0, 1], clamp);
  const line = (f0: number) => interpolate(frame, [f0, f0 + 12], [0, 1], { ...clamp, easing: ease });
  const hook = interpolate(frame, [0, 8], [0.35, 1], { ...clamp, easing: ease });
  const voiceEnd = at(21.69);
  const music = (f: number) => {
    const fadeIn = interpolate(f, [0, 10], [0, 1], { extrapolateRight: "clamp" });
    const fadeOut = interpolate(f, [Q.total - 36, Q.total - 2], [1, 0], clamp);
    return (f >= Q.voice - 4 && f <= voiceEnd + 6 ? 0.13 : 0.3) * fadeIn * fadeOut;
  };

  return (
    <AbsoluteFill style={{ background: CREAM }}>
      <Audio src={staticFile("bea/music.mp3")} volume={music} />
      <Sequence from={Q.voice} layout="none">
        <Audio src={staticFile("bea/voice-ask-curtains.mp3")} />
      </Sequence>

      {/* 1 — Bea wakes up */}
      {frame < Q.question + 22 && (
        <AbsoluteFill>
          <OffthreadVideo src={staticFile("bea/wake.mp4")} muted trimBefore={12} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 300,
              textAlign: "center",
              fontFamily: serifItalic,
              fontSize: 96,
              color: PLUM,
              opacity: hook,
              transform: `translateY(${(1 - hook) * 18}px)`,
            }}
          >
            Ask Kristina
          </div>
          <Caption text={CAPTIONS[0].text} from={CAPTIONS[0].from} to={CAPTIONS[0].to} top={1440} />
        </AbsoluteFill>
      )}

      {/* 2 — the question */}
      <Sewn at={Q.question}>
        <QuestionCard />
      </Sewn>

      {/* 3 — top of the pole to the hem */}
      <Sewn at={Q.tape}>
        <Print src="bea/curtain-after.jpg" label="Kristina says" tilt={0} zoomTo={1} frames={1} />
      </Sewn>

      {/* 4 — floor length, or 1 cm above */}
      <Sewn at={Q.floor}>
        <Print src="bea/doorway-after.jpg" label="Just clear of the floor" tilt={0} zoomTo={1} frames={1} />
      </Sewn>

      {/* 5 — the price first */}
      <Sewn at={Q.price}>
        <Print src="bea/curtain-before.jpg" label="Before you bring them in" tilt={-1} zoomTo={1.06} origin="50% 40%" frames={120} />
      </Sewn>

      <TapeOverlay />
      <FloorOverlay />
      <PriceOverlay />

      {frame >= Q.question && frame < Q.end && (
        <>
          {CAPTIONS.slice(1).map((c) => (
            <Caption key={c.text} text={c.text} from={c.from} to={c.to} top={1420} />
          ))}
          <AwakeCameo from={Q.question + 10} to={Q.end + 4} />
        </>
      )}

      {/* 6 — got a question? */}
      <Sewn at={Q.end}>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 38%, #FFFEFB 0%, ${CREAM} 55%, #F4ECE6 100%)` }}>
          <div style={{ position: "absolute", left: 90, top: 330, width: 900, height: 770, opacity: endIn }}>
            <BeaArt id="end" wash={1} girl={1.15} wreath={1.15} gold={1.15} time={t} alive={1} sheen={endSheen} needle={false} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 1150, textAlign: "center", color: PLUM }}>
            <div style={{ fontFamily: serifItalic, fontSize: 64, opacity: line(at(19.18)) }}>Got a question?</div>
            <div style={{ fontFamily: serifItalic, fontSize: 92, opacity: line(at(20.5)), transform: `translateY(${(1 - line(at(20.5))) * 14}px)` }}>
              Ask Kristina.
            </div>
            <div style={{ marginTop: 22, fontFamily: sans, fontWeight: 600, fontSize: 40, color: GOLD, opacity: line(at(20.9)) }}>
              beautasy.co.uk
            </div>
          </div>
        </AbsoluteFill>
      </Sewn>
    </AbsoluteFill>
  );
};
