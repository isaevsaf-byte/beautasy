import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Header from "./Header";
import Footer from "./Footer";
import SkipLink from "./SkipLink";
import { isCurrentPage } from "../lib/currentPage";
import { BUSINESS } from "../lib/business";
import { DEFAULT_FREE_THRESHOLD, DEFAULT_INT_RATE, DEFAULT_UK_RATE } from "../lib/siteSettings";

/**
 * The header and the footer are on every page, so whatever they get wrong
 * they get wrong everywhere: a header sent invisible, a menu a keyboard can't
 * close, a footer with no phone number and the wrong delivery price.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const headings = (html: string) => [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));

test("the header is sent visible, not faded in once the scripts arrive", () => {
  const html = renderToStaticMarkup(createElement(Header));
  const tag = html.match(/<header\b[^>]*>/)?.[0] ?? "";
  assert.ok(tag, "a <header> is rendered");
  assert.doesNotMatch(tag, /opacity/, "an opacity on the header hides it until hydration — four seconds on a phone");
  assert.doesNotMatch(read("src/components/Header.tsx"), /<motion\.header/);
});

test("the menu button says whether the menu is open, and which element it opens", () => {
  const html = renderToStaticMarkup(createElement(Header));
  const button = html.match(/<button[^>]*aria-controls="mobile-nav"[^>]*>/)?.[0] ?? "";
  assert.ok(button, "the toggle names the menu it controls");
  assert.match(button, /aria-expanded="false"/);
  assert.match(button, /aria-label="Open menu"/);
  const source = read("src/components/Header.tsx");
  assert.match(source, /id="mobile-nav"/);
});

test("Escape closes the phone menu and gives focus back to its button", () => {
  const source = read("src/components/Header.tsx");
  const effect = source.slice(source.indexOf("if (!mobileOpen) return;"), source.indexOf("}, [mobileOpen]);"));
  assert.match(effect, /e\.key !== "Escape"/);
  assert.match(effect, /setMobileOpen\(false\);\s*toggleRef\.current\?\.focus\(\);/);
  assert.match(effect, /removeEventListener\("keydown", onKey\)/, "the listener goes when the menu closes");
});

test("the menu marks the page you are on", () => {
  assert.equal(isCurrentPage("/shop", "/shop"), true);
  assert.equal(isCurrentPage("/shop", "/shop/ikat-pouch"), true, "a piece is inside the shop");
  assert.equal(isCurrentPage("/atelier", "/atelier"), true);
  assert.equal(isCurrentPage("/atelier#book", "/atelier"), true);
  assert.equal(isCurrentPage("/work", "/workshop"), false, "a prefix of the word is not the page");
  assert.equal(isCurrentPage("/", "/shop"), false, "home is only home");
  assert.equal(isCurrentPage("/shop", null), false);

  const source = read("src/components/Header.tsx");
  assert.equal(source.match(/aria-current=\{current\(link\.href\)\}/g)?.length, 3, "both desktop sides and the phone menu");
});

test("a keyboard can skip the menu on every page", () => {
  const html = renderToStaticMarkup(createElement(SkipLink));
  assert.match(html, /^<a href="#main"[^>]*class="sr-only focus:not-sr-only[^"]*"[^>]*>Skip to content<\/a>$/);
  const layout = read("src/app/layout.tsx");
  // First in <body>, before anything else that takes focus
  assert.match(layout, /<body[\s\S]*?>\s*<SkipLink \/>\s*\{content\}/);
  for (const page of [
    "src/app/HomeContent.tsx",
    "src/app/contact/page.tsx",
    "src/app/not-found.tsx",
    "src/app/pages/[slug]/page.tsx",
    "src/app/atelier/AtelierContent.tsx",
    "src/app/shop/ShopContent.tsx",
    "src/app/alterations/page.tsx",
    "src/app/alterations/[slug]/page.tsx",
    "src/app/work/page.tsx",
    "src/app/reviews/page.tsx",
    "src/app/refer/page.tsx",
    "src/app/gift-cards/page.tsx",
  ]) {
    assert.match(read(page), /<main id="main"/, page);
    assert.equal(read(page).match(/<main\s/g)?.length, 1, `${page}: one <main>, so #main has one place to land`);
  }
});

test("the footer's headings follow the page's, and its wordmark is not one", () => {
  const html = renderToStaticMarkup(createElement(Footer));
  // After a page's h2 or h3, a footer h4 or h5 is a skipped level
  assert.deepEqual([...new Set(headings(html))], [2]);
  assert.match(html, /<p class="font-serif[^"]*">BEAUTASY<\/p>/);
});

test("the footer says how to reach the atelier, and when", () => {
  const html = renderToStaticMarkup(createElement(Footer));
  assert.ok(html.includes(`href="${BUSINESS.telephoneHref}"`), "tap to call");
  assert.ok(html.includes(`https://wa.me/${BUSINESS.whatsappNumber}`), "WhatsApp");
  assert.ok(html.includes(`href="mailto:${BUSINESS.email}"`), "email");
  for (const days of BUSINESS.hours.label.split(" · ")) assert.ok(html.includes(days), days);
  assert.match(html, /Southampton · by appointment/);
  assert.match(html, /href="\/atelier#book"[^>]*>[\s\S]*?Choose a time/);
  assert.doesNotMatch(html, /Worldwide Shipping/);
  // The blurb opens on the atelier
  assert.match(html, /<p class="text-sm text-charcoal-light leading-relaxed max-w-xs mb-4">\s*Alterations and repairs/);
});

test("the footer's delivery price before settings arrive is the real one", () => {
  // It printed "UK: £3.00" to every page and every crawler while the Studio
  // said £3.50. The client file can't import the defaults (they bring the
  // Sanity client), so its copies are held to them here.
  assert.equal(DEFAULT_UK_RATE, 350);
  const footer = read("src/components/Footer.tsx");
  assert.equal(Number(footer.match(/const FALLBACK_UK_RATE = (\d+);/)?.[1]), DEFAULT_UK_RATE);
  assert.equal(Number(footer.match(/const FALLBACK_INT_RATE = (\d+);/)?.[1]), DEFAULT_INT_RATE);
  assert.equal(Number(footer.match(/const FALLBACK_FREE_THRESHOLD = (\d+);/)?.[1]), DEFAULT_FREE_THRESHOLD);

  const html = renderToStaticMarkup(createElement(Footer));
  assert.match(html, /UK £3\.50/);
  assert.doesNotMatch(html, /£3\.00/);
  // And what the Studio says wins once it is known
  const set = renderToStaticMarkup(
    createElement(Footer, { settings: { shipping: { ukRate: 395, internationalRate: 1500, freeShippingThreshold: 6000 } } }),
  );
  assert.match(set, /UK £3\.95 · international £15/);
  assert.match(set, /free in the UK over £60/);
});
