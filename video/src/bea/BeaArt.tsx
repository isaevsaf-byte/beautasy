import React, { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import { ART, Stroke, penAt } from "./paths";

/**
 * Bea — the girl from the Beautasy logo — drawing herself.
 *
 * The logo is a flat picture, so every layer here is the real artwork cut out
 * of it (scripts/bea_layers.py) and uncovered along a pen path: the line you
 * see is Kristina's logo, pixel for pixel, never a re-drawing of it. A gold
 * needle — the same one that sews "in Southampton" on the website — goes
 * ahead of the line with its thread behind it.
 *
 * Progress values run 0 → 1 while a layer draws; anything past 1 is the
 * settle, when the last specks the pen path missed fade in (1.15 = settled).
 */

export const GOLD = "#B08848";
const IMAGES = ["wash", "wreath", "figure", "hair", "gold"].map((n) => staticFile(`bea/${n}.png`));

/** Hold the frame until the artwork has loaded, or the first frames are blank. */
function useArtwork() {
  const [handle] = useState(() => delayRender("Bea artwork"));
  useEffect(() => {
    let left = IMAGES.length;
    IMAGES.forEach((src) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        left -= 1;
        if (left === 0) continueRender(handle);
      };
      img.src = src;
    });
  }, [handle]);
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);

const StrokeMask: React.FC<{ id: string; strokes: Stroke[]; progress: number }> = ({
  id,
  strokes,
  progress,
}) => {
  const p = Math.min(progress, 1);
  const settle = clamp((progress - 1) / 0.15);
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={ART.width} height={ART.height}>
      <rect width={ART.width} height={ART.height} fill="black" />
      {p > 0 &&
        strokes.map((s, i) => {
          if (p <= s.t0) return null;
          const local = clamp((p - s.t0) / Math.max(s.t1 - s.t0, 1e-6));
          if (local < 0.002) return null;
          return (
            <path
              key={i}
              d={s.d}
              fill="none"
              stroke="white"
              strokeWidth={s.w}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={local < 1 ? "1 2" : undefined}
              strokeDashoffset={local < 1 ? 1 - local : undefined}
            />
          );
        })}
      {settle > 0 && <rect width={ART.width} height={ART.height} fill="white" opacity={settle} />}
    </mask>
  );
};

/** The needle points where it is going; its thread lies along the line just drawn. */
const Needle: React.FC<{ strokes: Stroke[]; p: number }> = ({ strokes, p }) => {
  const [x, y] = penAt(strokes, p);
  const [bx, by] = penAt(strokes, Math.max(p - 0.006, 0));
  const angle = Math.hypot(x - bx, y - by) > 0.5 ? (Math.atan2(y - by, x - bx) * 180) / Math.PI : -60;
  const trail: string[] = [];
  for (let i = 0; i <= 18; i++) {
    const [tx, ty] = penAt(strokes, Math.max(p - i * 0.0045, 0));
    trail.push(`${tx.toFixed(1)},${ty.toFixed(1)}`);
  }
  return (
    <g>
      <polyline
        points={trail.join(" ")}
        fill="none"
        stroke={GOLD}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
      <g transform={`translate(${x} ${y}) rotate(${angle}) scale(1.55)`} filter="url(#bea-needle-shadow)">
        {/* tip at the origin, eye at the back */}
        <path d="M0,0 L-104,-3.4 Q-118,-3.4 -118,0 Q-118,3.4 -104,3.4 Z" fill="url(#bea-needle-gold)" />
        <ellipse cx={-108} cy={0} rx={6.5} ry={1.3} fill="#FDFBF7" />
        <path d="M-6,-0.6 L-96,-2.2" stroke="#FFF3D1" strokeWidth={1} opacity={0.8} />
      </g>
    </g>
  );
};

/** A spark of light where the gold word is being written. */
const Glint: React.FC<{ p: number }> = ({ p }) => {
  const [x, y] = penAt(ART.gold, p);
  const twinkle = 0.75 + 0.25 * Math.sin(p * 90);
  return (
    <g transform={`translate(${x} ${y}) scale(${twinkle})`} style={{ mixBlendMode: "screen" }}>
      <circle r={30} fill="url(#bea-glint)" />
      <path d="M0,-34 L4,-4 L34,0 L4,4 L0,34 L-4,4 L-34,0 L-4,-4 Z" fill="#FFF6D8" opacity={0.9} />
    </g>
  );
};

export const BeaArt: React.FC<{
  /** unique per instance on screen, so mask ids don't collide */
  id: string;
  wash: number;
  girl: number;
  wreath: number;
  gold: number;
  /** seconds, for the idle motion once she is drawn */
  time: number;
  /** 0 = still, 1 = fully alive (hair sways, she breathes, leaves stir) */
  alive: number;
  /** 0 → 1 while the light runs across the gold word; outside that, none */
  sheen?: number;
  needle?: boolean;
  viewBox?: string;
  showWreath?: boolean;
  showGold?: boolean;
  style?: React.CSSProperties;
}> = ({
  id,
  wash,
  girl,
  wreath,
  gold,
  time,
  alive,
  sheen = -1,
  needle = true,
  viewBox = `0 0 ${ART.width} ${ART.height}`,
  showWreath = true,
  showGold = true,
  style,
}) => {
  useArtwork();
  const [img0, wreathImg, figureImg, hairImg, goldImg] = IMAGES;
  const washImg = img0;
  const sway = alive * 0.9 * Math.sin((time * 2 * Math.PI) / 3.4);
  const breath = 1 + alive * 0.006 * Math.sin((time * 2 * Math.PI) / 3.9 + 0.8);
  const leafL = alive * 0.45 * Math.sin((time * 2 * Math.PI) / 4.6);
  const leafR = alive * 0.45 * Math.sin((time * 2 * Math.PI) / 4.6 + 1.9);
  const [px, py] = ART.hairPivot;
  const bloom = clamp(wash);

  return (
    <svg viewBox={viewBox} style={{ width: "100%", height: "100%", overflow: "visible", ...style }}>
      <defs>
        <linearGradient id="bea-needle-gold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8A6A33" />
          <stop offset="0.45" stopColor="#E9D18F" />
          <stop offset="1" stopColor="#B08848" />
        </linearGradient>
        <radialGradient id="bea-glint">
          <stop offset="0" stopColor="#FFFBEA" stopOpacity="1" />
          <stop offset="0.4" stopColor="#F3DE9E" stopOpacity="0.7" />
          <stop offset="1" stopColor="#E9D18F" stopOpacity="0" />
        </radialGradient>
        <filter id="bea-needle-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="2" dy="5" stdDeviation="3" floodColor="#5A4320" floodOpacity="0.28" />
        </filter>
        <filter id={`${id}-bleed`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves={2} seed={4} />
          <feDisplacementMap in="SourceGraphic" scale={90} xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation={8} />
        </filter>
        <mask id={`${id}-wash`} maskUnits="userSpaceOnUse" x={0} y={0} width={ART.width} height={ART.height}>
          <rect width={ART.width} height={ART.height} fill="black" />
          <circle cx={705} cy={470} r={bloom * 560} fill="white" filter={`url(#${id}-bleed)`} />
          {bloom >= 1 && <rect width={ART.width} height={ART.height} fill="white" />}
        </mask>
        <StrokeMask id={`${id}-girl`} strokes={ART.girl} progress={girl} />
        <StrokeMask id={`${id}-wl`} strokes={ART.wreathLeft} progress={wreath} />
        <StrokeMask id={`${id}-wr`} strokes={ART.wreathRight} progress={wreath} />
        <StrokeMask id={`${id}-gold`} strokes={ART.gold} progress={gold} />
        <mask id={`${id}-gold-alpha`} style={{ maskType: "alpha" }}>
          <image href={goldImg} width={ART.width} height={ART.height} />
        </mask>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0.25">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFF8E2" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {wash > 0 && (
        <g transform={`translate(705 470) scale(${1 + alive * 0.012 * Math.sin(time * 1.3)}) translate(-705 -470)`}>
          <image href={washImg} width={ART.width} height={ART.height} mask={`url(#${id}-wash)`} />
        </g>
      )}

      {showWreath && wreath > 0 && (
        <>
          <g transform={`rotate(${leafL} 520 780)`}>
            <image href={wreathImg} width={ART.width} height={ART.height} mask={`url(#${id}-wl)`} />
          </g>
          <g transform={`rotate(${leafR} 860 780)`}>
            <image href={wreathImg} width={ART.width} height={ART.height} mask={`url(#${id}-wr)`} />
          </g>
        </>
      )}

      {girl > 0 && (
        <g transform={`translate(705 815) scale(1 ${breath}) translate(-705 -815)`}>
          <image href={figureImg} width={ART.width} height={ART.height} mask={`url(#${id}-girl)`} />
          <g transform={`rotate(${sway} ${px} ${py})`}>
            <image href={hairImg} width={ART.width} height={ART.height} mask={`url(#${id}-girl)`} />
          </g>
        </g>
      )}

      {showGold && gold > 0 && (
        <>
          <image href={goldImg} width={ART.width} height={ART.height} mask={`url(#${id}-gold)`} />
          {sheen > 0 && sheen < 1 && (
            <g mask={`url(#${id}-gold-alpha)`}>
              <rect
                x={-500 + sheen * 2200}
                y={0}
                width={420}
                height={ART.height}
                fill={`url(#${id}-sheen)`}
                transform={`skewX(-18)`}
              />
            </g>
          )}
        </>
      )}

      {needle && girl > 0 && girl < 1 && <Needle strokes={ART.girl} p={girl} />}
      {needle && showGold && gold > 0.01 && gold < 1 && <Glint p={gold} />}
      
    </svg>
  );
};
