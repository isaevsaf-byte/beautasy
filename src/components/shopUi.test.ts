import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import nextConfig from "../../next.config";
import ProductDetail from "../app/shop/[param]/ProductDetail";
import ShopContent from "../app/shop/ShopContent";

/**
 * The shop's pages, rendered the way the server sends them: what a phone
 * shows before any script has run, and what it is made to download. The rules
 * behind them are tested on their own in @/lib (availability, productBag,
 * shopImages, shopCard, bagCodes, delivery); these check the pages use them.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

// next/image needs the site's image hosts, which Next normally provides
const render = (element: ReactElement) =>
  renderToString(
    createElement(
      ImageConfigContext.Provider,
      { value: { ...imageConfigDefault, remotePatterns: nextConfig.images?.remotePatterns ?? [] } as never },
      element
    )
  );

const photo = (n: number) =>
  `https://cdn.sanity.io/images/5uun6fw6/production/p${n}-800x1000.jpg?w=800&h=1000&auto=format`;

type DetailProduct = ComponentProps<typeof ProductDetail>["product"];

const thong: DetailProduct = {
  _id: "p1",
  name: "Pearl Blossom Thong",
  slug: "the-pearl-blossom-thong",
  price: 2000,
  images: [photo(1), photo(2), photo(3), photo(4)],
  description: [],
  category: "Lingerie",
  stock: 2,
  productBadges: ["new-in"],
  handmadeDisclaimer: "Individually handcrafted for you in our Southampton studio. Ready to dispatch within 3–5 business days.",
  productionTime: "3–5 days",
  availableSizes: ["XS", "S", "M"],
  sizePrices: [],
  sizeStock: [],
  availableColors: [],
  careInstructions: null,
  shippingInfo: null,
  packagingInfo: null,
  giftBoxAvailable: false,
  giftBoxPrice: 0,
  madeToMeasureAvailable: true,
  madeToMeasurePrice: 1000,
};

const related = [1, 2, 3, 4].map((n) => ({
  _id: `r${n}`,
  name: `Related ${n}`,
  slug: `related-${n}`,
  price: 1500,
  image: photo(10 + n),
  category: "Lingerie",
}));

const detail = (product: Partial<DetailProduct> = {}) =>
  render(createElement(ProductDetail, { product: { ...thong, ...product }, relatedProducts: related }));

const between = (html: string, from: string, to: string) => {
  const start = html.indexOf(from);
  return html.slice(start, html.indexOf(to, start));
};

test("a product page arrives with its name, price and Add to Bag visible", () => {
  const html = detail();
  const layout = between(html, '<section class="max-w-6xl mx-auto px-6 pb-24">', "</section>");
  assert.ok(layout.includes("Pearl Blossom Thong</h1>"), "the layout was found");
  // Faded in from opacity 0, the column waited 5.5–6 s for scripts on a throttled phone
  assert.doesNotMatch(layout, /opacity:\s*0[;"]/);
});

test("a product page asks for small thumbnails, later, and preloads only its main photo", () => {
  const html = detail();
  const thumbs = [...html.matchAll(/<img[^>]*alt="Pearl Blossom Thong thumbnail \d"[^>]*>/g)].map(([tag]) => tag);
  assert.equal(thumbs.length, 4);
  for (const tag of thumbs) {
    assert.match(tag, /src="[^"]*w=160&amp;h=200"/);
    assert.match(tag, /loading="lazy"/);
  }
  const cards = [...html.matchAll(/<img[^>]*alt="Related \d"[^>]*>/g)].map(([tag]) => tag);
  assert.equal(cards.length, 4);
  for (const tag of cards) {
    assert.match(tag, /src="[^"]*w=400&amp;h=500"/);
    assert.match(tag, /loading="lazy"/);
  }
  assert.equal((html.match(/<link rel="preload" as="image"/g) ?? []).length, 1, "the main photo alone");
});

test("a product page says once whether it ships now or is made for you", () => {
  // Three sizes and a product-wide count: it cannot promise the size picked
  const some = detail();
  assert.match(some, /Some sizes ready to ship/);
  assert.doesNotMatch(some, /Made in 3–5 days|left in ready-made stock|In Stock/);
  assert.doesNotMatch(some, /Ready to dispatch within 3–5 business days/, "Kristina's made-to-order note stays out");

  const made = detail({ stock: 0 });
  assert.match(made, /Made to order in 3–5 days/);
  assert.match(made, /Ready to dispatch within 3–5 business days/, "her note is the made-to-order sentence");

  // Nothing to choose, two on the shelf: ready now, and few enough to say so
  const scrunchie = detail({ availableSizes: [], madeToMeasureAvailable: false, stock: 2 });
  assert.match(scrunchie, /Ready to ship in 1–2 days/);
  assert.match(scrunchie, /<span class="text-xs text-rose-700 font-medium">Only <!-- -->2<!-- --> left ready-made/);
});

test("the phone's sticky bar asks the main button's questions", () => {
  const html = detail();
  const bar = html.slice(html.indexOf('class="md:hidden fixed bottom-0'));
  assert.match(bar, /aria-disabled="true"[^>]*>Select a Size<\/button>/);
  assert.match(bar, /£<!-- -->20\.00/);

  const source = read("src/app/shop/[param]/ProductDetail.tsx");
  const sticky = source.slice(source.indexOf("Sticky mobile buy bar"));
  assert.match(sticky, /onClick=\{handleAddToCart\}/, "the same handler, with its measurement check");
  assert.match(sticky, /£\{\(bagTotal \/ 100\)\.toFixed\(2\)\}/, "the price includes the +£10");
  assert.match(sticky, /\{measuring && \(/, "and says so");
  assert.match(sticky, /\{bagButtonLabel\(blockers\)\}/);
});

test("Add to Bag refuses a made-to-measure piece until its measurements are in", () => {
  const source = read("src/app/shop/[param]/ProductDetail.tsx");
  const handler = source.slice(source.indexOf("function handleAddToCart()"), source.indexOf("return (\n    <>"));
  const stop = handler.indexOf("if (blockers.measurements) {");
  const add = handler.indexOf("bagLines(");
  assert.ok(stop > -1 && add > stop, "the measurement check comes before anything is added");
  assert.match(handler.slice(stop, add), /return;/);
  assert.match(handler, /madeToMeasure: measuring \? \{ price: mtmPrice, measurements \} : null/);
  // The one way into the bag from this page
  assert.equal((source.match(/addItem\(/g) ?? []).length, 1);
  assert.match(source, /<button\s+type="button"\s+onClick=\{handleAddToCart\}\s+aria-disabled=\{isBlocked\(blockers\)\}/);
  assert.match(source, /\{bagButtonLabel\(blockers, bagTotal\)\}/);
});

test("the Shipping section quotes Stripe's delivery days, not the Studio's", () => {
  const source = read("src/app/shop/[param]/ProductDetail.tsx");
  assert.match(source, /title="Shipping"[^]*?lead=\{DELIVERY_TIMES\}[^]*?content=\{withoutQuotedDays\(product\.shippingInfo\)\}/);
});

/* ─── The shop grid ─── */

type ShopProduct = ComponentProps<typeof ShopContent>["products"][number];

const piece = (n: number, extra: Partial<ShopProduct> = {}): ShopProduct => ({
  _id: `s${n}`,
  name: `Piece ${n}`,
  slug: `piece-${n}`,
  price: 1000 + n,
  images: [photo(n * 10 + 1), photo(n * 10 + 2), photo(n * 10 + 3)],
  category: "Kids",
  subcategory: "underwear",
  availableSizes: ["2-3", "4-5"],
  stock: 3,
  ...extra,
});

const shop = (products: ShopProduct[], filters = {}) =>
  render(createElement(ShopContent, { products, activeCategory: "kids", basePath: "/shop/kids", filters }));

test("a shop section arrives with its heading and products visible", () => {
  const html = shop([piece(1), piece(2)]);
  assert.match(html, /<h1[^>]*>Mini Beautasy<\/h1>/);
  assert.match(html, /Piece 2<\/h4>/);
  // On a throttled phone the faded-in top of /shop stayed blank for 14–19 s
  assert.doesNotMatch(html, /opacity:\s*0[;"]/);
});

test("the grid's thumbnails are small, lazy and not preloaded", () => {
  const html = shop([1, 2, 3, 4, 5].map((n) => piece(n)));
  const thumbs = [...html.matchAll(/<img[^>]*thumbnail \d"[^>]*>/g)].map(([tag]) => tag);
  assert.equal(thumbs.length, 15);
  for (const tag of thumbs) {
    assert.match(tag, /src="[^"]*w=160&amp;h=200"/);
    assert.match(tag, /loading="lazy"/);
    assert.match(tag, /width="56"/);
  }
  // Only the first row's main photos, which ask for priority; 75 thumbnails used to join them
  assert.equal((html.match(/<link rel="preload" as="image"/g) ?? []).length, 3);
});

test("a chosen filter is the current link, not a pressed button", () => {
  const html = shop([piece(1)], { size: "2-3", ready: "1" });
  assert.doesNotMatch(html, /aria-pressed/);
  assert.match(html, /<a aria-current="true"[^>]*href="\/shop\/kids\?ready=1"[^>]*>2-3<\/a>/);
  assert.match(html, /<a aria-current="true"[^>]*href="\/shop\/kids\?size=2-3"[^>]*>Ready to ship<\/a>/);
});

test("each card says when it ships, in words dark enough to read", () => {
  const html = shop([
    piece(1),
    piece(2, { availableSizes: [], stock: 5, colorCount: 0 }),
    piece(3, { stock: 0, productionTime: "3-5" }),
  ]);
  assert.match(html, /<p class="text-\[11px\] text-charcoal-light mb-4">Some sizes ready to ship<\/p>/);
  assert.match(html, /<p class="text-\[11px\] text-charcoal-light mb-4">Ready to ship in 1–2 days<\/p>/);
  assert.match(html, /<p class="text-\[11px\] text-charcoal-light mb-4">Made to order in 3–5 days<\/p>/);
  assert.doesNotMatch(html, /text-charcoal-light\/80/);

  // "Ready to ship" keeps pieces with something on the shelf
  const ready = shop([piece(1), piece(3, { stock: 0 })], { ready: "1" });
  assert.match(ready, /Piece 1<\/h4>/);
  assert.doesNotMatch(ready, /Piece 3<\/h4>/);
});

test("a card with a colour to choose sends the customer to choose it", () => {
  const html = shop([
    piece(1, { availableSizes: [], colorCount: 4 }),
    piece(2, { availableSizes: [], colorCount: 0 }),
    piece(3, { availableSizes: [] }),
  ]);
  assert.match(html, /href="\/shop\/piece-1"[^>]*>Choose Colour/);
  assert.match(html, /Add to Bag — £<!-- -->10\.02/);
  assert.match(html, /href="\/shop\/piece-3"[^>]*>View Options/);
  assert.doesNotMatch(html, /Add to Bag — £<!-- -->10\.0[13]/);
});

/* ─── The bag ─── */

test("under a friend's minimum the bag neither asks for the email nor sends the code", () => {
  const cart = read("src/components/Cart.tsx");
  assert.match(cart, /const friendApplies = friendDiscountApplies\(friend, totalPrice\(\)\);/);
  assert.match(cart, /if \(friend && friendApplies && !EMAIL_RE\.test\(friendEmail\.trim\(\)\)\)/);
  assert.match(cart, /\.\.\.\(friend && friendApplies \? \{ referralCode: friend\.code, email: friendEmail\.trim\(\) \} : \{\}\)/);
  // The email box shows under exactly the same condition
  assert.match(cart, /const applies = friendApplies;[^]*?\{applies && \(\s*<div>\s*<input\s+ref=\{friendEmailRef\}\s+type="email"/);
  assert.doesNotMatch(cart, /if \(friend && !EMAIL_RE/);
});

test("a welcome code is pointed to the payment page before any gift card lookup", () => {
  const cart = read("src/components/Cart.tsx");
  const welcome = cart.indexOf("if (looksLikeWelcomeCode(typed))");
  const giftLookup = cart.indexOf("/api/gift-cards?code=");
  assert.ok(welcome > -1 && giftLookup > welcome, "recognised first, never sent to the gift card lookup");
  assert.match(cart.slice(welcome, giftLookup), /setCodeNote\(\s*welcomeCodeNote\(/);
});
