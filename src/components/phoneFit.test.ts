import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Kristina reads the site on a phone with large text, where the screen is
 * 320px wide. One line that refuses to wrap there makes the whole page wider
 * than the screen, and the phone shows it zoomed out and sliding sideways.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

test("on a small phone the atelier's price names wrap, and the prices don't", () => {
  const atelier = read("src/app/atelier/AtelierContent.tsx");
  const line = atelier.slice(atelier.indexOf("function PriceLine"), atelier.indexOf("/* ═", atelier.indexOf("function PriceLine")));
  assert.ok(line.includes("{item.name}"), "PriceLine still shows the name");
  // "Shorten Jeans (Keep Original Hem)" on one line was 360px wide
  assert.match(line, /<span className="min-w-0 text-\[15px\] text-charcoal">\s*\{item\.name\}/);
  assert.match(line, /whitespace-nowrap tabular-nums">\s*\{item\.price\}/, "£17.00 stays on one line");
});
