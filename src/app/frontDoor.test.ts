import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomeContent from "./HomeContent";
import ContactPage from "./contact/page";
import NotFound, { metadata as notFoundMetadata } from "./not-found";
import { BUSINESS } from "../lib/business";

/**
 * The doors people come in by: the home page, /contact and the page for an
 * address that isn't there. The money comes from the atelier, so each of
 * them now opens on booking and messaging Kristina — the home page used to
 * open as a lingerie shop with no price, phone or hours on it.
 */

const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const headings = (html: string) => [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map(
  ([, level, text]) => ({ level: Number(level), text: textOf(text).trim() }),
);

test("the home page opens on the atelier: what, how much, when, and how to start", () => {
  const html = renderToStaticMarkup(createElement(HomeContent, { priceFrom: "£8" }));
  const [h1] = headings(html);
  assert.equal(h1.level, 1);
  assert.equal(h1.text, "Alterations & repairs in Southampton");
  assert.match(textOf(html), /Made to feel, not just wear\./);

  // Before the first button: the price, the hours, the place
  const hero = textOf(html.slice(0, html.indexOf("Choose a time")));
  assert.match(hero, /Alterations from £8/);
  assert.ok(hero.includes(BUSINESS.hours.label), "the hours, as Google has them");
  assert.match(hero, /Southampton · by appointment/);

  // Booking is the filled button, WhatsApp the second, the shop a line under
  // them (counted from the heading: the menu above it links the shop too)
  const from = html.indexOf("<h1");
  const book = html.indexOf('href="/atelier#book"', from);
  const whatsapp = html.indexOf(`https://wa.me/${BUSINESS.whatsappNumber}`, from);
  const shop = html.indexOf('href="/shop"', from);
  assert.ok(book > -1 && whatsapp > book && shop > whatsapp, "book, then WhatsApp, then the shop");
  assert.match(html.slice(html.lastIndexOf("<a", book), book), /\bbg-lavender\b/, "the filled button");
  assert.match(html.slice(whatsapp, html.indexOf("</a>", whatsapp)), /Send a photo on WhatsApp/);
  assert.doesNotMatch(html, /Shop Collection/);
});

test("the home page's own price line is left out when no price is known", () => {
  const html = renderToStaticMarkup(createElement(HomeContent, { priceFrom: null }));
  assert.doesNotMatch(textOf(html), /Alterations from/);
});

test("on the home page the atelier, its work and its reviews come before the shop", () => {
  const html = renderToStaticMarkup(
    createElement(HomeContent, {
      priceFrom: "£8",
      recentWork: createElement("p", null, "WORK-STRIP"),
      reviews: createElement("p", null, "REVIEW-STRIP"),
    }),
  );
  const at = (text: string) => html.indexOf(text);
  assert.ok(at("Local services") < at("WORK-STRIP"));
  assert.ok(at("WORK-STRIP") < at("REVIEW-STRIP"));
  assert.ok(at("REVIEW-STRIP") < at("Browse the shelves"));
});

test("the home page's headings go down one level at a time", () => {
  const html = renderToStaticMarkup(createElement(HomeContent, { priceFrom: "£8" }));
  const levels = headings(html).map((h) => h.level);
  assert.equal(levels.filter((level) => level === 1).length, 1);
  levels.reduce((previous, level) => {
    assert.ok(level <= previous + 1, `h${previous} is followed by h${level}`);
    return level;
  });
});

test("the home page's first screen is sent visible", () => {
  const html = renderToStaticMarkup(createElement(HomeContent, { priceFrom: "£8" }));
  const firstScreen = html.slice(0, html.indexOf("Send a photo on WhatsApp"));
  assert.doesNotMatch(firstScreen, /opacity:0/, "the heading and buttons must not wait for scripts");
});

test("/contact puts booking, WhatsApp and a phone call at the top, with the hours", () => {
  const html = renderToStaticMarkup(createElement(ContactPage));
  // Everything above the first of the longer cards
  const top = html.slice(0, html.indexOf("Call Kristina"));
  assert.ok(top.length > 0 && top.length < html.length);
  assert.match(top, /href="\/atelier#book"/);
  assert.ok(top.includes(`https://wa.me/${BUSINESS.whatsappNumber}`));
  assert.ok(top.includes(`href="${BUSINESS.telephoneHref}"`), "tap to call");
  assert.ok(textOf(top).includes(BUSINESS.hours.label), "the hours on the page, not behind a link");
  // None of it waits for the scripts
  assert.doesNotMatch(top, /opacity:0/);
});

test("/contact's WhatsApp and Telegram buttons are readable", () => {
  const html = renderToStaticMarkup(createElement(ContactPage));
  // The brand colours as text were 1.8:1 (WhatsApp) and 3.4:1 (Telegram)
  assert.doesNotMatch(html, /text-\[#25D366\]/);
  assert.doesNotMatch(html, /text-\[#0088cc\]/);
  assert.match(html, /bg-\[#075E54\] text-white/, "the solid WhatsApp button: 7.7:1");
  assert.match(html, /text-\[#075E54\]/);
  assert.match(html, /text-\[#006699\]/);
  assert.doesNotMatch(html, /opacity-70/, "a faded number on a pale pill is unreadable");
});

test("a missing page keeps the menu and offers the atelier first", () => {
  const html = renderToStaticMarkup(createElement(NotFound));
  assert.match(html, /<header\b/);
  assert.match(html, /<footer\b/);
  const book = html.indexOf('href="/atelier#book"', html.indexOf("Page not found"));
  const whatsapp = html.indexOf("https://wa.me/", book);
  const shop = html.indexOf('href="/shop"', whatsapp);
  assert.ok(book > -1 && whatsapp > book && shop > whatsapp, "book, WhatsApp, then the shop");
  assert.equal(notFoundMetadata.title, "Page not found | Beautasy");
});
