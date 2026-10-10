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

test("a booking is tied off under its heading, a request only tacked", async () => {
  const { TIED_STITCHES, TACKED_STITCHES } = await import("./stitchGeometry");
  // No hooks, so it renders by a plain call
  const TiedOff = (await import("../components/stitch/TiedOff")).default;
  for (const [seam, count] of [[TIED_STITCHES, 7], [TACKED_STITCHES, 5]] as const) {
    assert.equal(seam.length, count);
    for (let i = 1; i < seam.length; i++) assert.ok(seam[i].x1 > seam[i - 1].x2, "sewn left to right, a gap after each");
    assert.equal(seam[0].x1, 0, "from the words' first letter");
    assert.equal(seam[seam.length - 1].x2, 1000, "to their last, where the knot goes");
  }
  // The words stay the words; the seam is hidden from screen readers
  const tied = renderToStaticMarkup(TiedOff({ children: "You're booked in" }));
  assert.match(tied, /^<span class="tied-off">You&#x27;re booked in<span class="tied-off-art" aria-hidden="true">/);
  assert.equal((tied.match(/<line /g) ?? []).length, 7);
  assert.match(tied, /tied-off-knot/);
  assert.match(tied, /tied-off-snips/);
  const tacked = renderToStaticMarkup(TiedOff({ tacked: true, children: "Request sent!" }));
  assert.match(tacked, /^<span class="tied-off tied-off-tacked">Request sent!<span class="tied-off-art" aria-hidden="true">/);
  assert.equal((tacked.match(/<line /g) ?? []).length, 5);
  assert.doesNotMatch(tacked, /knot|snips|tied-off-end/, "a tacked seam is not tied");
  // Tacking is in its own lavender, lighter than the booking's gold thread
  const thread = (selector: string) => /--thread:\s*([^;]+);/.exec(rule(selector))?.[1];
  assert.equal(thread(".tied-off"), "#b08848");
  assert.ok(thread(".tied-off-tacked"));
  assert.notEqual(thread(".tied-off-tacked"), thread(".tied-off"), "a request is not sewn in the booking's gold");
  assert.match(rule(".tied-off-tacked .tied-off-seam line"), /stroke-width:/);

  // Which confirmation gets which, and the old tick is gone
  const form = read("src/components/AtelierBookingForm.tsx");
  assert.match(form, /<TiedOff>You&apos;re booked in<\/TiedOff>/);
  assert.match(form, /<TiedOff tacked>Request sent!<\/TiedOff>/);
  assert.match(form, /<TiedOff tacked>Collection requested<\/TiedOff>/);
  assert.doesNotMatch(form, /CheckCircle2/);
});

test("the tied-off seam's still picture is the finished seam, and it moves only for those who want motion", () => {
  // Stitches, knot and cut end are there at rest; the snips have gone
  for (const part of [".tied-off-seam line", ".tied-off-knot", ".tied-off-end"]) {
    assert.doesNotMatch(rule(part), /opacity:\s*0|scale\(0\)/, `${part} shows at rest`);
  }
  assert.match(rule(".tied-off-snips"), /opacity: 0;/);
  assert.equal(frame("bty-snips", "100%"), "opacity: 0; transform: translate(0.3em, -0.5em);");
  assert.equal(frame("bty-blade-a", "55%, 100%"), "transform: rotate(0deg);");
  assert.equal(frame("bty-blade-b", "55%, 100%"), "transform: rotate(0deg);");
  // The knot is tied after the last stitch is sewn, the snips close after the knot
  const motion = block(CSS, "@media (prefers-reduced-motion: no-preference)", CSS.indexOf(".tied-off-blade {"));
  const timing = (selector: string) => {
    const match = / ([\d.]+)s [a-z-]+(?:\([^)]*\))? ([\d.]+)s both;/.exec(rule(selector, motion));
    assert.ok(match, `${selector} is animated`);
    return { duration: Number(match[1]), delay: Number(match[2]) };
  };
  const lastStitch = 6 * 0.13 + 0.14;
  assert.match(rule(".tied-off-seam line", motion), /bty-stitch 0\.14s linear calc\(var\(--i\) \* 0\.13s\) both/);
  assert.ok(timing(".tied-off-knot").delay > lastStitch, "knot after the seventh stitch");
  const snips = timing(".tied-off-snips");
  assert.ok(snips.delay > timing(".tied-off-knot").delay, "cut after the knot");
  // The blades close while the snips are there to be seen, and the cut end shows once they have
  for (const blade of [".tied-off-blade-a", ".tied-off-blade-b"]) assert.deepEqual(timing(blade), snips, blade);
  const shut = snips.delay + snips.duration * 0.55;
  assert.ok(timing(".tied-off-end").delay >= shut - 0.01, "the cut end shows once the blades have closed");
});

test("Book with no time draws chalk by the times instead of red words by the button", () => {
  const form = read("src/components/AtelierBookingForm.tsx");
  const noTime = form.slice(form.indexOf("} else if (bookable && !slot) {"), form.indexOf("setStatus(\"loading\");"));
  assert.match(noTime, /setChalk\(\(n\) => n \+ 1\);\s*showTimes\(\);\s*return;/);
  // The chalk lies in the legend of the times, hidden from screen readers, which hear the message instead
  const legend = form.slice(form.indexOf("<legend className=\"relative w-full"), form.indexOf("</legend>", form.indexOf("<legend className=\"relative w-full")));
  assert.match(legend, /Choose a time/);
  assert.match(legend, /className="chalk"\s*aria-hidden="true"/);
  assert.match(legend, /choose one<span className="chalk-note-tail"> first<\/span>/);
  // Only "choose a time", and only while its chalk is on screen, is hidden from sight
  assert.match(noTime, /setError\(CHOOSE_A_TIME\);/);
  assert.match(
    form,
    /role="alert"[\s\S]{0,500}className=\{chalk > 0 && bookable && !collecting && error === CHOOSE_A_TIME \? "sr-only" : "text-xs text-rose-700"\}/,
  );
  // A time picked, a switch between fitting and collection, another service or a send brushes it off
  assert.match(form, /setPicked\(s\.start\);\s*setError\(null\);\s*setUnanswered\(false\);\s*setChalk\(0\);/);
  assert.match(form, /setMode\(option\.value\);\s*setError\(null\);\s*setUnanswered\(false\);\s*setChalk\(0\);/);
  assert.match(form, /setMode\("fitting"\);\s*setError\(null\);\s*setUnanswered\(false\);\s*setChalk\(0\);/);
  const chooseService = form.slice(form.indexOf("function chooseService("), form.indexOf("async function handleSubmit("));
  assert.match(chooseService, /setChalk\(0\);\s*setError\(\(current\) => \(current === CHOOSE_A_TIME \? null : current\)\);/);
  const send = form.slice(form.indexOf("} else if (bookable && !slot) {"), form.indexOf("const reply = await sendBooking("));
  assert.match(send, /setChalk\(0\);\s*setStatus\("loading"\);/, "a server's answer is never hidden behind old chalk");
  // The times come into view only if they are off screen or under the header, lined up below the
  // header, smoothly only for those who want motion; then the first time has the focus
  const show = form.slice(form.indexOf("function showTimes()"), form.indexOf("function chooseService("));
  assert.match(show, /const header = Math\.max\(0, document\.querySelector\("header"\)\?\.getBoundingClientRect\(\)\.bottom \?\? 0\);/);
  assert.match(
    show,
    /if \(top < header \+ \d+ \|\| top > window\.innerHeight - \d+\) \{\s*const still = window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches;\s*window\.scrollTo\(\{ top: window\.scrollY \+ top - header - \d+, behavior: still \? "auto" : "smooth" \}\);\s*\}/,
  );
  assert.equal((show.match(/scroll(To|IntoView|By)\(/g) ?? []).length, 1, "no scroll outside the guard");
  assert.match(show, /querySelector<HTMLButtonElement>\("\.pin-slot"\)\?\.focus\(\{ preventScroll: true \}\)/);

  // The stroke takes no room and its grain is in the drawing
  const mark = rule(".chalk-mark");
  assert.match(mark, /position: absolute;/);
  assert.match(mark, /url\("data:image\/svg\+xml,[^"]*feTurbulence[^"]*"\)/);
  assert.doesNotMatch(mark, /animation/);
  assert.equal(frame("bty-chalk", "to"), "clip-path: inset(0 0 0 0);");
  assert.match(block(CSS, "@media (forced-colors: active)", CSS.indexOf(".chalk {")), /\.chalk-mark \{[^}]*border-top: 2px dashed CanvasText;/);
  // A narrow form, or larger text, shrinks the note, then shortens it, then lets the stroke speak
  // alone — in the legend's em, so the steps grow with the words they keep clear of
  assert.match(rule(".chalk"), /container: chalk \/ inline-size;/);
  const steps = [...CSS.matchAll(/@container chalk \(max-width: ([\d.]+)em\) \{\s*([^{]+)\{([^}]*)\}/g)].map(([, at, selector, body]) => [
    Number(at),
    selector.trim(),
    body.replace(/\s+/g, " ").trim(),
  ]);
  assert.deepEqual(steps, [
    [19.5, ".chalk-note", "font-size: 0.75rem;"],
    [17.6, ".chalk-note-tail", "display: none;"],
    [15.5, ".chalk-note", "display: none;"],
  ]);
});

test("nothing in the chalk or the knot moves for a visitor who asked for less motion", () => {
  const part = CSS.slice(CSS.indexOf(".chalk {"), CSS.indexOf("@keyframes bty-blade-b"));
  let rest = part;
  for (const name of [".chalk-mark", ".tied-off-blade {"]) {
    const motion = block(CSS, "@media (prefers-reduced-motion: no-preference)", CSS.indexOf(name));
    for (const [, selector] of motion.matchAll(/([^{}]+)\{[^{}]*animation/g)) {
      assert.match(selector.trim(), /^\.(chalk|tied-off)/, selector);
    }
    rest = rest.replace(motion, "");
  }
  assert.doesNotMatch(rest, /animation:/, "an animation outside the reduced-motion guard");
  for (const name of ["bty-chalk", "bty-snips", "bty-blade-a", "bty-blade-b"]) {
    assert.doesNotMatch(block(CSS, `@keyframes ${name}`), /\b(left|right|top|bottom|width|height|margin[a-z-]*):/, `${name} lays nothing out`);
  }
});

test("the logo's gold catches the light once: only the gold, after the stitch, as it comes into view", async () => {
  // The mask is the logo's own frame, at twice the largest size shown, and small
  // (the logo is a JPEG whatever its name says, so its size comes from sharp)
  const sharp = (await import("sharp")).default;
  const maskFile = join(ROOT, "public/beautasy-logo-gold-mask.png");
  const logoFile = join(ROOT, "public/beautasy-logo-gold.png");
  const [maskMeta, logoMeta] = await Promise.all([sharp(maskFile).metadata(), sharp(logoFile).metadata()]);
  const [maskWidth, maskHeight] = [Number(maskMeta.width), Number(maskMeta.height)];
  assert.ok(Math.abs(maskWidth / maskHeight - Number(logoMeta.width) / Number(logoMeta.height)) < 0.005, "the mask lies exactly over the logo");
  assert.equal(maskWidth, 600);
  assert.ok(readFileSync(maskFile).length < 20_000);
  // It is the letters: a few percent of the logo, all of it in the lower half where "Beautasy" is
  const { data: alpha } = await sharp(maskFile).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let total = 0;
  let above = 0;
  for (let i = 0; i < alpha.length; i++) {
    total += alpha[i];
    if (i < maskWidth * Math.round(maskHeight * 0.4)) above += alpha[i];
  }
  const coverage = total / (alpha.length * 255);
  assert.ok(coverage > 0.02 && coverage < 0.08, `the gold covers ${(coverage * 100).toFixed(1)}% of the logo`);
  assert.ok(above / total < 0.02, "nothing over the figure and the wreath lights up");

  // Over the home page's logo, in its own box, once, and hidden from screen readers
  const home = read("src/app/HomeContent.tsx");
  assert.match(
    home,
    /<div className="relative w-\[250px\] sm:w-\[280px\] lg:w-\[300px\]">\s*<Image\s+src="\/beautasy-logo-gold\.png"[^>]*?\/>\s*<LogoSheen \/>\s*<\/div>/,
    "the sheen lies in the logo's own box, sized as the logo",
  );
  assert.equal((home.match(/<LogoSheen \/>/g) ?? []).length, 1);
  const html = renderToStaticMarkup(createElement(HomeContent, { priceFrom: "£8" }));
  assert.match(html, /<div class="relative w-\[250px\][^"]*"><img [^>]*src="[^"]*beautasy-logo-gold[^>]*><span class="logo-sheen" aria-hidden="true"><\/span><\/div>/);

  // At rest nothing shows; it moves only once set going, and only for those who want motion
  const sheen = rule(".logo-sheen");
  const masked = /url\("\/beautasy-logo-gold-mask\.png"\) 0 0 \/ 100% 100% no-repeat;/.source;
  for (const part of [/opacity: 0;/, /pointer-events: none;/, new RegExp(`-webkit-mask: ${masked}`), new RegExp(`(?:^|; )mask: ${masked}`), /mix-blend-mode: screen;/]) {
    assert.match(sheen, part);
  }
  const motion = block(CSS, "@media (prefers-reduced-motion: no-preference)", CSS.indexOf(".logo-sheen {"));
  assert.match(motion, /^\s*\.logo-sheen\[data-shine\] \{\s*animation: bty-sheen 1\.6s ease-in-out both;\s*\}\s*$/);
  const part = CSS.slice(CSS.indexOf(".logo-sheen {"), CSS.indexOf("@media (forced-colors: active), print", CSS.indexOf(".logo-sheen {")));
  assert.doesNotMatch(part.replace(motion, ""), /\b(animation|transition)\s*:/, "an animation outside the reduced-motion guard");
  assert.equal((CSS.match(/\bbty-sheen\b/g) ?? []).length, 2, "used once, guarded, plus its keyframes");
  assert.match(block(CSS, "@media (forced-colors: active), print", CSS.indexOf(".logo-sheen {")), /^\s*\.logo-sheen \{\s*display: none;\s*\}\s*$/);
  // The light band is off the letters where it starts and where it stops, so nothing is left lit
  const band = /linear-gradient\(\s*(\d+)deg,\s*transparent 0 (\d+)%,[\s\S]*?transparent (\d+)% 100%\s*\)\s*([-\d]+)% 0 \/ (\d+)% 100% no-repeat;/.exec(sheen);
  assert.ok(band, sheen);
  const [angle, from, to, , width] = band.slice(1).map(Number);
  assert.ok(angle >= 90 && angle <= 120, "a band near upright, so its resting place off the side is off the whole logo");
  const edges = (position: number) => [from, to].map((stop) => ((1 - width / 100) * position) / 100 + (width / 100) * (stop / 100));
  for (const stop of ["0%", "100%"]) {
    const position = Number(/background-position: ([-\d]+)% 0;/.exec(frame("bty-sheen", stop))?.[1]);
    const [left, right] = edges(position);
    assert.ok(right <= -0.1 || left >= 1.1, `at ${stop} the band runs ${left.toFixed(2)}–${right.toFixed(2)} of the logo`);
    assert.match(frame("bty-sheen", stop), /opacity: 1;/);
  }

  // When: most of the logo on screen, and the needle beside it done, on the needle's own clock
  const { IN_VIEW, SHEEN_AFTER_STITCH, inView, restAfter } = await import("../components/stitch/LogoSheen");
  assert.equal(inView([{ isIntersecting: true, intersectionRatio: 0.27 }]), false, "a first report of a logo just peeping in");
  assert.equal(inView([{ isIntersecting: true, intersectionRatio: IN_VIEW }]), true);
  assert.equal(inView([{ isIntersecting: false, intersectionRatio: 0 }]), false);
  assert.ok(SHEEN_AFTER_STITCH >= seconds("park-at") + 0.5, "not while the needle is still moving");
  assert.ok(SHEEN_AFTER_STITCH <= seconds("park-at") + seconds("park") + 0.5, "soon after it rests");
  assert.equal(restAfter(null), SHEEN_AFTER_STITCH, "a needle not started yet: the whole wait");
  assert.equal(restAfter(0), SHEEN_AFTER_STITCH);
  assert.ok(Math.abs(restAfter(2) - (SHEEN_AFTER_STITCH - 2)) < 1e-9);
  assert.equal(restAfter(seconds("park-at") + seconds("park")), 0, "a needle at rest: no wait");
  const component = read("src/components/stitch/LogoSheen.tsx");
  assert.match(component, /\{ threshold: IN_VIEW \}/);
  // Every report starts over: a logo that leaves before its turn waits for the next showing
  assert.match(
    component,
    /\(entries\) => \{\s*clearTimeout\(timer\);\s*if \(!inView\(entries\)\) return;\s*timer = setTimeout\(\(\) => \{\s*watch\.disconnect\(\);\s*sheen\.setAttribute\("data-shine", ""\);\s*\}, Math\.max\(0\.3, stitchStillSewing\(\)\) \* 1000\);/,
  );
  const sewing = component.slice(component.indexOf("function stitchStillSewing()"), component.indexOf("export default function LogoSheen"));
  assert.match(sewing, /if \(box\.bottom <= header \|\| box\.top >= window\.innerHeight\) return 0;/, "no waiting for a needle out of sight");
  assert.match(sewing, /animation\.animationName === "bty-x-park"/);
  assert.ok(CSS.includes("@keyframes bty-x-park"), "the needle's resting movement it times itself by");
});

test("under the prices the shears stay closed: the price at the fitting, nothing cut before a yes, no costs nothing", async () => {
  // No hooks, so it renders by a plain call
  const ClosedShears = (await import("../components/stitch/ClosedShears")).default;
  const text = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
  // Said only as it is true: pinned at a fitting, or every way a price is given
  // (Kristina confirmed on 08.10.2026 that saying no at a fitting costs nothing)
  const pinned = renderToStaticMarkup(ClosedShears({ pinned: true }));
  assert.equal(
    text(pinned),
    "Your price is said while you're pinned. The shears stay closed until you say yes. Saying no costs nothing. Silk, velvet, leather and beading take longer by hand — you'll hear that price first, too.",
  );
  const plain = renderToStaticMarkup(ClosedShears({}));
  assert.equal(
    text(plain),
    "You hear your price before anything is cut — at your fitting, or from your photos and measurements. The shears stay closed until you say yes. Saying no at a fitting costs nothing. Silk, velvet, leather and beading take longer by hand — you'll hear that price first, too.",
  );
  assert.doesNotMatch(text(plain), /pinned/, "nobody is pinned for curtains, a zip or a collection");
  assert.match(plain, /<svg class="closed-shears-art" viewBox="0 0 120 40" aria-hidden="true" focusable="false">/);
  assert.equal((plain.match(/id="closed-shears-gold"/g) ?? []).length, 1);
  assert.match(rule(".closed-shears-blade"), /fill: url\(#closed-shears-gold\);/, "the blade's gold is the gradient drawn with it");
  const noted = renderToStaticMarkup(ClosedShears({ note: "Students get 10% off with a valid student card." }));
  assert.ok(text(noted).endsWith("too. Students get 10% off with a valid student card."), "a service's own word follows");

  // On /atelier in place of "prices are a guide", with a stitch over the list instead of open scissors
  const atelier = read("src/app/atelier/AtelierContent.tsx");
  assert.equal((atelier.match(/<ClosedShears\b/g) ?? []).length, 1);
  assert.match(atelier, /<ClosedShears className="mt-8" \/>/, "every kind of job is under it, curtains too: not 'pinned'");
  assert.doesNotMatch(atelier, /prices are a guide|Please note/);
  assert.doesNotMatch(atelier, /<Scissors\b/, "nothing over the prices says cut");
  assert.match(atelier, /<span className="price-stitch" aria-hidden="true" \/>/);

  // On every service page, carrying the service's own note, and no note repeats the promise
  const page = read("src/app/alterations/[slug]/page.tsx");
  assert.equal((page.match(/<ClosedShears\b/g) ?? []).length, 1);
  assert.match(page, /<ClosedShears pinned=\{service\.pricedPinned\} note=\{service\.priceNote\} className="mt-5" \/>/);
  // Pinned only where the page itself prices at a fitting: never where it asks for photos or measurements first
  const pricedPinned = LOCAL_SERVICES.filter((service) => service.pricedPinned).map((service) => service.slug);
  assert.deepEqual(pricedPinned, ["wedding-dress-southampton", "school-uniform-southampton", "prom-and-evening-dress-southampton", "jeans-and-trousers-southampton"]);
  for (const service of LOCAL_SERVICES.filter((s) => s.pricedPinned)) {
    const words = [service.priceNote ?? "", ...service.steps.map((step) => step.text), ...service.faqs.map((faq) => faq.a)].join(" ");
    assert.doesNotMatch(words, /get a price before|price from (your )?photos?|email the measurements/i, `${service.slug} is priced from afar somewhere on its page`);
  }
  assert.equal((page.match(/service\.priceNote/g) ?? []).length, 1, "the note shows only inside the shears");
  for (const service of LOCAL_SERVICES) {
    assert.doesNotMatch(service.priceNote ?? "", /firm quote|before any work starts|quoted before/i, `${service.slug}: the shears say it`);
  }

  // Still, and drawn in the text's colour by a contrast theme
  const part = CSS.slice(CSS.indexOf(".closed-shears-art {"), CSS.indexOf("@media (forced-colors: active)", CSS.indexOf(".closed-shears-art {")));
  assert.doesNotMatch(part, /\b(animation|transition)\s*:/, "the shears never move here");
  const contrast = block(CSS, "@media (forced-colors: active)", CSS.indexOf(".closed-shears-art {"));
  assert.match(contrast, /\.closed-shears-blade,\s*\.closed-shears-pin \{\s*fill: CanvasText;/);
  assert.match(contrast, /\.closed-shears-shank,\s*\.closed-shears-ring,\s*\.closed-shears-screw \{\s*stroke: CanvasText;/);
  assert.match(contrast, /\.price-stitch \{[^}]*border-top: 2px dashed CanvasText;/);
});
