import React from "react";
import { Composition } from "remotion";
import { Reel, durationInFrames } from "./Reel";
import { FORMAT } from "./theme";

/**
 * One composition, two shapes.
 *
 * "Feed" is 4:5, the tallest a normal Instagram post can be. "Story" is the
 * same film at 9:16 for stories and reels — the type and the seam are laid out
 * in percentages, so nothing has to be redrawn for it.
 */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Feed"
      component={Reel}
      durationInFrames={durationInFrames()}
      fps={FORMAT.fps}
      width={FORMAT.width}
      height={FORMAT.height}
    />
    <Composition
      id="Story"
      component={Reel}
      durationInFrames={durationInFrames()}
      fps={FORMAT.fps}
      width={1080}
      height={1920}
    />
  </>
);
