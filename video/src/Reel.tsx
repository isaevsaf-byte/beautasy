import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { COLOR, TIMING } from "./theme";
import { Seam } from "./Seam";
import products from "./products.json";

// Loaded through Remotion so every frame renders with the real face, never a
// fallback that only some frames happened to catch.
const { fontFamily: serif } = loadPlayfair("normal", {
  weights: ["400"],
  subsets: ["latin"],
});
const { fontFamily: serifItalic } = loadPlayfair("italic", {
  weights: ["400"],
  subsets: ["latin"],
});
const { fontFamily: sans } = loadInter("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});

interface Product {
  file: string;
  name: string;
  price: number;
  category: string;
}

const CATALOGUE = products as Product[];

/** "The \"Aria\" Lace & Mesh Brazilian" reads better without the shouting quotes. */
function readableName(name: string): string {
  return name.replace(/"/g, "“").replace(/“([^“]*)“/g, "“$1”");
}

function money(pence: number): string {
  return `£${(pence / 100).toFixed(2).replace(/\.00$/, "")}`;
}

/* ─── One scene, stitched over whatever came before ─── */

const Scene: React.FC<{
  start: number;
  children: React.ReactNode;
  index: number;
}> = ({ start, children, index }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  const progress = interpolate(frame, [start, start + TIMING.seam], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  if (frame < start) return null;

  return (
    <>
      <AbsoluteFill
        style={{
          // Revealed from the left, trailing the needle
          clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
          zIndex: 10 + index,
        }}
      >
        {children}
      </AbsoluteFill>
      <AbsoluteFill style={{ zIndex: 10 + index }}>
        <Seam progress={progress} height={height} />
      </AbsoluteFill>
    </>
  );
};

/* ─── A single piece ─── */

const ProductScene: React.FC<{ product: Product; start: number }> = ({ product, start }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - start;

  // A slow push in, so a still photograph breathes
  const scale = interpolate(local, [0, TIMING.perProduct + TIMING.seam], [1.08, 1.0], {
    extrapolateRight: "clamp",
  });

  const card = spring({
    frame: local - TIMING.seam * 0.6,
    fps,
    config: { damping: 200, mass: 0.6 },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLOR.cream }}>
      <Img
        src={staticFile(product.file)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
        }}
      />

      {/* The name sits on cream, not on the photograph. Almost everything
          Kristina makes is white or cream on a pale background, so white type
          over the picture disappears into the fabric — which is exactly what
          happened before this panel. Cream and charcoal read on any of them,
          and it is the same card the shop uses. */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          opacity: card,
          transform: `translateY(${(1 - card) * 48}px)`,
        }}
      >
        <div
          style={{
            backgroundColor: COLOR.cream,
            borderTop: `3px dashed ${COLOR.lavenderDeep}`,
            padding: "52px 72px 60px",
          }}
        >
          <div
            style={{
              fontFamily: sans,
              fontSize: 22,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: COLOR.lavenderDeep,
              marginBottom: 16,
              fontWeight: 600,
            }}
          >
            {product.category}
          </div>
          <div
            style={{
              fontFamily: serif,
              fontSize: 62,
              lineHeight: 1.14,
              color: COLOR.charcoal,
              marginBottom: 18,
            }}
          >
            {readableName(product.name)}
          </div>
          <div
            style={{
              fontFamily: sans,
              fontSize: 36,
              fontWeight: 500,
              color: COLOR.charcoalSoft,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {money(product.price)}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ─── Opening and closing cards ─── */

const OpeningScene: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - start;

  const title = spring({ frame: local - 4, fps, config: { damping: 200 } });
  // The seam draws itself under the name, the way a hem is finished
  const thread = interpolate(local, [16, 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const strap = interpolate(local, [40, 58], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLOR.cream,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontFamily: serif,
          fontSize: 86,
          letterSpacing: "0.3em",
          color: COLOR.charcoal,
          opacity: title,
          transform: `translateY(${(1 - title) * 18}px)`,
          paddingLeft: "0.3em",
        }}
      >
        BEAUTASY
      </div>

      <div
        style={{
          width: `${thread * 46}%`,
          borderTop: `3px dashed ${COLOR.lavenderDeep}`,
          marginTop: 34,
          marginBottom: 34,
        }}
      />

      <div
        style={{
          fontFamily: sans,
          fontSize: 26,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: COLOR.charcoalSoft,
          opacity: strap,
        }}
      >
        Handmade in Southampton
      </div>
    </AbsoluteFill>
  );
};

const ClosingScene: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - start;

  const line = spring({ frame: local - 6, fps, config: { damping: 200 } });
  const url = spring({ frame: local - 22, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLOR.creamDeep,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontFamily: serifItalic,
          fontStyle: "italic",
          fontSize: 92,
          color: COLOR.charcoal,
          opacity: line,
          transform: `translateY(${(1 - line) * 16}px)`,
        }}
      >
        Made to fit.
      </div>

      <div
        style={{
          width: "34%",
          borderTop: `3px dashed ${COLOR.lavenderDeep}`,
          marginTop: 40,
          marginBottom: 40,
          opacity: url,
        }}
      />

      <div
        style={{
          fontFamily: sans,
          fontSize: 30,
          letterSpacing: "0.16em",
          color: COLOR.lavenderDeep,
          opacity: url,
          fontWeight: 500,
        }}
      >
        beautasy.co.uk
      </div>
    </AbsoluteFill>
  );
};

/* ─── The film ─── */

export const durationInFrames = (): number =>
  TIMING.opening + CATALOGUE.length * TIMING.perProduct + TIMING.closing;

export const Reel: React.FC = () => {
  let cursor = 0;
  const openingStart = cursor;
  cursor += TIMING.opening;

  const productStarts = CATALOGUE.map(() => {
    const at = cursor;
    cursor += TIMING.perProduct;
    return at;
  });
  const closingStart = cursor;

  return (
    <AbsoluteFill style={{ backgroundColor: COLOR.cream }}>
      <Scene start={openingStart} index={0}>
        <OpeningScene start={openingStart} />
      </Scene>

      {CATALOGUE.map((product, i) => (
        <Scene key={product.file} start={productStarts[i]} index={i + 1}>
          <ProductScene product={product} start={productStarts[i]} />
        </Scene>
      ))}

      <Scene start={closingStart} index={CATALOGUE.length + 1}>
        <ClosingScene start={closingStart} />
      </Scene>
    </AbsoluteFill>
  );
};
