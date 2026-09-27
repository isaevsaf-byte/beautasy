import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, parse } from "groq-js";
import { SHELVES_QUERY, giftsHref, placeLink, shelvesFrom, stockedLinks, type Shelves } from "./shelves";

/**
 * The shelves as they stood on 27 September 2026: sixteen products in six
 * sections, one of them — the sleeping mask — filed under Accessories while
 * the menu looks for it under Lingerie.
 */
const LIVE: Shelves = shelvesFrom({
  products: [
    ...Array.from({ length: 2 }, () => ({ category: "Accessories", subcategory: "hair-accessories" })),
    ...Array.from({ length: 2 }, () => ({ category: "Accessories", subcategory: "pouches" })),
    { category: "Accessories", subcategory: "sleeping-masks" },
    ...Array.from({ length: 6 }, () => ({ category: "Kids", subcategory: "underwear" })),
    { category: "Lingerie", subcategory: "bras" },
    ...Array.from({ length: 4 }, () => ({ category: "Lingerie", subcategory: "knickers" })),
  ],
  giftBoxes: 0,
});

const EMPTY: Shelves = { stocked: [], giftBoxes: false };

test("the shelves are read from the products themselves", () => {
  assert.deepEqual(LIVE.stocked, [
    "Accessories",
    "Accessories/hair-accessories",
    "Accessories/pouches",
    "Accessories/sleeping-masks",
    "Kids",
    "Kids/underwear",
    "Lingerie",
    "Lingerie/bras",
    "Lingerie/knickers",
  ]);
  assert.equal(LIVE.giftBoxes, false);
  assert.deepEqual(shelvesFrom(null), EMPTY);
  assert.deepEqual(shelvesFrom({ products: [{ category: 7 }, { subcategory: "bras" }], giftBoxes: "3" }), EMPTY);
});

test("a link to a stocked shelf stays as it is", () => {
  assert.equal(placeLink("/shop/lingerie?category=bras", LIVE), "/shop/lingerie?category=bras");
  assert.equal(placeLink("/shop/kids", LIVE), "/shop/kids");
  assert.equal(placeLink("/shop/mini", LIVE), "/shop/mini", "/shop/mini is the kids' shelf");
});

test("a link to an empty shelf is left out", () => {
  assert.equal(placeLink("/shop/lingerie?category=garters", LIVE), null);
  assert.equal(placeLink("/shop/home", LIVE), null);
  assert.equal(placeLink("/shop/home?category=cushion-cover", LIVE), null);
  assert.equal(placeLink("/gift-boxes", LIVE), null);
  assert.equal(placeLink("https://www.beautasy.co.uk/shop/home", LIVE), null, "the sitemap's links are whole addresses");
});

test("a link looking on the wrong shelf is sent where the products are", () => {
  assert.equal(
    placeLink("/shop/lingerie?category=sleeping-masks", LIVE),
    "/shop/accessories?category=sleeping-masks"
  );
});

test("links that are not to a shop section, and every link while the shelves are unknown, pass untouched", () => {
  for (const href of ["/shop", "/shop?sort=new", "/shop/silk-slip", "/shop/collections", "/gift-cards", "/atelier", "/"]) {
    assert.equal(placeLink(href, EMPTY), href, href);
  }
  assert.equal(placeLink("/shop/home", null), "/shop/home");
  assert.equal(placeLink("/gift-boxes", undefined), "/gift-boxes");
});

test("gift boxes come back the moment there is one", () => {
  const withBoxes = { ...LIVE, giftBoxes: true };
  assert.equal(placeLink("/gift-boxes", withBoxes), "/gift-boxes");
  assert.equal(giftsHref(withBoxes), "/gift-boxes");
  assert.equal(giftsHref(LIVE), "/gift-cards", "Gifts is never an empty page");
  assert.equal(giftsHref(null), "/gift-cards");
});

test("a list of links keeps its order and everything else on each link", () => {
  const links = [
    { label: "Bras", href: "/shop/lingerie?category=bras", note: "a" },
    { label: "Belts", href: "/shop/lingerie?category=belts", note: "b" },
    { label: "Sleeping Masks", href: "/shop/lingerie?category=sleeping-masks", note: "c" },
  ];
  assert.deepEqual(stockedLinks(links, LIVE), [
    { label: "Bras", href: "/shop/lingerie?category=bras", note: "a" },
    { label: "Sleeping Masks", href: "/shop/accessories?category=sleeping-masks", note: "c" },
  ]);
});

test("the query counts published products with a category, and gift boxes with an address", async () => {
  const dataset = [
    { _id: "p1", _type: "product", category: "Lingerie", subcategory: "bras" },
    { _id: "p2", _type: "product", category: "Home" },
    { _id: "p3", _type: "product", subcategory: "belts" },
    { _id: "g1", _type: "giftBox", slug: { current: "for-her" } },
    { _id: "g2", _type: "giftBox" },
  ];
  const shelves = shelvesFrom(await (await evaluate(parse(SHELVES_QUERY), { dataset })).get());
  assert.deepEqual(shelves, { stocked: ["Home", "Lingerie", "Lingerie/bras"], giftBoxes: true });
});

/**
 * Every link to a shop section written anywhere on the site must be one this
 * module understands, or it would keep leading to an empty shelf unnoticed:
 * with nothing on any shelf, each of them has to be left out.
 */
test("every shop-section link on the site is one the shelves can check", () => {
  const files = [
    "src/components/Header.tsx",
    "src/components/Footer.tsx",
    "src/lib/localServices.ts",
    "src/app/HomeContent.tsx",
    "src/app/shop/ShopContent.tsx",
  ];
  const found: string[] = [];
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    for (const [, href] of source.matchAll(/href:\s*"((?:\/shop\/|\/gift-boxes)[^"]*)"/g)) found.push(href);
  }
  const sections = found.filter((href) => !/^\/shop\/collections?\b/.test(href));
  assert.ok(sections.length >= 30, `expected the menu, footer and service links, found ${sections.length}`);
  const unchecked = sections.filter((href) => placeLink(href, EMPTY) !== null);
  assert.deepEqual(unchecked, [], "these would lead to an empty shelf without anyone noticing");
});
