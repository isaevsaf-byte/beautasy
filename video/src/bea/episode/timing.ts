import type { Anchor, Timing } from "./types";

export const FPS = 30;
/** Bea's first word: just after her eyes open in the wake-up clip */
export const VOICE_AT = 24;
/** How long the film holds after the last word */
export const TAIL = 54;

/** Seconds into Bea's take for an anchor. Throws on a reference that does not exist, so a typo fails the render rather than drifting. */
export function seconds(anchor: Anchor, timing: Timing): number {
  if (typeof anchor === "number") return anchor;
  const m = /^(line|word):(\d+)(?::(end|\d+))?([+-]\d+(?:\.\d+)?)?$/.exec(anchor.trim());
  if (!m) throw new Error(`Not an anchor: "${anchor}"`);
  const [, kind, lineStr, sub, nudge] = m;
  const line = timing.lines[Number(lineStr)];
  if (!line) throw new Error(`"${anchor}": there is no line ${lineStr}`);
  let t: number;
  if (kind === "line") {
    if (sub === undefined) t = line.start;
    else if (sub === "end") t = line.end;
    else throw new Error(`"${anchor}": use word:${lineStr}:${sub} for a word`);
  } else {
    if (sub === undefined || sub === "end") throw new Error(`"${anchor}": a word anchor needs its number`);
    const word = line.words[Number(sub)];
    if (!word) throw new Error(`"${anchor}": line ${lineStr} has ${line.words.length} words`);
    t = word.start;
  }
  return t + (nudge ? Number(nudge) : 0);
}

/** The frame of the film for an anchor */
export function frameOf(anchor: Anchor, timing: Timing): number {
  return VOICE_AT + Math.round(seconds(anchor, timing) * FPS);
}

/** The whole film: the voice, then a beat for the end card */
export function totalFrames(timing: Timing): number {
  return VOICE_AT + Math.round(timing.duration * FPS) + TAIL;
}
