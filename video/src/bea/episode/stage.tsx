import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { GOLD } from "../BeaArt";
import { CREAM, PLUM, serifItalic } from "../BeaReel";
import { clamp } from "./parts";
import type { Actor } from "./types";

/**
 * The little theatre: the shop's pieces acting on a drawn set. Every frame
 * number here is counted from the scene's start; Episode resolves the anchors.
 */

export type StageMove = {
  actor: string;
  do: "hop" | "waddle" | "peek" | "puff" | "sleep" | "snap" | "flop";
  start: number;
  dur: number;
  to?: [number, number];
  height: number;
  scale: number;
  rot: number;
};

export type StageProps = {
  actors: Actor[];
  moves: StageMove[];
  lightsOff?: number;
  lightsOn?: number;
  torch: [number, number, number][];
  zzz?: { actor: string; from: number; to: number };
};

/** Default length of each move, seconds */
export const MOVE_SECONDS: Record<StageMove["do"], number> = {
  hop: 0.55,
  waddle: 1.4,
  peek: 1.0,
  puff: 0.7,
  sleep: 0,
  snap: 0.25,
  flop: 0.6,
};

const FLOOR = { shelf: 820, table: 1180 };

type Pose = { x: number; y: number; rot: number; sx: number; sy: number; lift: number };

/** Where an actor is and how it is squashed at frame f, playing its moves in order */
function pose(actor: Actor, moves: StageMove[], f: number): Pose {
  let x = actor.home[0];
  let y = actor.home[1];
  let rot = actor.rot ?? 0;
  let puffed = 1;
  let sx = 1;
  let sy = 1;
  let lift = 0;
  const mine = moves.filter((m) => m.actor === actor.id).sort((a, b) => a.start - b.start);
  for (let i = 0; i < mine.length; i++) {
    const m = mine[i];
    if (f < m.start) break;
    const next = mine[i + 1];
    const current = !next || f < next.start;
    const t = m.dur > 0 ? Math.min(1, (f - m.start) / m.dur) : 1;
    const from = { x, y, rot };
    const to = m.to ?? [x, y];
    sx = 1;
    sy = 1;
    lift = 0;
    switch (m.do) {
      case "hop":
      case "flop": {
        x = from.x + (to[0] - from.x) * Easing.inOut(Easing.quad)(t);
        y = from.y + (to[1] - from.y) * t;
        if (m.do === "flop") rot = from.rot + m.rot * Easing.in(Easing.quad)(t);
        if (!current) break;
        lift = m.height * 4 * t * (1 - t);
        // squash on take-off and landing, stretch in the air
        const land = f - (m.start + m.dur);
        if (t < 0.12) { sx = 1.12; sy = 0.86; }
        else if (t < 1) { sx = 0.94; sy = 1.08; }
        else if (land < 8) { const k = interpolate(land, [0, 3, 8], [1, 0.6, 0]); sx = 1 + 0.14 * k; sy = 1 - 0.16 * k; }
        break;
      }
      case "waddle": {
        x = from.x + (to[0] - from.x) * Easing.inOut(Easing.sin)(t);
        y = from.y + (to[1] - from.y) * t;
        if (!current || t >= 1) break;
        const steps = Math.max(2, Math.round((m.dur / 30) * 3));
        rot = from.rot + 7 * Math.sin(t * steps * Math.PI);
        lift = 10 * Math.abs(Math.sin(t * steps * Math.PI));
        if (t >= 1) rot = from.rot;
        break;
      }
      case "peek": {
        if (!current || t >= 1) break;
        lift = 26 * Math.sin(t * Math.PI);
        rot = from.rot + 9 * Math.sin(t * Math.PI * 2);
        if (t >= 1) rot = from.rot;
        break;
      }
      case "puff": {
        puffed = 1 + (m.scale - 1) * interpolate(t, [0, 0.45, 0.7, 1], [0, 1.15, 0.92, 1]);
        if (!current) break;
        const wob = f - m.start;
        sx = 1 + 0.025 * Math.sin(wob / 2.2);
        sy = 1 - 0.025 * Math.sin(wob / 2.2);
        break;
      }
      case "sleep": {
        if (!current) break;
        const breath = Math.sin(((f - m.start) / 30) * ((Math.PI * 2) / 3.2));
        sy = 1 + 0.035 * breath;
        sx = 1 - 0.01 * breath;
        break;
      }
      case "snap": {
        const k = Easing.out(Easing.back(2))(t);
        x = from.x + (actor.home[0] - from.x) * k;
        y = from.y + (actor.home[1] - from.y) * k;
        rot = from.rot + ((actor.rot ?? 0) - from.rot) * k;
        puffed = puffed + (1 - puffed) * Math.min(1, k);
        break;
      }
    }
  }
  return { x, y, rot, sx: sx * puffed, sy: sy * puffed, lift };
}

/** The set: the wall with a moonlit window and a shelf, the cutting table */
const Set: React.FC = () => (
  <AbsoluteFill>
    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, #F6EEE8 0%, #EFE3DA 55%, #E9DACF 60%)` }} />
    {/* The window: night sky, a moon, a few stars */}
    <div
      style={{
        position: "absolute",
        left: 92,
        top: 470,
        width: 250,
        height: 290,
        borderRadius: "125px 125px 10px 10px",
        border: `12px solid #FBF7F2`,
        boxShadow: "inset 0 0 40px rgba(0,0,0,0.25), 0 10px 30px rgba(80,50,60,0.18)",
        background: "linear-gradient(180deg, #1D2550 0%, #33407A 70%, #4C5A92 100%)",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: 140, top: 50, width: 56, height: 56, borderRadius: "50%", background: "#FFF6D8", boxShadow: "0 0 40px 12px rgba(255,240,200,0.45)" }} />
      <div style={{ position: "absolute", left: 156, top: 44, width: 56, height: 56, borderRadius: "50%", background: "#26305E" }} />
      {[[40, 70], [80, 140], [30, 190], [190, 160], [110, 40]].map(([l, t], i) => (
        <div key={i} style={{ position: "absolute", left: l, top: t, width: 4, height: 4, borderRadius: 2, background: "#FFF6D8", opacity: 0.8 }} />
      ))}
      <div style={{ position: "absolute", left: 113, top: 0, width: 10, height: "100%", background: "#FBF7F2" }} />
      <div style={{ position: "absolute", left: 0, top: 150, width: "100%", height: 10, background: "#FBF7F2" }} />
    </div>
    {/* The shelf, with a tape measure hanging off it */}
    <div style={{ position: "absolute", left: 110, top: FLOOR.shelf, width: 860, height: 26, borderRadius: 4, background: "linear-gradient(180deg, #C89A6A, #A87648)", boxShadow: "0 16px 24px rgba(70,40,30,0.22)" }} />
    <svg width={110} height={120} viewBox="0 0 140 300" preserveAspectRatio="none" style={{ position: "absolute", left: 104, top: FLOOR.shelf + 12, overflow: "visible" }}>
      <path d="M20 4 C 30 90, 70 120, 64 210 C 60 260, 90 280, 100 296" fill="none" stroke="#F2D27A" strokeWidth={22} strokeLinecap="round" />
      <path d="M20 4 C 30 90, 70 120, 64 210 C 60 260, 90 280, 100 296" fill="none" stroke={PLUM} strokeWidth={22} strokeDasharray="2 12" strokeOpacity={0.55} />
    </svg>
    {/* The cutting table */}
    <div style={{ position: "absolute", left: 0, right: 0, top: FLOOR.table, bottom: 0, background: "repeating-linear-gradient(178deg, rgba(120,70,35,0.08) 0 3px, transparent 3px 26px), linear-gradient(180deg, #C9935F 0%, #B77D4A 40%, #A86F3F 100%)" }} />
    <div style={{ position: "absolute", left: 0, right: 0, top: FLOOR.table - 4, height: 10, background: "linear-gradient(180deg, #E0B07C, #B9824F)" }} />
  </AbsoluteFill>
);

export const Stage: React.FC<StageProps> = ({ actors, moves, lightsOff, lightsOn, torch, zzz }) => {
  const f = useCurrentFrame();

  const dark =
    lightsOff === undefined
      ? 0
      : Math.min(interpolate(f, [lightsOff, lightsOff + 3], [0, 1], clamp), lightsOn === undefined ? 1 : interpolate(f, [lightsOn, lightsOn + 3], [1, 0], clamp));

  // The torch: a pool of light following its marks, with a faint beam from the brooch
  const tx = torch.length ? interpolate(f, torch.map((t) => t[0]), torch.map((t) => t[1]), { ...clamp, easing: Easing.inOut(Easing.cubic) }) : 540;
  const ty = torch.length ? interpolate(f, torch.map((t) => t[0]), torch.map((t) => t[2]), { ...clamp, easing: Easing.inOut(Easing.cubic) }) : 1000;
  const torchOn = torch.length ? interpolate(f, [torch[0][0], torch[0][0] + 6], [0, 1], clamp) : 0;
  const R = 230 + 8 * Math.sin(f / 7);

  return (
    <AbsoluteFill style={{ background: CREAM }}>
      <Set />
      {actors.map((a) => {
        const p = pose(a, moves, f);
        const shadow = Math.max(0.35, 1 - p.lift / 220);
        return (
          <React.Fragment key={a.id}>
            <div
              style={{
                position: "absolute",
                left: p.x - (a.w * 0.8 * shadow) / 2,
                top: p.y - 14,
                width: a.w * 0.8 * shadow,
                height: 26,
                borderRadius: "50%",
                background: "radial-gradient(ellipse, rgba(50,25,20,0.38) 0%, rgba(50,25,20,0) 70%)",
              }}
            />
            <Img
              src={staticFile(a.src)}
              style={{
                position: "absolute",
                left: p.x - a.w / 2,
                bottom: 1920 - p.y + p.lift,
                width: a.w,
                transformOrigin: "50% 100%",
                transform: `rotate(${p.rot}deg) scale(${p.sx}, ${p.sy})`,
                filter: "drop-shadow(0 6px 8px rgba(50,25,20,0.25))",
              }}
            />
          </React.Fragment>
        );
      })}

      {zzz &&
        f >= zzz.from &&
        f <= zzz.to &&
        (() => {
          const a = actors.find((x) => x.id === zzz.actor);
          if (!a) return null;
          const p = pose(a, moves, f);
          return [0, 1, 2].map((i) => {
            const t = ((f - zzz.from) / 30 + i * 0.6) % 1.8;
            const k = interpolate(t, [0, 0.3, 1.4, 1.8], [0, 1, 1, 0]);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: p.x + a.w * 0.2 + t * 70 + i * 10,
                  top: p.y - a.w * 0.75 - t * 150,
                  fontFamily: serifItalic,
                  fontSize: 64 + i * 16,
                  color: GOLD,
                  opacity: k * Math.min(1, interpolate(f, [zzz.to - 8, zzz.to], [1, 0], clamp)),
                  textShadow: "0 0 18px rgba(233,209,143,0.8)",
                }}
              >
                z
              </div>
            );
          });
        })()}

      {/* Night: the room goes dark, the moon comes through the window, the torch finds the actors */}
      {dark > 0 && (
        <AbsoluteFill style={{ pointerEvents: "none", opacity: dark }}>
          <AbsoluteFill
            style={{
              background:
                torchOn > 0
                  ? `radial-gradient(circle at ${tx}px ${ty}px, rgba(14,16,40,${0.82 * (1 - torchOn)}) 0px, rgba(14,16,40,${0.82 * (1 - torchOn)}) ${R * 0.7}px, rgba(14,16,40,0.82) ${R * 1.25}px)`
                  : "rgba(14,16,40,0.82)",
            }}
          />
          <AbsoluteFill style={{ background: "linear-gradient(118deg, rgba(0,0,0,0) 8%, rgba(170,190,255,0.13) 22%, rgba(170,190,255,0.06) 38%, rgba(0,0,0,0) 46%)", mixBlendMode: "screen" }} />
          {torchOn > 0 && (
            <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, opacity: 0.22 * torchOn }}>
              <defs>
                <linearGradient id="beam" x1="900" y1="300" x2={tx} y2={ty} gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#FFF4D6" stopOpacity={0.9} />
                  <stop offset="1" stopColor="#FFF4D6" stopOpacity={0.15} />
                </linearGradient>
              </defs>
              <polygon points={`900,300 ${tx - R * 0.8},${ty} ${tx + R * 0.8},${ty}`} fill="url(#beam)" />
            </svg>
          )}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/** The frame at which each move lands, for its sound */
export const landsAt = (m: StageMove) => m.start + m.dur;
