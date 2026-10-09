import data from "./strokes.json";

/**
 * The pen paths through the logo, worked out by scripts/bea_layers.py.
 *
 * Each stroke knows its share of its layer's drawing time (t0–t1, from 0 to
 * 1) and how wide it has to be to uncover the line underneath. Everything
 * here is in the logo's own pixels, 1378 × 1179.
 */

type Raw = { part: string; w: number; len: number; t0: number; t1: number; d: string };

export type Stroke = Raw & {
  pts: [number, number][];
  /** distance along the stroke at each point */
  cum: number[];
};

function prepare(list: Raw[]): Stroke[] {
  return list.map((s) => {
    const pts = s.d
      .slice(1)
      .split("L")
      .map((p) => p.split(",").map(Number) as [number, number]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    return { ...s, pts, cum };
  });
}

export const ART = {
  width: data.size[0],
  height: data.size[1],
  hairPivot: data.hairPivot as [number, number],
  girl: prepare(data.girl),
  wreathLeft: prepare(data.wreathLeft),
  wreathRight: prepare(data.wreathRight),
  gold: prepare(data.gold),
};

function along(s: Stroke, local: number): [number, number] {
  const total = s.cum[s.cum.length - 1];
  if (total === 0) return s.pts[0];
  const at = Math.min(Math.max(local, 0), 1) * total;
  let i = 1;
  while (i < s.cum.length - 1 && s.cum[i] < at) i++;
  const span = s.cum[i] - s.cum[i - 1] || 1;
  const k = (at - s.cum[i - 1]) / span;
  const [x0, y0] = s.pts[i - 1];
  const [x1, y1] = s.pts[i];
  return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
}

/** Where the needle is when a layer is `p` of the way drawn. */
export function penAt(strokes: Stroke[], p: number): [number, number] {
  if (p <= strokes[0].t0) return strokes[0].pts[0];
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    if (p <= s.t1) {
      if (p >= s.t0) return along(s, (p - s.t0) / Math.max(s.t1 - s.t0, 1e-6));
      // Between strokes the needle lifts and crosses to the next one
      const prev = strokes[i - 1];
      const from = prev.pts[prev.pts.length - 1];
      const to = s.pts[0];
      const k = (p - prev.t1) / Math.max(s.t0 - prev.t1, 1e-6);
      return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
    }
  }
  const last = strokes[strokes.length - 1];
  return last.pts[last.pts.length - 1];
}
