/**
 * One Bea episode, written as data.
 *
 * An episode file (video/episodes/<id>.json) says what Bea says and what is on
 * screen when; scripts/bea.mjs records the voice and measures every word, and
 * the Episode composition lays the scenes out against those measurements.
 * Nothing here is in frames: every time is an Anchor into the voice.
 *
 * An Anchor is either a number of seconds into Bea's take, or a reference to
 * what she says, optionally nudged:
 *   "line:2"        — when line 2 starts
 *   "line:2:end"    — when line 2 ends
 *   "word:2:3"      — when the 4th word of line 2 starts (words count from 0)
 *   "line:2+0.4"    — 0.4 s after line 2 starts (also "-0.2")
 * Lines count from 0.
 */
export type Anchor = string | number;

export type Line = {
  /** What the caption shows */
  text: string;
  /** What Lily is asked to say, when it differs ("beautasy dot co dot uk") */
  say?: string;
  /** false: said, but no caption (an end card already shows it) */
  caption?: boolean;
  /** Seconds of silence before this line, cut into Bea's take — the beat before an answer */
  pause?: number;
};

export type Page = {
  /** A phone-sized screenshot in public/, 780 px wide (scripts/site_shots.mjs) */
  src: string;
  at: Anchor;
  /** [when, css px from the top] — the page scrolls between these */
  scroll?: [Anchor, number][];
};

export type Scene =
  | { type: "wake"; hook: string }
  | { type: "question"; at: Anchor; eyebrow?: string; text: string; reveal?: Anchor }
  | {
      type: "print";
      at: Anchor;
      src: string;
      label: string;
      tilt?: number;
      zoomTo?: number;
      origin?: string;
    }
  | {
      /**
       * Guess the price: the piece on a print with a price tag that says "£ ?",
       * a countdown from `countAt` and the tag turning over to the answer at
       * `answerAt`. Give the line before the answer a `pause` so the
       * countdown runs in silence.
       */
      type: "guess";
      at: Anchor;
      src: string;
      label?: string;
      zoomTo?: number;
      origin?: string;
      /** Under the countdown while it runs */
      ask?: string;
      countAt: Anchor;
      answerAt: Anchor;
      /** What the tag says once it turns: "From £25" */
      answer: string;
      /** A chip under the tag after the answer: "Made to measure · per cover" */
      note?: string;
      /** Numbers in the countdown; default 3 */
      count?: number;
    }
  | {
      /** Before and after side by side; `after` arrives at afterAt (default with the scene) */
      type: "split";
      at: Anchor;
      before: string;
      after: string;
      beforeLabel?: string;
      afterLabel?: string;
      afterAt?: Anchor;
    }
  | { type: "phone"; at: Anchor; pages: Page[] }
  | {
      type: "end";
      at: Anchor;
      lead?: string;
      title: string;
      subtitle?: string;
      url?: string;
      /** When each line of the end card appears; defaults follow the voice */
      leadAt?: Anchor;
      titleAt?: Anchor;
      subtitleAt?: Anchor;
      urlAt?: Anchor;
    };

/**
 * Drawn over whatever scene is on screen. Positions on a print are fractions of
 * the photo (0–1); a print with tilt 0 keeps them exactly over the picture.
 */
export type Overlay =
  | { type: "chip"; text: string; from: Anchor; to: Anchor; x: number; y: number; dark?: boolean }
  | { type: "tag"; text: string; from: Anchor; to: Anchor; y?: number }
  | {
      type: "tape";
      from: Anchor;
      to: Anchor;
      grow: [Anchor, Anchor];
      x: number;
      top: number;
      bottom: number;
      topLabel?: string;
      bottomLabel?: string;
    }
  | { type: "rule"; from: Anchor; to: Anchor; y: number; label?: string };

export type Post = {
  caption: string;
  hashtags: string;
  kind: "product" | "before-after" | "process" | "education" | "testimonial" | "seasonal";
  /** Seconds into the finished film for the cover frame */
  cover: number;
};

export type Episode = {
  id: string;
  /** Working title, for people */
  title: string;
  lines: Line[];
  scenes: Scene[];
  overlays?: Overlay[];
  post: Post;
};

/** What scripts/bea.mjs measures from the recording */
export type Timing = {
  duration: number;
  lines: { start: number; end: number; words: { text: string; start: number; end: number }[] }[];
};

export type EpisodeProps = { episode: Episode; timing: Timing };
