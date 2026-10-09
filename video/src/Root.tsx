import React from "react";
import { Composition } from "remotion";
import { Reel, durationInFrames } from "./Reel";
import { FORMAT } from "./theme";
import { BeaReel, T as BEA } from "./bea/BeaReel";
import { BeaCurtains, C as CURTAINS } from "./bea/BeaCurtains";
import { BeaShop, S as SHOP } from "./bea/BeaShop";
import { BeaKristina, K as KRISTINA } from "./bea/BeaKristina";
import { BeaAsk, Q as ASK } from "./bea/BeaAsk";
import { Episode, calculateEpisodeMetadata } from "./bea/episode/Episode";
import type { EpisodeProps } from "./bea/episode/types";

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
    <Composition
      id="Bea"
      component={BeaReel}
      durationInFrames={BEA.total}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="BeaCurtains"
      component={BeaCurtains}
      durationInFrames={CURTAINS.total}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="BeaShop"
      component={BeaShop}
      durationInFrames={SHOP.total}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="BeaKristina"
      component={BeaKristina}
      durationInFrames={KRISTINA.total}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="BeaAsk"
      component={BeaAsk}
      durationInFrames={ASK.total}
      fps={30}
      width={1080}
      height={1920}
    />
    {/* Every episode from video/episodes/, rendered by scripts/bea.mjs with --props */}
    <Composition
      id="BeaEpisode"
      component={Episode}
      calculateMetadata={calculateEpisodeMetadata}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ episode: { id: "", title: "", lines: [], scenes: [], post: { caption: "", hashtags: "", kind: "education", cover: 2 } }, timing: { duration: 0, lines: [] } } as EpisodeProps}
    />
  </>
);
