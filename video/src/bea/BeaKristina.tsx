import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BeaArt, GOLD } from "./BeaArt";
import { CREAM, Caption, PLUM, Sewn, ease, sans, serifItalic } from "./BeaReel";
import { AwakeCameo, Print } from "./BeaCurtains";

/**
 * "Meet Kristina" — Bea introduces her boss.
 *
 * Every word Bea says about Kristina is the site's own Meet Kristina text,
 * turned into the third person: no years, no qualifications, nothing she
 * would have to correct. The photos are hers, from the site and Gallery/Kris.
 */

/** Bea's take is cut after "This is Kristina." and Kristina says hello herself, in her own voice. */
const CUT = 5.25;
const KRISTINA_SAYS = 187;
const RESUME = 241;

export const K = {
  voice: 24,
  portrait: 136,
  atWork: 240,
  close: 399,
  hands: 525,
  end: 607,
  total: 749,
};

const LINES: [number, number, string][] = [
  [0.0, 3.75, "Morning! I'm Bea. Let me introduce my boss."],
  [4.08, 5.16, "This is Kristina."],
  [5.31, 7.8, "She alters, mends and makes clothes by hand,"],
  [7.92, 10.19, "in her quiet workroom in Southampton."],
  [11.01, 14.56, "Everything is pinned on you, and priced before she starts…"],
  [15.0, 17.12, "…and sewn by the same pair of hands."],
];
const SHIFT = RESUME - (K.voice + Math.round(CUT * 30));
const at = (seconds: number) => K.voice + Math.round(seconds * 30) + (seconds > CUT ? SHIFT : 0);

/** Bea's lines and Kristina's own, in the order they are heard; each caption leaves before the next arrives. */
const CAPTIONS = [
  ...LINES.slice(0, 2).map(([a, b, text]) => ({ from: at(a), end: at(b), text })),
  { from: KRISTINA_SAYS + 2, end: KRISTINA_SAYS + 44, text: "Hi, I'm Kristina." },
  ...LINES.slice(2).map(([a, b, text]) => ({ from: at(a), end: at(b), text })),
].map((c, i, all) => ({ ...c, to: i + 1 < all.length ? Math.min(c.end + 4, all[i + 1].from - 10) : c.end + 4 }));
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const BeaKristina: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const hook = interpolate(frame, [0, 8], [0.35, 1], { ...clamp, easing: ease });
  const endIn = interpolate(frame, [K.end, K.end + 14], [0, 1], clamp);
  const endSheen = interpolate(frame, [K.end + 20, K.end + 52], [0, 1], clamp);
  const line = (f0: number) => interpolate(frame, [f0, f0 + 12], [0, 1], { ...clamp, easing: ease });
  const voiceEnd = at(21.18);
  const music = (f: number) => {
    const fadeIn = interpolate(f, [0, 10], [0, 1], { extrapolateRight: "clamp" });
    const fadeOut = interpolate(f, [K.total - 36, K.total - 2], [1, 0], clamp);
    return (f >= K.voice - 4 && f <= voiceEnd + 6 ? 0.13 : 0.3) * fadeIn * fadeOut;
  };

  return (
    <AbsoluteFill style={{ background: CREAM }}>
      <Audio src={staticFile("bea/music.mp3")} volume={music} />
      <Sequence from={K.voice} layout="none">
        <Audio src={staticFile("bea/voice-kristina.mp3")} trimAfter={Math.round(CUT * 30)} />
      </Sequence>
      <Sequence from={KRISTINA_SAYS} layout="none">
        <Audio src={staticFile("bea/voice-kristina-real.mp3")} volume={0.85} />
      </Sequence>
      <Sequence from={RESUME} layout="none">
        <Audio src={staticFile("bea/voice-kristina.mp3")} trimBefore={Math.round(CUT * 30)} />
      </Sequence>

      {/* 1 — Bea wakes up */}
      {frame < K.portrait + 22 && (
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
            Meet Kristina
          </div>
          <Caption text={CAPTIONS[0].text} from={CAPTIONS[0].from} to={CAPTIONS[0].to} top={1440} />
        </AbsoluteFill>
      )}

      <Sewn at={K.portrait}>
        <Print src="bea/kristina-portrait.jpg" label="Kristina" tilt={-1.2} zoomTo={1.06} origin="45% 30%" frames={100} />
      </Sewn>
      <Sewn at={K.atWork}>
        <Print src="bea/kristina-at-work.jpg" label="At work" tilt={1} zoomTo={1.08} origin="50% 60%" frames={160} />
      </Sewn>
      <Sewn at={K.close}>
        <Print src="bea/kristina-close.jpg" label="Priced first" tilt={-0.8} zoomTo={1.07} origin="40% 30%" frames={126} />
      </Sewn>
      <Sewn at={K.hands}>
        <Print src="bea/kristina-hands.jpg" label="By hand" tilt={1.2} zoomTo={1.12} origin="55% 70%" frames={82} />
      </Sewn>

      {frame >= K.portrait && frame < K.end && (
        <>
          {CAPTIONS.slice(1).map((c) => (
            <Caption key={c.text} text={c.text} from={c.from} to={c.to} top={1420} />
          ))}
          <AwakeCameo from={K.portrait + 10} to={K.end + 4} />
        </>
      )}

      <Sewn at={K.end}>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 38%, #FFFEFB 0%, ${CREAM} 55%, #F4ECE6 100%)` }}>
          <div style={{ position: "absolute", left: 90, top: 330, width: 900, height: 770, opacity: endIn }}>
            <BeaArt id="end" wash={1} girl={1.15} wreath={1.15} gold={1.15} time={t} alive={1} sheen={endSheen} needle={false} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 1150, textAlign: "center", color: PLUM }}>
            <div style={{ fontFamily: serifItalic, fontSize: 78, opacity: line(K.end + 8), transform: `translateY(${(1 - line(K.end + 8)) * 14}px)` }}>
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
                opacity: line(at(17.94)),
              }}
            >
              Choose a time
            </div>
            <div style={{ marginTop: 26, fontFamily: sans, fontWeight: 600, fontSize: 44, color: GOLD, opacity: line(at(18.83)) }}>
              beautasy.co.uk
            </div>
          </div>
        </AbsoluteFill>
      </Sewn>
    </AbsoluteFill>
  );
};
