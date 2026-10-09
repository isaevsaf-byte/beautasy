"""
Takes the Beautasy logo apart so the girl in it can draw herself.

The logo only exists as a flat picture, so this pulls it into layers —
watercolour wash, the girl's lines, her hair, the laurel wreath and the gold
word — and works out a pen path through every line: where a needle would
start, which way it would go, and how wide the stroke has to be to uncover it.

    python3 video/scripts/bea_layers.py

Needs python3 with opencv and numpy. Writes video/public/bea/*.png and
video/src/bea/strokes.json. Run it again only if the logo changes.
"""

import json
import os

import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "public", "beautasy-logo-gold.png")
OUT_PUBLIC = os.path.join(ROOT, "video", "public", "bea")
OUT_SRC = os.path.join(ROOT, "video", "src", "bea")

img = cv2.imread(SRC, cv2.IMREAD_COLOR)
H, W = img.shape[:2]
f = img.astype(np.float32)
B, G, R = f[..., 0], f[..., 1], f[..., 2]

gold = (R > G) & (G > B) & (R - B > 30)
purple = (R > G + 15) & (B > G + 10) & ~gold
ink = purple & (G < 170)


def dilate(mask, px):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))
    return cv2.dilate(mask.astype(np.uint8), k) > 0


# --- which line belongs to what -------------------------------------------
n, labels, stats, cents = cv2.connectedComponentsWithStats(ink.astype(np.uint8), 8)
wreath = np.zeros_like(ink)
figure = np.zeros_like(ink)
hair = np.zeros_like(ink)
hair_id = max(
    (i for i in range(1, n) if stats[i, 3] > 250 and 740 < cents[i][0] < 860),
    key=lambda i: stats[i, 4],
)
for i in range(1, n):
    cx = stats[i, 0] + stats[i, 2] / 2
    part = labels == i
    if cx < 560 or cx > 870:
        wreath |= part
    elif i == hair_id:
        hair |= part
    else:
        figure |= part

# --- the paper and the watercolour, with every line lifted off -------------
background = cv2.inpaint(img, dilate(ink | gold, 3).astype(np.uint8) * 255, 6, cv2.INPAINT_TELEA)
bg = background.astype(np.float32)


def spread_colour(core, steps=4):
    """Carry each line's own colour a few pixels past its edge."""
    colour = np.where(core[..., None], f, 0)
    known = core.astype(np.float32)
    for _ in range(steps):
        num = cv2.blur(colour * known[..., None], (3, 3))
        den = cv2.blur(known, (3, 3))
        fill = (den > 0) & (known == 0)
        colour[fill] = num[fill] / den[fill][..., None]
        known = np.where(fill, 1.0, known)
    return colour


def layer(core, ring_px=2):
    """Unmix a layer from the paper: colour from the line, alpha from how far
    each edge pixel sits between paper and line."""
    fg = spread_colour(core)
    ring = dilate(core, ring_px)
    d = fg - bg
    alpha = np.sum((f - bg) * d, axis=2) / np.maximum(np.sum(d * d, axis=2), 1.0)
    alpha = np.clip(alpha, 0, 1)
    alpha[core] = np.maximum(alpha[core], 0.92)
    alpha[~ring] = 0
    rgba = np.dstack([np.clip(fg, 0, 255), alpha * 255]).astype(np.uint8)
    return rgba


os.makedirs(OUT_PUBLIC, exist_ok=True)
os.makedirs(OUT_SRC, exist_ok=True)

wash_alpha = np.clip((255.0 - bg[..., 1]) / (255.0 - 196.0), 0, 1)
wash_rgb = np.zeros_like(f)
wash_rgb[...] = (244, 199, 235)  # BGR of the lavender at its deepest
cv2.imwrite(os.path.join(OUT_PUBLIC, "wash.png"),
            np.dstack([wash_rgb, wash_alpha * 255]).astype(np.uint8))
cv2.imwrite(os.path.join(OUT_PUBLIC, "figure.png"), layer(figure))
cv2.imwrite(os.path.join(OUT_PUBLIC, "hair.png"), layer(hair))
cv2.imwrite(os.path.join(OUT_PUBLIC, "wreath.png"), layer(wreath))
cv2.imwrite(os.path.join(OUT_PUBLIC, "gold.png"), layer(gold, ring_px=2))


# --- pen paths --------------------------------------------------------------
def thin(mask):
    """Zhang–Suen thinning: every line down to one pixel down its middle."""
    im = mask.astype(np.uint8).copy()
    while True:
        changed = False
        for step in (0, 1):
            P = np.pad(im, 1)
            p2, p3, p4 = P[:-2, 1:-1], P[:-2, 2:], P[1:-1, 2:]
            p5, p6, p7 = P[2:, 2:], P[2:, 1:-1], P[2:, :-2]
            p8, p9 = P[1:-1, :-2], P[:-2, :-2]
            ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
            nb = sum(ring[:8])
            trans = sum(((ring[i] == 0) & (ring[i + 1] == 1)).astype(np.uint8) for i in range(8))
            if step == 0:
                c = (p2 * p4 * p6 == 0) & (p4 * p6 * p8 == 0)
            else:
                c = (p2 * p4 * p8 == 0) & (p2 * p6 * p8 == 0)
            kill = (im == 1) & (nb >= 2) & (nb <= 6) & (trans == 1) & c
            if kill.any():
                im[kill] = 0
                changed = True
        if not changed:
            return im > 0


NB = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def trace(skel):
    """Walk the skeleton into separate polylines, splitting at forks."""
    pts = set(zip(*np.nonzero(skel)))

    def neighbours(p):
        return [(p[0] + dy, p[1] + dx) for dy, dx in NB if (p[0] + dy, p[1] + dx) in pts]

    deg = {p: len(neighbours(p)) for p in pts}
    nodes = {p for p, d in deg.items() if d != 2}
    used = set()
    paths = []

    def walk(start, nxt):
        path = [start, nxt]
        used.add((start, nxt))
        used.add((nxt, start))
        prev, cur = start, nxt
        while cur not in nodes:
            options = [q for q in neighbours(cur) if q != prev and (cur, q) not in used]
            if not options:
                break
            q = options[0]
            used.add((cur, q))
            used.add((q, cur))
            path.append(q)
            prev, cur = cur, q
            if q == start:
                break
        return path

    for node in nodes:
        for q in neighbours(node):
            if (node, q) not in used:
                paths.append(walk(node, q))
    # Closed loops have no ends to start from
    for p in pts:
        for q in neighbours(p):
            if (p, q) not in used:
                paths.append(walk(p, q))
    return [p for p in paths if len(p) >= 2]


def polyline(path):
    arr = np.array([[x, y] for y, x in path], dtype=np.int32).reshape(-1, 1, 2)
    simple = cv2.approxPolyDP(arr, 0.9, False).reshape(-1, 2).astype(float)
    return simple


def length(p):
    return float(np.sum(np.hypot(*np.diff(p, axis=0).T))) if len(p) > 1 else 0.0


def order(strokes, start, leftward_penalty=0.0):
    """Greedy pen order: always continue from wherever the needle is now."""
    left = list(strokes)
    out = []
    pen = np.array(start, dtype=float)
    while left:
        best = None
        for i, s in enumerate(left):
            for rev in (False, True):
                head = s[-1] if rev else s[0]
                d = np.hypot(*(head - pen))
                if leftward_penalty and head[0] < pen[0]:
                    d += leftward_penalty * (pen[0] - head[0])
                if best is None or d < best[0]:
                    best = (d, i, rev)
        _, i, rev = best
        s = left.pop(i)
        s = s[::-1] if rev else s
        out.append(s)
        pen = s[-1]
    return out


def left_to_right(strokes):
    """Writing order: by where each piece starts across the page, each one
    drawn rightwards — the way a hand writes a word."""
    out = []
    for s in sorted(strokes, key=lambda s: s[:, 0].min()):
        out.append(s[::-1] if s[-1, 0] < s[0, 0] else s)
    return out


def strokes_for(mask, part, start, leftward_penalty=0.0, writing=False):
    dist = cv2.distanceTransform(dilate(mask, 1).astype(np.uint8), cv2.DIST_L2, 3)
    raw = trace(thin(mask))
    lines = [polyline(p) for p in raw]
    widths = [2 * max(dist[y, x] for y, x in p) + 4 for p in raw]
    keyed = {id(l): w for l, w in zip(lines, widths)}
    ordered = left_to_right(lines) if writing else order(lines, start, leftward_penalty)
    width_of = []
    for s in ordered:
        w = keyed.get(id(s))
        if w is None:  # reversed copy
            match = next(l for l in lines if np.array_equal(l, s[::-1]))
            w = keyed[id(match)]
        width_of.append(w)
    # The skeleton breaks at every kink into two-pixel scraps. Where one piece
    # starts right where the last one ended, it is the same stroke of the pen.
    merged, merged_w = [ordered[0]], [width_of[0]]
    for s, w in zip(ordered[1:], width_of[1:]):
        if np.hypot(*(s[0] - merged[-1][-1])) <= 2.5:
            merged[-1] = np.vstack([merged[-1], s[1:] if np.array_equal(s[0], merged[-1][-1]) else s])
            merged_w[-1] = max(merged_w[-1], w)
        else:
            merged.append(s)
            merged_w.append(w)
    ordered, width_of = merged, merged_w
    # Time: a share of the layer's duration in proportion to length, plus a
    # short lift of the needle between strokes
    t = 0.0
    spans = []
    pen = np.array(start, float)
    for s in ordered:
        lift = min(np.hypot(*(s[0] - pen)), 60) * 0.35
        t += lift
        l = max(length(s), 2.0)
        spans.append((t, t + l))
        t += l
        pen = s[-1]
    total = t
    return [
        {
            "part": part,
            "w": round(float(w), 1),
            "len": round(length(s), 1),
            "t0": round(a / total, 4),
            "t1": round(b / total, 4),
            "d": "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in s),
            "pts": [[round(x, 1), round(y, 1)] for x, y in s],
        }
        for s, w, (a, b) in zip(ordered, width_of, spans)
    ]


girl = strokes_for(figure | hair, "girl", start=(700, 120))
for s in girl:
    # Which strokes uncover the hair, so the hair can sway on its own
    xs = [p[0] for p in s["pts"]]
    ys = [p[1] for p in s["pts"]]
    cx, cy = int(np.mean(xs)), int(np.mean(ys))
    near = hair[max(cy - 3, 0):cy + 4, max(cx - 3, 0):cx + 4].any()
    s["hair"] = bool(near)

left_wreath = wreath.copy()
left_wreath[:, W // 2:] = False
right_wreath = wreath.copy()
right_wreath[:, :W // 2] = False

data = {
    "size": [W, H],
    "hairPivot": [int(np.nonzero(hair)[1].min() + 15), int(np.nonzero(hair)[0].min())],
    "girl": girl,
    "wreathLeft": strokes_for(left_wreath, "wreath", start=(520, 780)),
    "wreathRight": strokes_for(right_wreath, "wreath", start=(860, 780)),
    "gold": strokes_for(gold, "gold", start=(160, 560), writing=True),
}
for key in ("girl", "wreathLeft", "wreathRight", "gold"):
    for s in data[key]:
        s.pop("pts", None)

with open(os.path.join(OUT_SRC, "strokes.json"), "w") as fh:
    json.dump(data, fh, separators=(",", ":"))

print({k: len(v) for k, v in data.items() if isinstance(v, list) and k != "size" and k != "hairPivot"})
print("hair pivot", data["hairPivot"])
