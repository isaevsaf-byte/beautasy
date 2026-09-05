/**
 * The shop's own colours, so a post looks like it came from Beautasy and not
 * from a template. These are the values in src/app/globals.css.
 */
export const COLOR = {
  cream: "#FDFBF7",
  creamDeep: "#F5F0FF",
  lavender: "#DCD0FF",
  lavenderDeep: "#7A6D9A",
  charcoal: "#2D2D2D",
  charcoalSoft: "#6B6B6B",
} as const;

/** 4:5 is the tallest an Instagram feed post can be, so it is the most screen. */
export const FORMAT = {
  width: 1080,
  height: 1350,
  fps: 30,
} as const;

export const TIMING = {
  /** How long the seam takes to stitch one scene over the last */
  seam: 20,
  opening: 66,
  perProduct: 72,
  closing: 72,
} as const;
