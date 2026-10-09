import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { BeaArt, GOLD } from "./BeaArt";
import { CREAM, Caption, PLUM, Sewn, ease, sans, serifItalic } from "./BeaReel";

/**
 * "Too long?" — the first before-and-after Reel with Bea.
 *
 * Bea wakes up (the AI clip, the one moment code can't do: eyes opening, a
 * smile), says who she is, and from then on only watches from her brooch
 * while the real photos of one real job — lined eyelet curtains taken up —
 * tell the story. Every photo here is published on /work; nothing in them
 * is retouched, only framed.
 */

/** Frames, at 30 per second. The voice starts at `voice`; everything else follows Lily's words. */
export const C = {
  voice: 24,
  before: 100,
  doorway: 172,
  reveal: 262,
  after: 296,
  split: 340,
  end: 422,
  total: 525,
};

/** Phrases with Lily's own word timings (ElevenLabs with-timestamps), seconds from the start of her take. */
const LINES: [number, number, string][] = [
  [0.0, 2.66, "Morning! I'm Bea, Kristina's assistant."],
  [2.81, 4.9, "These curtains were puddling on the floor."],
  [5.11, 7.94, "Kristina measured them, took them up, and rehung them…"],
  [8.32, 10.28, "…and now they just kiss the floor."],
  [10.6, 13.14, "Curtains taken up, in Southampton."],
];
const at = (seconds: number) => C.voice + Math.round(seconds * 30);
/** A caption is gone before the next one arrives — on a seam the two would otherwise sit on top of each other. */
const captionEnd = (i: number, end: number) =>
  i + 1 < LINES.length ? Math.min(at(end) + 4, at(LINES[i + 1][0]) - 10) : at(end) + 4;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * A published photo as a print pinned to the cream board: the whole picture,
 * hem included, sits clear of the bottom of the screen, where Instagram puts
 * its caption and buttons. Inside the print it is slowly pushed in.
 */
export const Print: React.FC<{ src: string; label: string; tilt?: number; zoomTo?: number; origin?: string; frames?: number }> = ({
  src,
  label,
  tilt = -1.2,
  zoomTo = 1.08,
  origin = "50% 80%",
  frames = 120,
}) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, frames], [1, zoomTo], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const tag = interpolate(f, [10, 20], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: BOARD }}>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 230,
          width: 860,
          height: 1147,
          padding: 16,
          background: "#FFFFFF",
          boxShadow: "0 30px 70px rgba(70,40,60,0.28), 0 4px 12px rgba(70,40,60,0.12)",
          transform: `rotate(${tilt}deg)`,
        }}
      >
        <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>
          <Img
            src={staticFile(src)}
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${s})`, transformOrigin: origin }}
          />
          <div
            style={{
              position: "absolute",
              left: 22,
              top: 22,
              fontFamily: sans,
              fontWeight: 500,
              fontSize: 32,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: PLUM,
              background: "rgba(253,251,247,0.94)",
              padding: "12px 26px",
              borderRadius: 999,
              opacity: tag,
            }}
          >
            {label}
          </div>
        </div>
        <Pin />
      </div>
    </AbsoluteFill>
  );
};

/** A dressmaker's pin with a plum head, holding the print to the board. */
const Pin: React.FC = () => (
  <svg width={70} height={90} viewBox="0 0 70 90" style={{ position: "absolute", left: 395, top: -40, overflow: "visible" }}>
    <line x1={35} y1={30} x2={44} y2={86} stroke="#9A9A9A" strokeWidth={3} strokeLinecap="round" />
    <circle cx={35} cy={28} r={17} fill={PLUM} />
    <circle cx={29} cy={22} r={5} fill="#FFFFFF" opacity={0.55} />
  </svg>
);

export const BOARD = `radial-gradient(ellipse at 50% 40%, #FFFEFB 0%, ${CREAM} 60%, #F2E9E3 100%)`;

/** Bea, awake, in her brooch — the last frame of the AI clip, breathing a little. */
export const AwakeCameo: React.FC<{ from: number; to: number }> = ({ from, to }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > to) return null;
  const pop = interpolate(frame, [from, from + 14], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.6)) });
  const out = interpolate(frame, [to - 10, to], [1, 0], { extrapolateLeft: "clamp" });
  const s = pop * out;
  const breathe = 1 + 0.012 * Math.sin((frame / 30) * 2 * Math.PI / 3.6);
  return (
    <div
      style={{
        position: "absolute",
        left: 790,
        top: 150,
        width: 220,
        height: 220,
        borderRadius: "50%",
        background: CREAM,
        border: `5px solid ${GOLD}`,
        boxShadow: "0 12px 40px rgba(40,20,40,0.35), inset 0 0 0 3px rgba(255,255,255,0.7)",
        overflow: "hidden",
        transform: `scale(${s})`,
        opacity: s,
      }}
    >
      <Img
        src={staticFile("bea/awake.png")}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${breathe})`, transformOrigin: "50% 70%" }}
      />
    </div>
  );
};

/** What Kristina did, ticked off as Lily says it. */
const Steps: React.FC<{ marks: [number, string][]; to: number }> = ({ marks, to }) => {
  const frame = useCurrentFrame();
  if (frame < marks[0][0] - 2 || frame > to) return null;
  const out = interpolate(frame, [to - 10, to], [1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 400, display: "flex", justifyContent: "center", gap: 18, opacity: out }}>
      {marks.map(([f, text]) => {
        const k = interpolate(frame, [f, f + 10], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.8)) });
        return (
          <div
            key={text}
            style={{
              fontFamily: sans,
              fontWeight: 500,
              fontSize: 31,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: PLUM,
              background: "rgba(253,251,247,0.95)",
              padding: "14px 24px",
              borderRadius: 999,
              boxShadow: "0 10px 30px rgba(60,30,60,0.22)",
              opacity: k,
              transform: `scale(${0.6 + 0.4 * k})`,
            }}
          >
            <span style={{ color: GOLD, marginRight: 10 }}>✓</span>
            {text}
          </div>
        );
      })}
    </div>
  );
};

/** Before and after side by side: two prints, each showing the lower part of the curtain, where the hem is. */
const Split: React.FC = () => {
  const f = useCurrentFrame();
  const tag = interpolate(f, [8, 18], [0, 1], clamp);
  const print = (src: string, label: string, left: number, tilt: number) => (
    <div
      style={{
        position: "absolute",
        left,
        top: 250,
        width: 470,
        height: 940,
        padding: 12,
        background: "#FFFFFF",
        boxShadow: "0 26px 60px rgba(70,40,60,0.26), 0 4px 12px rgba(70,40,60,0.12)",
        transform: `rotate(${tilt}deg)`,
      }}
    >
      <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>
        <Img
          src={staticFile(src)}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "45% 100%", transform: "scale(1.35)", transformOrigin: "45% 100%" }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 20,
            display: "flex",
            justifyContent: "center",
            opacity: tag,
          }}
        >
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
            }}
          >
            {label}
          </div>
        </div>
      </div>
    </div>
  );
  return (
    <AbsoluteFill style={{ background: BOARD }}>
      {print("bea/curtain-before.jpg", "Before", 55, -1.5)}
      {print("bea/curtain-after.jpg", "After", 555, 1.5)}
    </AbsoluteFill>
  );
};

const PriceChip: React.FC<{ from: number; to: number }> = ({ from, to }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > to) return null;
  const k = Math.min(interpolate(frame, [from, from + 12], [0, 1], clamp), interpolate(frame, [to - 8, to], [1, 0], clamp));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 1240, display: "flex", justifyContent: "center", opacity: k }}>
      <div
        style={{
          fontFamily: sans,
          fontWeight: 600,
          fontSize: 38,
          color: CREAM,
          background: PLUM,
          padding: "16px 34px",
          borderRadius: 999,
          boxShadow: "0 12px 34px rgba(60,30,60,0.3)",
          transform: `translateY(${(1 - k) * 12}px)`,
        }}
      >
        Curtain hems from £20 a panel
      </div>
    </div>
  );
};

export const BeaCurtains: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;

  const hook = interpolate(frame, [0, 8], [0.35, 1], { ...clamp, easing: ease });
  const endIn = interpolate(frame, [C.end, C.end + 14], [0, 1], clamp);
  const endSheen = interpolate(frame, [C.end + 20, C.end + 52], [0, 1], clamp);
  const line = (f0: number) => interpolate(frame, [f0, f0 + 12], [0, 1], { ...clamp, easing: ease });

  const voiceEnd = at(14.68);
  const music = (f: number) => {
    const fadeIn = interpolate(f, [0, 10], [0, 1], { extrapolateRight: "clamp" });
    const fadeOut = interpolate(f, [C.total - 36, C.total - 2], [1, 0], clamp);
    return (f >= C.voice - 4 && f <= voiceEnd + 6 ? 0.13 : 0.3) * fadeIn * fadeOut;
  };

  return (
    <AbsoluteFill style={{ background: CREAM }}>
      <Audio src={staticFile("bea/music.mp3")} volume={music} />
      <Sequence from={C.voice} layout="none">
        <Audio src={staticFile("bea/voice-curtains.mp3")} />
      </Sequence>

      {/* 1 — Bea wakes up */}
      {frame < C.before + 22 && (
        <AbsoluteFill>
          <OffthreadVideo
            src={staticFile("bea/wake.mp4")}
            muted
            trimBefore={18}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
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
            Curtains too long?
          </div>
          <Caption text={LINES[0][2]} from={at(LINES[0][0])} to={captionEnd(0, LINES[0][1])} top={1440} />
        </AbsoluteFill>
      )}

      {/* 2 — the problem, close up */}
      <Sewn at={C.before}>
        <Print src="bea/curtain-before.jpg" label="Before" tilt={-1.2} zoomTo={1.12} origin="55% 95%" frames={72} />
      </Sewn>

      {/* 3 — what Kristina did, on the second pair */}
      <Sewn at={C.doorway}>
        <Print src="bea/doorway-before.jpg" label="Before" tilt={1} zoomTo={1.06} origin="50% 90%" frames={90} />
      </Sewn>

      {/* 4 — the reveal */}
      <Sewn at={C.reveal}>
        <Print src="bea/doorway-after.jpg" label="After" tilt={-0.8} zoomTo={1.05} origin="50% 90%" frames={60} />
      </Sewn>
      <Sewn at={C.after}>
        <Print src="bea/curtain-after.jpg" label="After" tilt={1.2} zoomTo={1.1} origin="45% 95%" frames={60} />
      </Sewn>

      {/* 5 — side by side */}
      <Sewn at={C.split}>
        <Split />
      </Sewn>

      {frame >= C.before && frame < C.end && (
        <>
          <Steps
            marks={[
              [at(5.64), "Measured"],
              [at(6.12), "Taken up"],
              [at(7.14), "Rehung"],
            ]}
            to={C.reveal + 4}
          />
          {LINES.slice(1).map(([a, b, text], i) => (
            <Caption key={text} text={text} from={at(a)} to={captionEnd(i + 1, b)} top={1420} />
          ))}
          <PriceChip from={C.split + 30} to={C.end + 2} />
          <AwakeCameo from={C.before + 10} to={C.split + 6} />
        </>
      )}

      {/* 6 — the logo, settled */}
      <Sewn at={C.end}>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 38%, #FFFEFB 0%, ${CREAM} 55%, #F4ECE6 100%)` }}>
          <div style={{ position: "absolute", left: 90, top: 330, width: 900, height: 770, opacity: endIn }}>
            <BeaArt id="end" wash={1} girl={1.15} wreath={1.15} gold={1.15} time={t} alive={1} sheen={endSheen} needle={false} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 1150, textAlign: "center", color: PLUM }}>
            <div style={{ fontFamily: serifItalic, fontSize: 78, opacity: line(at(13.5)), transform: `translateY(${(1 - line(at(13.5))) * 14}px)` }}>
              Made to fit.
            </div>
            <div
              style={{
                marginTop: 18,
                fontFamily: sans,
                fontWeight: 500,
                fontSize: 32,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                opacity: line(at(14.4)),
              }}
            >
              Curtains &amp; alterations · Southampton
            </div>
            <div style={{ marginTop: 26, fontFamily: sans, fontWeight: 600, fontSize: 40, color: GOLD, opacity: line(at(14.9)) }}>
              beautasy.co.uk
            </div>
          </div>
        </AbsoluteFill>
      </Sewn>
    </AbsoluteFill>
  );
};
