import React from "react";
import { COLOR } from "./theme";

/**
 * The needle and its thread.
 *
 * Every scene is stitched over the one before it rather than cut or faded to:
 * a dashed seam travels across the frame and the new picture appears in its
 * wake. It is the one transition that means something here — it is what
 * Kristina actually does all day — and it is why this does not look like a
 * slideshow template with the photos swapped out.
 */
export const Seam: React.FC<{
  /** 0 at the left edge, 1 at the right */
  progress: number;
  height: number;
}> = ({ progress, height }) => {
  if (progress <= 0 || progress >= 1) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: `${progress * 100}%`,
        height,
        width: 3,
        transform: "translateX(-1.5px)",
        // The thread: a dashed line, and a little light around the needle
        backgroundImage: `repeating-linear-gradient(
          to bottom,
          ${COLOR.lavenderDeep} 0px,
          ${COLOR.lavenderDeep} 14px,
          transparent 14px,
          transparent 26px
        )`,
        boxShadow: `0 0 24px 6px ${COLOR.lavender}`,
        zIndex: 50,
      }}
    />
  );
};
