import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, parse } from "groq-js";

/**
 * Guards the shop's server pages: which of them can be cached, what they say
 * to search engines, and what /shop shows when Sanity cannot be reached.
 */

const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), "utf8");
const SHOP = read("src", "app", "shop", "page.tsx");
const PARAM = read("src", "app", "shop", "[param]", "page.tsx");
const COLLECTION = read("src", "app", "shop", "collection", "[slug]", "page.tsx");
const COLLECTIONS = read("src", "app", "shop", "collections", "page.tsx");

test("a product page does not read the address's query, so it can be cached", () => {
  const page = PARAM.slice(PARAM.indexOf("export default async function ShopParamPage"));
  const categoryAt = page.indexOf("if (sanityCategory) {");
  const readAt = page.indexOf("await searchParams");
  const productAt = page.indexOf("/* ── Product detail route ── */");
  assert.ok(categoryAt !== -1 && readAt !== -1 && productAt !== -1, "page shape changed — update this test");
  assert.ok(categoryAt < readAt && readAt < productAt,
    "Read searchParams inside the category branch only: anywhere above it makes all sixteen product pages uncacheable.");
  assert.equal(page.match(/await searchParams/g)?.length, 1);
  assert.match(PARAM, /export const revalidate = 60;/);
});

test("the pages that need their filters keep the catalogue cached for a minute", () => {
  assert.match(SHOP, /sanityClient\.fetch\(PRODUCTS_QUERY, \{\}, \{ next: \{ revalidate \} \}\)/);
  assert.match(PARAM, /CATEGORY_PRODUCTS_QUERY,\s*\{ cat: sanityCategory \},\s*\{ next: \{ revalidate: 60 \} \}/);
  assert.equal(COLLECTION.match(/\{ next: \{ revalidate: 60 \} \}/g)?.length, 2);
});

test("/shop never shows products that do not exist", () => {
  assert.doesNotMatch(SHOP, /fallbackProducts|_id: "ling-bralette-01"|text=Bralette/,
    "the placeholder catalogue had an Add to Bag that checkout refused");
  assert.doesNotMatch(SHOP, /catch\s*\{[^}]*products\s*=/, "a Sanity failure goes to the error page, not to a made-up listing");
});

test("a product's structured data describes the product", () => {
  assert.match(PARAM, /description: plainText\(product\.description\) \|\| productDescription\(product\),/);
  assert.doesNotMatch(PARAM, /description: `Handmade \$\{product\.category/);
});

test("collection pages name their one address and say their name once", () => {
  assert.match(COLLECTION, /alternates: \{ canonical: `\$\{SITE_URL\}\/shop\/collection\/\$\{slug\}` \}/);
  assert.match(COLLECTION, /description: collectionDescription\(collection\.name, collection\.season\)/);
  assert.match(COLLECTIONS, /alternates: \{ canonical: `\$\{SITE_URL\}\/shop\/collections` \}/);
});

test("the site's functions run in London, beside the people using it", () => {
  const vercel = JSON.parse(read("vercel.json"));
  assert.deepEqual(vercel.regions, ["lhr1"]);
});

/**
 * A listing card says how long a made-to-order piece takes, and sends a piece
 * with a colour to choose to its own page instead of adding it to the bag
 * without one. ShopContent reads both from the listing — so each of the three
 * listings has to ask Sanity for them and hand them on. The queries are run
 * here with groq-js, Sanity's own evaluator, against pieces shaped like the
 * real ones.
 */
const LISTINGS: [file: string, source: string, query: string, params: Record<string, string>][] = [
  ["shop/page.tsx", SHOP, "PRODUCTS_QUERY", {}],
  ["shop/[param]/page.tsx", PARAM, "CATEGORY_PRODUCTS_QUERY", { cat: "lingerie" }],
  ["shop/collection/[slug]/page.tsx", COLLECTION, "COLLECTION_PRODUCTS_QUERY", { slug: "winter" }],
];

test("every listing asks how many colours a piece comes in and how long it takes to make", async () => {
  const dataset = [
    { _id: "c1", _type: "collection", slug: { current: "winter" } },
    {
      _id: "p-slip", _type: "product", name: "Silk Slip", category: "lingerie", price: 3800, _createdAt: "2026-09-02T00:00:00Z",
      collection: { _type: "reference", _ref: "c1" }, productionTime: "3-5",
      availableColors: [{ _key: "a", name: "Ivory" }, { _key: "b", name: "Lavender" }, { _key: "c", name: "Black" }],
    },
    {
      _id: "p-scrunchie", _type: "product", name: "Scrunchie", category: "lingerie", price: 1200, _createdAt: "2026-09-01T00:00:00Z",
      collection: { _type: "reference", _ref: "c1" },
    },
  ];
  for (const [file, source, name, params] of LISTINGS) {
    const query = source.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`))?.[1];
    assert.ok(query, `${file}: ${name} not found — update this test`);
    const rows = (await (await evaluate(parse(query), { dataset, params })).get()) as Record<string, unknown>[];
    assert.deepEqual(
      rows.map((row) => [row._id, row.colorCount, row.productionTime]),
      [
        ["p-slip", 3, "3-5"],
        ["p-scrunchie", null, null],
      ],
      file
    );
  }
});

test("every listing hands both on, with a piece of no colours counted as none", () => {
  for (const [file, source] of LISTINGS) {
    assert.match(source, /colorCount: p\.colorCount \?\? 0,/, `${file}: an unknown count makes the card say "View Options" for a piece with nothing to choose`);
    assert.match(source, /productionTime: p\.productionTime \?\? null,/, file);
  }
});
