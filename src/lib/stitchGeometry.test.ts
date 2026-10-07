import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PARKED, PULLED_TO, SEAM_END, SEWN_TO, STITCHES, STITCH_COUNT } from "./stitchGeometry";
import { LOCAL_SERVICES } from "./localServices";
import Stitched, { stitchSouthampton } from "../components/stitch/Stitched";
import HomeContent from "../app/HomeContent";

/**
 * The first stitch (07.10.2026): a needle sews eleven stitches under "in
 * Southampton", ties a knot and is left in the cloth. The movement is CSS and
 * its positions come from lib/stitchGeometry.ts, so these hold the two
 * together — and hold the promises that keep it harmless: the still picture
 * is the finished seam, nothing moves for a visitor who asked for less
 * motion, it sews each time the page opens, and the heading's words never change.
 */

const ROOT = resolve(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const CSS = read("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const LAYOUT = read("src/app/layout.tsx");

/**
 * The body of the block that opens with exactly `opening {` — not one that
 * merely ends with it, like ".a,\n.b {" for ".b" — up to its matching brace
 */
function block(css: string, opening: string, from = 0): string {
  let at = css.indexOf(`${opening} {`, from);
  while (at >= 0 && !/(^|[{}])\s*$/.test(css.slice(Math.max(0, at - 200), at))) {
    at = css.indexOf(`${opening} {`, at + 1);
  }
  assert.ok(at >= 0, `${opening} is in the stylesheet`);
  let depth = 0;
  for (let i = css.indexOf("{", at); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", at) + 1, i);
  }
  throw new Error(`${opening} is never closed`);
}

/** A keyframe's declarations at a stop ("from", "to", "0%", "80%, 100%") */
function frame(name: string, stop: string): string {
  const body = block(CSS, `@keyframes ${name}`);
  const match = new RegExp(`(?:^|[;}\\s])${stop.replace(/[%,]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(body);
  assert.ok(match, `${name} has a ${stop} frame`);
  return match[1].replace(/\s+/g, " ").trim();
}

/** A rule's declarations, for a selector written exactly so */
function rule(selector: string, css = CSS): string {
  return block(css, selector).replace(/\s+/g, " ").trim();
}

const seconds = (name: string) => {
  const value = new RegExp(`--${name}:\\s*([\\d.]+)s;`).exec(rule(".stitched"))?.[1];
  assert.ok(value, `--${name} is set`);
  return Number(value);
};

const percent = (fraction: number) => `${(Math.round(fraction * 100_000) / 1000).toFixed(3)}%`;

test("the stylesheet moves the needle to where the geometry put the stitches", () => {
  assert.equal(STITCHES.length, STITCH_COUNT);
  // Sewn left to right, each stitch after the last
  for (let i = 1; i < STITCHES.length; i++) assert.ok(STITCHES[i].x1 > STITCHES[i - 1].x2);
  assert.equal(percent(SEWN_TO), "103.774%");
  assert.equal(percent(PULLED_TO), "106.717%");
  assert.equal(percent(SEAM_END), "100.113%");
  assert.equal(frame("bty-x-sew", "to"), `transform: translateX(${percent(SEWN_TO)});`);
  assert.equal(frame("bty-x-tug", "to"), `transform: translateX(${percent(PULLED_TO)});`);
  // The knot and the loop sit at the end of the last stitch
  assert.match(rule(".stitched-knot"), new RegExp(`left: calc\\(${percent(SEAM_END)} \\+ 0\\.07em\\)`));
  assert.match(rule(".stitched-loop"), new RegExp(`left: calc\\(${percent(SEAM_END)} - 0\\.1em\\)`));
});

test("each movement starts where the one before it stopped", () => {
  assert.equal(frame("bty-x-sew", "to"), frame("bty-x-tug", "from"));
  assert.equal(frame("bty-x-tug", "to"), frame("bty-x-park", "from"));
  assert.equal(frame("bty-y-rock", "0%"), frame("bty-y-rock", "80%, 100%"), "a stitch ends where the next begins");
  assert.equal(frame("bty-r-rock", "0%"), frame("bty-r-rock", "80%, 100%"));
  assert.equal(frame("bty-y-rock", "80%, 100%"), frame("bty-y-tug", "from"));
  assert.equal(frame("bty-r-rock", "80%, 100%"), frame("bty-r-tug", "from"));
  assert.equal(frame("bty-y-tug", "to"), frame("bty-y-park", "from"));
  assert.equal(frame("bty-r-tug", "to"), frame("bty-r-park", "from"));
});

test("the still picture is the finished seam: where every movement ends", () => {
  // A visitor who asked for less motion and a browser that runs no animation
  // see these, and every movement fills forwards onto them, so they must be
  // exactly the last frames — or the needle would jump as it comes to rest
  const parkedAt = `calc(${percent(SEAM_END)} + ${PARKED.pastEnd}em)`;
  assert.equal(frame("bty-x-park", "to"), `transform: translateX(${parkedAt});`);
  assert.ok(rule(".stitched-x").includes(`transform: translateX(${parkedAt});`), rule(".stitched-x"));
  assert.equal(frame("bty-y-park", "to"), `transform: translateY(${PARKED.below}em);`);
  assert.match(rule(".stitched-y"), new RegExp(`transform: translateY\\(${PARKED.below}em\\);`));
  assert.equal(frame("bty-r-park", "to"), `transform: rotate(${PARKED.turn}deg);`);
  assert.match(rule(".stitched-r"), new RegExp(`transform: rotate\\(${PARKED.turn}deg\\);`));
  // The stitches, knot, loop and needle are there; only the thread's tail is not
  for (const part of [".stitched-seam line", ".stitched-knot", ".stitched-loop", ".stitched-pin"]) {
    assert.doesNotMatch(rule(part), /opacity:\s*0|scale\(0\)/, `${part} shows at rest`);
  }
  assert.match(rule(".stitched-tail"), /opacity: 0;/);
  assert.equal(frame("bty-fade", "to"), "opacity: 0;");
});

test("the timings add up: the needle comes in, sews eleven stitches, pulls, and rests", () => {
  const close = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 0.002, `${what}: ${a} vs ${b}`);
  close(seconds("sew-at"), seconds("d0") + seconds("intro"), "sewing starts when the needle has appeared");
  close(seconds("sew"), STITCH_COUNT * seconds("dt"), "one rock of the needle per stitch");
  close(seconds("tug-at"), seconds("sew-at") + seconds("sew"), "the tug follows the last stitch");
  close(seconds("park-at"), seconds("tug-at") + seconds("tug"), "it comes to rest after the tug");
  const motion = block(CSS, "@media (prefers-reduced-motion: no-preference)", CSS.indexOf("@keyframes bty-r-park"));
  const y = rule(".stitched-y", motion);
  assert.match(y, new RegExp(`bty-y-rock var\\(--dt\\) ease-in-out var\\(--sew-at\\) ${STITCH_COUNT} both`));
  assert.match(rule(".stitched-r", motion), new RegExp(`bty-r-rock var\\(--dt\\) ease-in-out var\\(--sew-at\\) ${STITCH_COUNT} both`));
  // Slow, as chosen: about five seconds in all, under three of them sewing
  const end = seconds("park-at") + seconds("park");
  assert.ok(end > 4.5 && end < 6, `the whole stitch takes ${end}s`);
});

test("nothing moves for a visitor who asked for less motion", () => {
  const motion = block(CSS, "@media (prefers-reduced-motion: no-preference)", CSS.indexOf("@keyframes bty-r-park"));
  // Every animation in the stitch's part of the stylesheet is in that block
  const stitchCss = CSS.slice(CSS.indexOf(".stitched {"), CSS.indexOf(".topstitch {"));
  const outside = stitchCss.replace(motion, "");
  assert.doesNotMatch(outside, /animation:/, "an animation outside the reduced-motion guard");
  // And every rule in it is the stitch's own
  const animated = [...motion.matchAll(/([^{}]+)\{[^{}]*animation/g)].map(([, selector]) => selector.trim());
  for (const selector of animated) assert.match(selector, /^\.stitched-/, selector);
  assert.ok(animated.length >= 9, animated.join(" | "));
});

test("it sews each time the page opens, and the needle's rest is the last thing to finish", () => {
  // Nothing marks a visit sewn any more (07.10.2026): a stitch that has run
  // stays finished on its page, and a page opened again sews again
  assert.doesNotMatch(LAYOUT, /data-sewn|sessionStorage|SEWN_ONCE/);
  assert.doesNotMatch(CSS, /data-sewn/);
  assert.match(LAYOUT, /<html lang="en" className="[^"]*">/);

  // The needle comes to rest last: nothing is still moving once it is parked
  const motion = block(CSS, "@media (prefers-reduced-motion: no-preference)", CSS.indexOf("@keyframes bty-r-park"));
  const animations = /(bty-[a-z-]+) ([\d.]+s|var\(--[a-z]+\)) (?:[^,;()]|\([^)]*\))*?(var\(--[a-z-]+\)|calc\(var\(--park-at\) \+ ([\d.]+)s\))(?: (\d+))?/g;
  const ends = [...motion.matchAll(animations)].map((m) => {
    const duration = m[2].startsWith("var") ? seconds(m[2].slice(6, -1)) : Number(m[2].slice(0, -1));
    const delay = m[4] ? seconds("park-at") + Number(m[4]) : seconds(m[3].slice(6, -1));
    return { name: m[1], end: delay + duration * Number(m[5] ?? 1) };
  });
  assert.ok(ends.length >= 12, JSON.stringify(ends));
  const rest = ends.find((e) => e.name === "bty-r-park");
  assert.ok(rest);
  for (const e of ends) assert.ok(e.end <= rest.end + 1e-9, `${e.name} ends at ${e.end}s, after the needle rests`);
});

test("the needle never widens the page or shifts it: it slides by transform, and the cloth hides it by paint", () => {
  const point = block(CSS, ".stitched-x,\n.stitched-y,\n.stitched-r");
  assert.match(point, /width: 0;/);
  assert.match(point, /height: 0;/);
  // The strip the point rides on is as wide as the words, so a percentage in
  // translateX is a fraction of them
  assert.match(rule(".stitched-x"), /width: 100%;/);
  // Moving with left or margin would lay the page out every frame, and Google
  // counts it as layout shift; a transform is neither
  const keyframes = [...CSS.matchAll(/@keyframes (bty-[a-z-]+) \{([\s\S]*?\})\s*\}/g)];
  assert.ok(keyframes.length >= 14, `${keyframes.length} keyframes read`);
  for (const [, name, body] of keyframes) {
    assert.doesNotMatch(body, /\b(left|right|top|bottom|margin[a-z-]*|width|height):/, name);
  }
  assert.match(rule(".stitched-needle"), /clip-path: inset\(/);
  assert.match(rule(".stitched-art,\n.stitched-needle"), /pointer-events: none;/);
  // The parked needle reaches about 0.85em past the words, and its drawing's
  // box further: what holds a heading is clipped sideways at the screen's
  // edges, or a 320px phone scrolled 17px sideways (measured 07.10)
  assert.ok(PARKED.pastEnd + SEAM_END - 1 < 0.5);
  assert.match(read("src/app/HomeContent.tsx"), /<section className="[^"]*\boverflow-x-clip\b[^"]*">\s*<div className="max-w-6xl/);
  assert.match(read("src/app/alterations/[slug]/page.tsx"), /<main id="main" className="[^"]*\boverflow-x-clip\b/);
});

test("the heading's words stay exactly as they were, the decoration hidden from screen readers", () => {
  const sewn = renderToStaticMarkup(createElement(Stitched, null, "in Southampton"));
  assert.match(sewn, /^<span class="stitched">in Southampton<span class="stitched-art" aria-hidden="true">/);
  assert.equal(sewn.replace(/<[^>]+>/g, ""), "in Southampton", "no words inside the drawing");
  const seam = /<svg class="stitched-seam"[\s\S]*?<\/svg>/.exec(sewn)?.[0] ?? "";
  assert.equal((seam.match(/<line /g) ?? []).length, STITCH_COUNT);

  let sewnHeadings = 0;
  for (const service of LOCAL_SERVICES) {
    const out = renderToStaticMarkup(createElement("h1", null, stitchSouthampton(service.h1)));
    assert.equal(out.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"), service.h1, service.slug);
    if (service.h1.endsWith(" in Southampton")) {
      sewnHeadings++;
      assert.equal((out.match(/class="stitched"/g) ?? []).length, 1, service.slug);
    }
  }
  assert.equal(sewnHeadings, LOCAL_SERVICES.length, "every service page's heading ends in Southampton today");
  assert.equal(stitchSouthampton("Alterations in Winchester"), "Alterations in Winchester");

  // One per page: the needle's steel is a gradient with a fixed id
  const home = renderToStaticMarkup(createElement(HomeContent, { priceFrom: "£8" }));
  assert.equal((home.match(/id="stitched-steel"/g) ?? []).length, 1);
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(home)?.[1] ?? "";
  assert.match(h1, /class="stitched"/, "the home page's heading is sewn");
  const service = read("src/app/alterations/[slug]/page.tsx");
  assert.match(service, /<h1[^>]*>\s*\{stitchSouthampton\(service\.h1\)\}\s*<\/h1>/);
});

/** Every .tsx file under src, as paths from the project root */
function components(dir = "src"): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return components(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

test("every lavender «Choose a time» is top-stitched, and the stitch never moves a button", () => {
  let stitched = 0;
  for (const file of components()) {
    const lines = read(file).split("\n");
    lines.forEach((line, i) => {
      if (line.trim() !== "Choose a time") return;
      // The button's classes, a few lines above its words
      const classes = lines.slice(Math.max(0, i - 5), i).reverse().find((l) => l.includes('className="'));
      if (!classes?.includes("bg-lavender")) return;
      assert.match(classes, /className="topstitch /, `${file}:${i + 1}`);
      stitched++;
    });
    for (const line of lines.filter((l) => /\btopstitch\b/.test(l))) {
      // .topstitch makes its button position: relative, unlayered — it would beat these
      assert.doesNotMatch(line, /\b(absolute|fixed|sticky)\b/, `${file}: ${line.trim()}`);
    }
  }
  assert.equal(stitched, 12);
  assert.match(rule(".topstitch::after"), /pointer-events: none;/);
  assert.match(rule(".topstitch::after"), /border: 1\.5px dashed/);
  assert.doesNotMatch(rule(".topstitch::after"), /animation/, "it never moves");
});

test("price lists are joined by gold running stitch, not grey dots", () => {
  for (const file of ["src/app/alterations/[slug]/page.tsx", "src/app/atelier/AtelierContent.tsx"]) {
    const source = read(file);
    assert.match(source, /className="leader-stitch flex-1[^"]*" aria-hidden="true"|className="leader-stitch flex-1[^"]*"\s*\n\s*aria-hidden="true"/, file);
    assert.doesNotMatch(source, /border-dotted/, file);
  }
  // Sewn as it scrolls in only where that is understood, and never for less motion
  const supports = block(CSS, "@supports (animation-timeline: view())");
  assert.match(supports, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.doesNotMatch(rule(".leader-stitch"), /animation/);
});

test("the needle cursor is only for a mouse, its pictures are there, and the Studio keeps its own", () => {
  const mouse = block(CSS, "@media (hover: hover) and (pointer: fine) and (forced-colors: none) and (prefers-contrast: no-preference)");
  assert.match(mouse, /body:not\(:has\(\.studio-root\)\) \{\s*cursor: url\("\/cursor-needle\.png"\) 2 2, auto;/);
  assert.match(mouse, /image-set\(url\("\/cursor-needle\.png"\) 1x, url\("\/cursor-needle@2x\.png"\) 2x\) 2 2, auto/);
  assert.equal((CSS.match(/cursor-needle\.png/g) ?? []).length, 2, "nowhere outside the mouse-only block");
  // Links, buttons and fields keep the usual cursors, but not over one the element names itself
  assert.match(mouse, /:not\(\[class\^="cursor-"\], \[class\*=" cursor-"\]\) \{\s*cursor: pointer;/);
  assert.match(mouse, /:not\(\[class\^="cursor-"\], \[class\*=" cursor-"\]\) \{\s*cursor: text;/);
  // Checkout's own cursor is only for when it is disabled: enabled, it is a button like any other
  assert.match(read("src/components/Cart.tsx"), /disabled:cursor-not-allowed/);
  assert.doesNotMatch(mouse, /\[class\*="cursor-"\]/, "a class that sets a cursor only for a state must not opt out");
  // Every rule in it is off on a page holding the Studio — popovers included,
  // which Sanity opens at the end of <body>, outside the Studio's box
  for (const [, selector] of mouse.matchAll(/([^{}]+)\{[^{}]*cursor:/g)) {
    assert.match(selector.trim(), /^body:not\(:has\(\.studio-root\)\)/, selector.trim());
  }
  assert.match(read("src/app/studio/[[...tool]]/layout.tsx"), /className="studio-root /);

  for (const [file, size] of [["public/cursor-needle.png", 32], ["public/cursor-needle@2x.png", 64]] as const) {
    const png = readFileSync(join(ROOT, file));
    assert.equal(png.subarray(1, 4).toString(), "PNG", file);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [size, size], `${file} is ${size}×${size}`);
  }
});

test("where the needle cannot be kept inside the screen, it is left out and the words stay whole", () => {
  // Safari before 16 cannot clip sideways: no needle or loop there
  const noClip = block(CSS, "@supports not (overflow-x: clip)");
  assert.match(noClip, /\.stitched-needle,\s*\.stitched-loop \{\s*display: none;/);
  // Too narrow for the words on one line (a zoomed page): plain words that wrap
  const narrow = block(CSS, "@media (max-width: 309.98px)");
  assert.match(narrow, /\.stitched \{\s*display: inline;\s*white-space: normal;/);
  assert.match(narrow, /\.stitched-art \{\s*display: none;/);
  // The words may break inside their block rather than run off a clipped edge
  assert.doesNotMatch(rule(".stitched"), /white-space: nowrap/);
  // A contrast theme and print keep a leader they can show
  assert.match(block(CSS, "@media (forced-colors: active), print"), /\.leader-stitch \{[^}]*border-bottom: 2px dotted CanvasText;/);
});

test("the chosen time is pinned, and the booking button names it", async () => {
  const { pinnedLabel } = await import("./slots");
  assert.equal(pinnedLabel("2026-10-07T10:00"), "Wed 7 Oct · 10:00am");
  assert.equal(pinnedLabel("2026-12-25T14:30"), "Fri 25 Dec · 2:30pm");
  const form = read("src/components/AtelierBookingForm.tsx");
  // Only the time chips carry the pin, and only the pressed one shows it
  assert.equal((form.match(/className=\{`pin-slot relative /g) ?? []).length, 1, "the time chips, not the day pills");
  assert.match(form, /\? `Book \$\{pinnedLabel\(slot\)\}`\s*: "Book This Time"/);
  const pin = rule('.pin-slot[aria-pressed="true"]::after');
  assert.match(pin, /pointer-events: none;/);
  assert.doesNotMatch(pin, /animation/, "it moves only for a visitor who has not asked for less motion");
  const motion = block(CSS, "@media (prefers-reduced-motion: no-preference)", CSS.indexOf(".pin-slot"));
  assert.match(motion, /\.pin-slot\[aria-pressed="true"\]::after \{\s*animation: bty-pin-in/);
  for (const [, name, body] of CSS.matchAll(/@keyframes (bty-pin-in) \{([\s\S]*?\})\s*\}/g)) {
    assert.doesNotMatch(body, /\b(left|right|top|bottom|width|height|margin[a-z-]*):/, name);
  }
});
