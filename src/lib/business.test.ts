import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  BUSINESS,
  GOOGLE_SERVICES,
  googleServiceCatalog,
  openingHoursSpecification,
} from "./business";

test("every day of the week is covered exactly once", () => {
  const days = BUSINESS.hours.blocks.flatMap((b) => b.days);
  assert.equal(days.length, 7);
  assert.equal(new Set(days).size, 7);
});

test("opening hours match what Google Business Profile shows", () => {
  const spec = openingHoursSpecification();
  const find = (day: string) =>
    spec.find((s) => (s.dayOfWeek as string[]).includes(day));

  assert.deepEqual(
    { opens: find("Monday")?.opens, closes: find("Monday")?.closes },
    { opens: "09:00", closes: "19:00" }
  );
  assert.deepEqual(
    { opens: find("Saturday")?.opens, closes: find("Saturday")?.closes },
    { opens: "11:00", closes: "17:00" }
  );
  assert.deepEqual(
    { opens: find("Sunday")?.opens, closes: find("Sunday")?.closes },
    { opens: "11:00", closes: "16:00" }
  );
});

test("the printed label agrees with the structured hours", () => {
  assert.match(BUSINESS.hours.label, /9am–7pm/);
  assert.match(BUSINESS.hours.label, /11am–5pm/);
  assert.match(BUSINESS.hours.label, /11am–4pm/);
});

test("the Google listing is claimed as the same entity", () => {
  assert.ok(BUSINESS.sameAs.includes(BUSINESS.googleMapsUrl));
});

test("the review link points at the Beautasy listing", () => {
  assert.match(BUSINESS.googleReviewUrl, /^https:\/\/g\.page\/r\/[A-Za-z0-9_-]+\/review$/);
});

test("the site lists exactly the twelve services the Google profile does", () => {
  assert.equal(GOOGLE_SERVICES.length, 12);
  assert.equal(new Set(GOOGLE_SERVICES.map((s) => s.name)).size, 12);
});

test("every listed service points somewhere the site actually serves", () => {
  for (const service of GOOGLE_SERVICES) {
    assert.match(
      service.path,
      /^\/(alterations(\/[a-z-]+)?|atelier)$/,
      `${service.name} points at ${service.path}`
    );
  }
});

test("the catalogue gives every service an absolute url", () => {
  const catalog = googleServiceCatalog("https://www.beautasy.co.uk");
  assert.equal(catalog.itemListElement.length, 12);
  for (const entry of catalog.itemListElement) {
    assert.match(entry.itemOffered.url, /^https:\/\/www\.beautasy\.co\.uk\//);
  }
});

/**
 * The hours are Google's (checked against the live listing on 26 September
 * 2026), and they are printed from BUSINESS.hours and nowhere else. The booking
 * page used to carry its own "Mon–Sat: 9am – 6pm", which was wrong on every
 * day of the week, disagreed with the listing Google shows next to it, and was
 * quoted back by search engines as the atelier's hours. Any second spelling of
 * a day range or a time range in the code fails here.
 */
test("the hours are written in one place", () => {
  const DAY = "(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*";
  const literals = [
    new RegExp(`\\b${DAY}\\s*(?:–|-|to)\\s*${DAY}\\b`),
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:–|-|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
  ];
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return files(path);
      return /\.tsx?$/.test(entry) && !entry.includes(".test.") ? [path] : [];
    });
  const home = join(process.cwd(), "src", "lib", "business.ts");

  const elsewhere = files(join(process.cwd(), "src"))
    .filter((path) => path !== home)
    .flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, i) => `${path.replace(process.cwd(), "")}:${i + 1} ${line.trim()}`)
        .filter((line) => literals.some((re) => re.test(line)))
    );

  assert.deepEqual(elsewhere, []);
});
