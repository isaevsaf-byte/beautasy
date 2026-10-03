import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_SERVICE_HITS, searchServices } from "./serviceSearch";
import { LOCAL_SERVICES } from "./localServices";
import { lowestPrice } from "./siteCopy";

/**
 * Site search answers the atelier's words. It used to search only the shop,
 * so "hem", "wedding" and "school uniform" found nothing and "zip" offered a
 * corduroy pouch, while six service pages answered exactly those questions.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const hrefs = (query: string) => searchServices(query).map((hit) => hit.href);

test("the words clients type find the service page that answers them, first", () => {
  const first: Record<string, string> = {
    wedding: "/alterations/wedding-dress-southampton",
    bridal: "/alterations/wedding-dress-southampton",
    prom: "/alterations/prom-and-evening-dress-southampton",
    curtain: "/alterations/curtains-and-home-southampton",
    curtains: "/alterations/curtains-and-home-southampton",
    jeans: "/alterations/jeans-and-trousers-southampton",
    zip: "/alterations/zip-replacement-southampton",
    zipper: "/alterations/zip-replacement-southampton",
    "school uniform": "/alterations/school-uniform-southampton",
    seamstress: "/alterations",
    alterations: "/alterations",
    "alterations near me": "/alterations",
    repair: "/alterations",
    book: "/atelier#book",
  };
  for (const [query, href] of Object.entries(first)) {
    assert.equal(hrefs(query)[0], href, `"${query}"`);
  }
});

test("a job listed on several pages finds each of them", () => {
  const hem = hrefs("hem");
  assert.ok(hem.includes("/alterations/jeans-and-trousers-southampton"));
  assert.ok(hem.includes("/alterations/school-uniform-southampton"));
  // The zip page leads, then the pages that price a zip among other jobs
  const zip = hrefs("zip");
  assert.ok(zip.length > 1);
  assert.ok(zip.includes("/alterations/jeans-and-trousers-southampton"));
});

test("a prefix is enough, as it is for the shop's products", () => {
  assert.equal(hrefs("wedd")[0], "/alterations/wedding-dress-southampton");
  assert.equal(hrefs("curt")[0], "/alterations/curtains-and-home-southampton");
});

test("shop words find no service, so the products have the list", () => {
  for (const query of ["scrunchie", "bra", "pouch", "gift box", "a", "  "]) {
    assert.deepEqual(searchServices(query), [], `"${query}"`);
  }
});

test("a broad word leaves room for the shop", () => {
  assert.equal(searchServices("alterations").length, MAX_SERVICE_HITS);
  assert.ok(MAX_SERVICE_HITS < 8, "the route shows eight results in all");
});

test("every hit says what it costs as its page does, and goes to a real page", () => {
  const slugs = new Set(LOCAL_SERVICES.map((service) => service.slug));
  for (const service of LOCAL_SERVICES) {
    const [hit] = searchServices(service.eyebrow).filter((h) => h.href.endsWith(service.slug));
    assert.ok(hit, `${service.slug} can be found by its own label`);
    // The cheapest line on the page, which is not always the first
    assert.equal(hit.priceLabel, `from ${lowestPrice(service.prices)}`);
    assert.equal(hit.kind, "service");
  }
  for (const hit of searchServices("alterations")) {
    const slug = hit.href.match(/^\/alterations\/(.+)$/)?.[1];
    if (slug) assert.ok(slugs.has(slug), hit.href);
  }
});

test("the search route puts the services before the products, and keeps them when Sanity fails", () => {
  const route = read("src/app/api/search/route.ts");
  assert.match(route, /const services = searchServices\(raw\);/);
  assert.match(route, /const results = \[\s*\.\.\.services,\s*\.\.\.products\.map/);
  assert.match(route, /if \(services\.length > 0\) return NextResponse\.json\(\{ results: services, query: raw \}\);/);
});

test("the search box asks in the atelier's words and offers a way forward when nothing matches", () => {
  const overlay = read("src/components/SearchOverlay.tsx");
  assert.match(overlay, /placeholder="hem, zip, wedding dress, scrunchie…"/);
  const empty = overlay.slice(overlay.indexOf("Nothing matched"));
  assert.match(empty, /href="\/atelier#book"[\s\S]*Choose a time/);
  assert.match(empty, /whatsappLink\([\s\S]*Send a photo on WhatsApp/);
  assert.doesNotMatch(overlay, /Ask us for a custom piece/);
  // A service is priced as its page prints it, not as pence
  assert.match(overlay, /item\.priceLabel \?/);
});
