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
  assert.doesNotMatch(layout, /export const viewport/, "Next's default viewport is width=device-width, initial-scale=1");
});

test("the pages written for this fix use the ink, not the brand lavender, for words", () => {
  const home = read("src/app/HomeContent.tsx");
  assert.match(home, /<span className="italic text-lavender-ink">in Southampton<\/span>/);
  const legal = read("src/app/pages/[slug]/page.tsx");
  assert.match(legal, /prose-a:text-lavender-ink prose-a:underline/);
  assert.doesNotMatch(legal, /prose-a:text-lavender\b(?!-)/);
  assert.doesNotMatch(legal, /prose-a:no-underline/);
});
