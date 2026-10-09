import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { BeaArt, GOLD } from "./BeaArt";

/**
 * "Hi, I'm Bea" — the first film with the logo girl in it.
 *
 * She draws herself while she introduces herself, then hands over to
 * Kristina's real hands: the footage carries the film, Bea frames it. That
 * order is deliberate — process footage is what people watch, and a mascot
 * only earns its place by being the same charming thing every time.
 */

export const { fontFamily: serifItalic } = loadPlayfair("italic", { weights: ["400", "500"], subsets: ["latin"] });
export const { fontFamily: sans } = loadInter("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

export const PLUM = "#8E4585";
export const CREAM = "#FDFBF7";

/** Frames, at 30 per second */
export const T = {
  voice: 20,
  seam1: 262,
  red: 282,
  seam2: 418,
  dots: 438,
  seam3: 548,
  end: 568,
  outro: 580,
  total: 705,
};

/** Phrases as Lily says them, in seconds from the start of each recording (silencedetect). */
const INTRO: [number, number, string][] = [
  [0.0, 1.17, "Hi, I'm Bea."],
  [1.74, 3.36, "I live on Kristina's sketchpad,"],
  [3.65, 5.09, "right here in Southampton."],
  [5.8, 8.83, "Everything she makes starts with one straight cut…"],
  [9.49, 10.68, "Watch those shears."],
];

export const ease = Easing.bezier(0.45, 0, 0.25, 1);

export const Caption: React.FC<{ text: string; from: number; to: number; onFootage?: boolean; top?: number }> = ({
  text,
  from,
  to,
  onFootage,
  top,
}) => {
  const frame = useCurrentFrame();
  if (frame < from - 2 || frame > to + 8) return null;
  const inn = interpolate(frame, [from - 2, from + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const out = interpolate(frame, [to, to + 8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const o = Math.min(inn, out);
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        right: 90,
        top: top ?? (onFootage ? 1260 : 1225),
        display: "flex",
        justifyContent: "center",
        opacity: o,
        transform: `translateY(${(1 - inn) * 16}px)`,
      }}
    >
      <div
        style={{
          fontFamily: serifItalic,
          fontSize: 62,
          lineHeight: 1.18,
          color: PLUM,
          textAlign: "center",
          textWrap: "balance",
          padding: onFootage ? "18px 34px 22px" : 0,
          background: onFootage ? "rgba(253,251,247,0.94)" : "transparent",
          borderRadius: 26,
          boxShadow: onFootage ? "0 10px 40px rgba(60,30,60,0.18)" : "none",
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** The next scene is sewn on: a gold seam crosses the frame and the new picture follows it. */
export const Sewn: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  if (frame < at) return null;
  const k = interpolate(frame, [at, at + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const x = k * width;
  return (
    <AbsoluteFill style={{ clipPath: k < 1 ? `inset(0 ${width - x}px 0 0)` : undefined }}>
      <Sequence from={at} layout="none">
        {children}
      </Sequence>
      {k < 1 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: x - 2,
            width: 4,
            height,
            backgroundImage: `repeating-linear-gradient(to bottom, ${GOLD} 0 18px, transparent 18px 32px)`,
            boxShadow: `0 0 26px 8px rgba(233,209,143,0.55)`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

/** Starts on its own clock: `trimSeconds` into the clip at the moment it is sewn on. */
const Footage: React.FC<{ src: string; trimSeconds: number; rate: number }> = ({ src, trimSeconds, rate }) => (
  <AbsoluteFill style={{ background: "#000" }}>
    <OffthreadVideo
      src={staticFile(src)}
      muted
      playbackRate={rate}
      trimBefore={Math.round(trimSeconds * 30)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  </AbsoluteFill>
);

/** Bea in a cameo brooch, keeping an eye on the work. */
const Cameo: React.FC<{ from: number; to: number }> = ({ from, to }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > to) return null;
  const pop = interpolate(frame, [from, from + 14], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.6)) });
  const out = interpolate(frame, [to - 10, to], [1, 0], { extrapolateLeft: "clamp" });
  const s = pop * out;
  return (
    <div
      style={{
        position: "absolute",
        left: 84,
        top: 290,
        width: 236,
        height: 236,
        borderRadius: "50%",
        background: `radial-gradient(circle at 45% 35%, #FFFFFF, ${CREAM} 70%)`,
        border: `5px solid ${GOLD}`,
        boxShadow: "0 12px 40px rgba(40,20,40,0.35), inset 0 0 0 3px rgba(255,255,255,0.7)",
        overflow: "hidden",
        transform: `scale(${s})`,
        opacity: s,
      }}
    >
      <BeaArt
        id="cameo"
        wash={1}
        girl={1.15}
        wreath={0}
        gold={0}
        time={frame / 30}
        alive={1}
        needle={false}
        showWreath={false}
        showGold={false}
        viewBox="565 105 320 320"
      />
    </div>
  );
};

export const Label: React.FC<{ text: string; from: number; to: number }> = ({ text, from, to }) => {
  const frame = useCurrentFrame();
  if (frame < from || frame > to) return null;
  const o = Math.min(
    interpolate(frame, [from, from + 10], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [to - 10, to], [1, 0], { extrapolateLeft: "clamp" }),
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 1290,
        display: "flex",
        justifyContent: "center",
        opacity: o,
      }}
    >
      <div
        style={{
          fontFamily: sans,
          fontWeight: 500,
          fontSize: 34,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: PLUM,
          background: "rgba(253,251,247,0.94)",
          padding: "16px 30px",
          borderRadius: 999,
          boxShadow: "0 10px 34px rgba(60,30,60,0.2)",
        }}
      >
        {text}
      </div>
    </div>
  );
};

export const BeaReel: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;

  // Scene one: Bea draws herself
  const wash = interpolate(frame, [0, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const girl = interpolate(frame, [8, 112, 124], [0, 1, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const wreath = interpolate(frame, [58, 146, 156], [0, 1, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const gold = interpolate(frame, [112, 182, 192], [0, 1, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const alive = interpolate(frame, [112, 150], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sheen = interpolate(frame, [192, 226], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const push = interpolate(frame, [0, T.seam1 + 20], [1, 1.05]);

  // The ending: the whole logo, settled
  const endIn = interpolate(frame, [T.end, T.end + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const endSheen = interpolate(frame, [T.outro + 2, T.outro + 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const line = (at: number) =>
    interpolate(frame, [at, at + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  const voiceOn = (f: number) => (f >= T.voice && f <= T.voice + 325) || (f >= T.outro && f <= T.outro + 116);
  const music = (f: number) => {
    const fadeIn = interpolate(f, [0, 12], [0, 1], { extrapolateRight: "clamp" });
    const fadeOut = interpolate(f, [T.total - 36, T.total - 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (voiceOn(f) ? 0.13 : 0.3) * fadeIn * fadeOut;
  };

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 38%, #FFFEFB 0%, ${CREAM} 55%, #F4ECE6 100%)` }}>
      <Audio src={staticFile("bea/music.mp3")} volume={music} />
      <Sequence from={T.voice} layout="none">
        <Audio src={staticFile("bea/voice-intro.mp3")} />
      </Sequence>
      <Sequence from={T.outro} layout="none">
        <Audio src={staticFile("bea/voice-outro.mp3")} />
      </Sequence>

      {/* 1 — she draws herself */}
      {frame < T.red + 2 && (
        <AbsoluteFill>
          <div
            style={{
              position: "absolute",
              left: 40,
              top: 300,
              width: 1000,
              height: 856,
              transform: `scale(${push})`,
              transformOrigin: "50% 45%",
            }}
          >
            <BeaArt id="hero" wash={wash} girl={girl} wreath={wreath} gold={gold} time={t} alive={alive} sheen={sheen} />
          </div>
          {INTRO.slice(0, 4).map(([a, b, text]) => (
            <Caption key={text} text={text} from={T.voice + Math.round(a * 30)} to={T.voice + Math.round(b * 30)} />
          ))}
        </AbsoluteFill>
      )}

      {/* 2 — Kristina's shears */}
      <Sewn at={T.seam1}>
        <Footage src="bea/cut-red.mp4" trimSeconds={8.4} rate={1.2} />
      </Sewn>

      {/* 3 — lilac polka dots */}
      <Sewn at={T.seam2}>
        <Footage src="bea/cut-dots.mp4" trimSeconds={15.4} rate={1.1} />
      </Sewn>

      {frame >= T.seam1 && frame < T.end && (
        <>
          <Caption
            text={INTRO[4][2]}
            from={T.voice + Math.round(INTRO[4][0] * 30)}
            to={T.voice + Math.round(INTRO[4][1] * 30) + 6}
            onFootage
          />
          <Label text="Measure twice · cut once" from={352} to={414} />
          <Label text="Lilac polka dots, cut to size" from={452} to={544} />
          <Cameo from={T.red + 4} to={T.end + 4} />
        </>
      )}

      {/* 4 — the logo, settled, and where to find her */}
      <Sewn at={T.seam3}>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 38%, #FFFEFB 0%, ${CREAM} 55%, #F4ECE6 100%)` }}>
          <div style={{ position: "absolute", left: 90, top: 330, width: 900, height: 770, opacity: endIn }}>
            <BeaArt
              id="end"
              wash={1}
              girl={1.15}
              wreath={1.15}
              gold={1.15}
              time={t}
              alive={1}
              sheen={endSheen}
              needle={false}
            />
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 1150,
              textAlign: "center",
              color: PLUM,
            }}
          >
            <div
              style={{
                fontFamily: serifItalic,
                fontSize: 78,
                opacity: line(T.outro + 18),
                transform: `translateY(${(1 - line(T.outro + 18)) * 14}px)`,
              }}
            >
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
                opacity: line(T.outro + 52),
              }}
            >
              Alterations &amp; repairs · Southampton
            </div>
            <div
              style={{
                marginTop: 26,
                fontFamily: sans,
                fontWeight: 600,
                fontSize: 40,
                color: GOLD,
                opacity: line(T.outro + 70),
              }}
            >
              beautasy.co.uk
            </div>
          </div>
        </AbsoluteFill>
      </Sewn>
    </AbsoluteFill>
  );
};
