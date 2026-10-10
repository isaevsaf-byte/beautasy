import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Two rules in globals.css that every page depends on: words set in lavender
 * have to be readable, and a phone must not zoom in when a field is tapped.
 * Both are written outside Tailwind's layers on purpose, and both stop
 * working silently if that changes — so the file is read here as it is.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
/** The stylesheet without its comments, which mention @layer and maximum-scale by name */
const css = read("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

/** WCAG 2 contrast between two #RRGGBB colours */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(bl);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const token = (name: string) => {
  const value = css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6});`))?.[1];
  assert.ok(value, `--color-${name} is defined`);
  return value;
};

test("the lavender for words is readable as small text on the site's backgrounds", () => {
  const ink = token("lavender-ink");
  // The brand lavender as text measured 1.4:1 on cream
  assert.ok(contrast(token("lavender"), token("cream")) < 3, "the brand lavender stays a background colour");
  for (const background of ["cream", "cream-soft", "lavender-bg"]) {
    const ratio = contrast(ink, token(background));
    assert.ok(ratio >= 4.5, `lavender-ink on ${background} is ${ratio.toFixed(2)}:1`);
  }
  assert.ok(contrast(ink, "#FFFFFF") >= 4.5);
});

test("text-lavender on words reads as lavender-ink, and icons and fills keep the light lavender", () => {
  assert.match(css, /\.text-lavender:not\(svg\)\s*\{\s*color:\s*var\(--color-lavender-ink\);\s*\}/);
  // Backgrounds, borders and fills are left alone
  assert.doesNotMatch(css, /\.(bg|border|fill)-lavender\b[^{]*\{/);
  // Outside any layer: inside @layer it would lose to Tailwind's own utility
  assert.doesNotMatch(css, /@layer/);
});

/**
 * The colour a word ends up in, from its class list: text-lavender is
 * repainted as lavender-ink by the rule above, wherever it is; any other
 * text-<token> or text-[#hex] is taken as written.
 */
function wordColour(classes: string): string | undefined {
  let colour: string | undefined;
  for (const name of classes.split(/\s+/)) {
    const hex = name.match(/^text-\[(#[0-9A-Fa-f]{6})\]$/)?.[1];
    if (hex) colour = hex;
    else if (name === "text-lavender" && /\.text-lavender:not\(svg\)\s*\{\s*color:\s*var\(--color-lavender-ink\)/.test(css)) {
      colour = token("lavender-ink");
    } else {
      const named = name.match(/^text-([a-z]+(?:-[a-z]+)*)$/)?.[1];
      const value = named && css.match(new RegExp(`--color-${named}:\\s*(#[0-9A-Fa-f]{6});`))?.[1];
      if (value) colour = value;
    }
  }
  return colour;
}

test("the Our Work viewer's category label is readable on the viewer's dark panel", () => {
  // The rule that makes text-lavender readable on cream made this label
  // 3:1 on the viewer's near-black panel, where the light lavender was 11.7:1
  const viewer = read("src/components/work/WorkViewer.tsx");
  const panel = viewer.match(/role="dialog"[\s\S]*?className="[^"]*\bbg-\[(#[0-9A-Fa-f]{6})\]/)?.[1];
  assert.ok(panel, "the viewer's panel colour");
  const label = viewer.match(/<p className="([^"]*)">\{piece\.categoryLabel\}<\/p>/)?.[1];
  assert.ok(label, "the category label");
  const colour = wordColour(label);
  assert.ok(colour, `the label has a text colour: ${label}`);
  const ratio = contrast(colour, panel);
  assert.ok(ratio >= 4.5, `the label is ${ratio.toFixed(2)}:1 on ${panel}`);
  // The whole viewer is dark, so the repainted lavender has no place on its words
  assert.doesNotMatch(viewer.replace(/\/\*[\s\S]*?\*\//g, ""), /(?<![\w:-])text-lavender(?![\w-])/);
});

test("on a phone every typed-in field is 16px, so iOS does not zoom the page in", () => {
  const block = css.slice(css.indexOf("@media (max-width: 639.98px)"));
  assert.ok(block.length < css.length, "the phone-width rule exists");
  const rule = block.slice(0, block.indexOf("font-size: 16px;"));
  assert.ok(rule.length < block.length, "it sets 16px");
  for (const field of ["input", "select", "textarea"]) assert.match(rule, new RegExp(`\\b${field}\\b`), field);
  // The search box is already 18px; 16px would shrink it
  assert.match(rule, /\[type="search"\]/);
  assert.match(rule, /:where\(/, "zero specificity: the Studio's and Clerk's own field styles still win");
  assert.doesNotMatch(css, /@layer/, "unlayered, so it beats text-sm on the fields");
});

test("pinch-zoom stays allowed", () => {
  // maximum-scale=1 would stop the zoom on focus, and stop everyone who needs
  // to enlarge the page from doing so
  const layout = read("src/app/layout.tsx").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  for (const [file, source] of [["src/app/layout.tsx", layout], ["src/app/globals.css", css]]) {
    assert.doesNotMatch(source, /maximum-?scale|maximumScale|userScalable|user-scalable/i, file);
  }
  // The viewport runs edge to edge (so the safe-area insets are real) and
  // says nothing about scale beyond the starting one
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(layout, /initialScale: 1,/);
});

test("the pages written for this fix use the ink, not the brand lavender, for words", () => {
  const home = read("src/app/HomeContent.tsx");
  // The words are sewn since 07.10 (components/stitch), inside the same ink
  assert.match(home, /<span className="italic text-lavender-ink">\s*<Stitched>in Southampton<\/Stitched>\s*<\/span>/);
  const legal = read("src/app/pages/[slug]/page.tsx");
  assert.match(legal, /prose-a:text-lavender-ink prose-a:underline/);
  assert.doesNotMatch(legal, /prose-a:text-lavender\b(?!-)/);
  assert.doesNotMatch(legal, /prose-a:no-underline/);
});

test("a word that turns lavender under the pointer turns the ink, not the fill", () => {
  // .text-lavender:not(svg) repaints the class itself as the ink, but not its
  // hover: and group-hover: variants: those painted the hovered word in the
  // 1.4:1 fill, so a title seemed to fade out as the pointer reached it
  const files = [
    "src/app/atelier/AtelierContent.tsx",
    "src/app/alterations/[slug]/page.tsx",
    "src/app/alterations/page.tsx",
    "src/app/HomeContent.tsx",
    "src/components/reviews/ReviewCard.tsx",
    "src/components/reviews/ReviewStrip.tsx",
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /(?<![\w-])(?:group-)?hover:text-lavender(?![\w-])/, file);
  }
  // Large shadows carry the plum, not grey
  assert.doesNotMatch(read("src/app/reviews/page.tsx"), /rgba\(74,\s*74,\s*74/);
  assert.doesNotMatch(read("src/app/atelier/AtelierContent.tsx"), /shadow-xl hover:shadow-lavender\/10/);
});

test("a typed field and a pick-one chip each have one shape across the site", () => {
  // Fields were xl, lg or full and choices lg, full or xl depending on the
  // page; two named radii in @theme keep them from drifting apart again
  assert.match(css, /--radius-field:\s*0\.75rem;/);
  assert.match(css, /--radius-chip:\s*9999px;/);
  const booking = read("src/components/AtelierBookingForm.tsx");
  assert.match(booking, /const FIELD_CLASS =\s*"[^"]*\brounded-field\b/, "booking fields");
  assert.match(booking, /pin-slot relative[^`"]*\brounded-chip\b/, "booking times");
  assert.match(read("src/app/shop/[param]/ProductDetail.tsx"), /min-w-\[52px\] min-h-11 px-3 py-2 rounded-chip\b/, "size chips");
  assert.match(read("src/components/Cart.tsx"), /rounded-field border border-lavender-soft\/50 bg-white/, "the bag's code field");
});

test("small capitals are spaced one of two ways, by size", () => {
  // They were set seven ways; a hand-picked em on one label is how that began
  assert.match(css, /--tracking-eyebrow:\s*0\.2em;/);
  assert.match(css, /--tracking-caps-sm:\s*0\.1em;/);
  const files = [
    "src/app/HomeContent.tsx",
    "src/app/alterations/[slug]/page.tsx",
    "src/app/shop/ShopContent.tsx",
    "src/components/Footer.tsx",
    "src/components/AtelierBookingForm.tsx",
    "src/components/Cart.tsx",
    "src/components/work/TileFace.tsx",
  ];
  for (const file of files) {
    for (const line of read(file).split("\n").filter((l) => /\buppercase\b/.test(l) && /\btext-(xs|sm|\[1[01]px\])\b/.test(l))) {
      if (/\b(inline-flex|press|topstitch|px-[5-8])\b/.test(line)) continue; // buttons and links keep tracking-wider
      assert.doesNotMatch(line, /tracking-\[|tracking-wider|tracking-widest/, `${file}: ${line.trim()}`);
    }
  }
});
