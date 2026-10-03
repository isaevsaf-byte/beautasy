import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
