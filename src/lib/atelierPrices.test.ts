import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomeContent from "../app/HomeContent";
import { COMMON_JOBS, commonPrices, pricingCategories } from "./atelierPrices";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

test("every common job on the home page is a line of the atelier's price guide", () => {
  const lines = commonPrices();
  assert.equal(lines.length, COMMON_JOBS.length, "a name the guide no longer has");
  assert.ok(lines.length >= 4 && lines.length <= 6);
  const guide = pricingCategories.flatMap((category) => category.items);
  for (const line of lines) assert.ok(guide.includes(line), line.name);
  assert.deepEqual(commonPrices(["Not a job"]), [], "a dropped name is left out, not invented");
});

test("the home page's price list is the guide's, sewn as /atelier's, and leads to every price", () => {
  const html = renderToStaticMarkup(createElement(HomeContent, { priceFrom: "£8" }));
  const section = html.slice(html.indexOf("Local services"), html.indexOf("Browse the shelves"));
  for (const line of commonPrices()) {
    assert.ok(section.includes(line.name.replace(/&/g, "&amp;")), line.name);
    assert.ok(section.includes(line.price), line.price);
  }
  assert.equal((section.match(/class="leader-stitch flex-1 min-w-6 mb-1\.5" aria-hidden="true"/g) ?? []).length, commonPrices().length);
  assert.match(section, /href="\/atelier#prices"[^>]*>See all prices/);
  assert.doesNotMatch(section, /beautasy-atelier-logo/, "no second logo card under the hero's");
  // The anchor it lands on is there, under the header
  assert.match(read("src/app/atelier/AtelierContent.tsx"), /<section id="prices" className="[^"]*\bscroll-mt-24\b/);
  // /atelier reads the same list rather than its own copy
  assert.match(read("src/app/atelier/AtelierContent.tsx"), /import \{ pricingCategories, type PriceItem \} from "@\/lib\/atelierPrices";/);
  assert.doesNotMatch(read("src/app/atelier/AtelierContent.tsx"), /from £15\.50/);
});
