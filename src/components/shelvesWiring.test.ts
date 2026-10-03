import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every place that links to a shop section asks the shelves first (see
 * @/lib/shelves, whose own tests measure what the answer is). This holds the
 * wiring: a place that stops asking goes back to sending people to empty
 * pages, and nothing else would notice.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

test("the header lists no shop sections, so no menu can lead to an empty shelf", () => {
  // The menu used to carry 22 shop links and filter them by the shelves. It
  // now has six, none of them a section — the sections are chips on /shop —
  // so the header no longer waits on the shelves at all. A section link put
  // back into it would need the shelves again.
  const header = read("src/components/Header.tsx");
  assert.doesNotMatch(header, /href: "\/shop\/[a-z]/, "a shop section in the menu has to ask the shelves first");
  assert.doesNotMatch(header, /href: "\/gift-boxes"/, "the gift boxes are a shelf too");
  assert.doesNotMatch(read("src/components/HeaderWrapper.tsx"), /getShelves/);
  // The footer still reads the shelves from the settings the header caches
  assert.match(header, /s\?\.announcementBar !== undefined && s\?\.shelves !== undefined/);
  assert.match(read("src/app/api/site-settings/route.ts"), /NextResponse\.json\(\{ \.\.\.settings, shelves \}\)/);
});

test("the menu opens on the atelier, the same six links at every width", () => {
  const header = read("src/components/Header.tsx");
  const links = [...header.matchAll(/\{ label: "([^"]+)", href: "([^"]+)", side: "(left|right)" \}/g)].map(
    ([, label, href]) => `${label} ${href}`,
  );
  assert.deepEqual(links, [
    "Alterations & Prices /atelier",
    "Our Work /work",
    "Reviews /reviews",
    "Shop /shop",
    "Gift Cards /gift-cards",
    "Contact /contact",
  ]);
  assert.match(header, /\{navLinks\.map\(\(link\) => \(/, "the phone menu lists them all, in this order");
  // The two things most people open the menu to do, at its foot
  const phoneMenu = header.slice(header.indexOf('id="mobile-nav"'));
  assert.match(phoneMenu, /href="\/atelier#book"[\s\S]*Choose a time/);
  assert.match(phoneMenu, /href=\{whatsappLink\(WHATSAPP_HELLO\)\}[\s\S]*WhatsApp Kristina/);
});

test("the footer, the shop, the home page and the service pages leave empty shelves out", () => {
  assert.match(read("src/components/Footer.tsx"), /stockedLinks\(navLinks, settings\?\.shelves\)\.map/);
  assert.match(read("src/components/FooterWrapper.tsx"), /settings=\{\{ \.\.\.settings, shelves \}\}/);

  const shop = read("src/app/shop/ShopContent.tsx");
  assert.match(shop, /\{stockedCategories\.map\(\(cat, i\) =>/);
  assert.match(shop, /tag\.slug === activeSubcategory \|\| products\.some\(\(p\) => p\.subcategory === tag\.slug\)/);

  const home = read("src/app/HomeContent.tsx");
  assert.match(home, /const shownCategories = categories\.filter\(\(cat\) => placeLink\(cat\.href, shelves\) !== null\);/);
  assert.match(home, /\{shownCategories\.map\(\(cat, i\) =>/);

  const service = read("src/app/alterations/[slug]/page.tsx");
  assert.match(service, /const \[shelves, work, reviews, nextdoorUrl\] = await Promise\.all\(\[\s*getShelves\(\),\s*getWork\(\),/);
  assert.match(service, /const fromTheShop = stockedLinks\(service\.shop, shelves\);/);
  assert.match(service, /\{fromTheShop\.length > 0 && \(/);
  assert.doesNotMatch(service, /service\.shop\.map/);
});

test("Google is told about stocked sections only", () => {
  assert.match(read("src/app/sitemap.ts"), /staticRoutes\.filter\(\(route\) => placeLink\(route\.url, shelves\) !== null\)/);
  const section = read("src/app/shop/[param]/page.tsx");
  assert.match(section, /const empty = placeLink\(`\/shop\/\$\{key\}`, await getShelves\(\)\) === null;/);
  assert.match(section, /\.\.\.\(empty \? \{ robots: \{ index: false, follow: true \} \} : \{\}\)/);
  assert.match(section, /description: productDescription\(product\)|const description = productDescription\(product\);/);
});

test("the gift boxes page stays out of search while there are none, and a blank answer hides nothing", () => {
  const giftBoxes = read("src/app/gift-boxes/page.tsx");
  assert.match(giftBoxes, /const empty = shelves !== null && !shelves\.giftBoxes;/);
  assert.match(giftBoxes, /robots: \{ index: false, follow: true \}/);
  assert.match(read("src/lib/getShelves.ts"), /return shelvesOrUnknown\(await sanityClient\.fetch\(SHELVES_QUERY/);
});

test("each page has one address for Google, and private pages none", () => {
  assert.match(read("src/app/page.tsx"), /alternates: \{ canonical: "\/" \}/);
  assert.doesNotMatch(read("src/app/layout.tsx"), /canonical/, "in the root layout every page would inherit the home page's address");
  assert.match(read("src/app/atelier/layout.tsx"), /alternates: \{ canonical: `\$\{siteUrl\}\/atelier` \}/);
  assert.match(read("src/app/shop/page.tsx"), /alternates: \{ canonical: `\$\{siteUrl\}\/shop` \}/);
  assert.match(read("src/app/contact/layout.tsx"), /alternates: \{ canonical: `\$\{siteUrl\}\/contact` \}/);
  assert.match(read("src/app/pages/[slug]/page.tsx"), /alternates: \{ canonical: `\$\{SITE_URL\}\/pages\/\$\{slug\}` \}/);
  for (const page of ["wishlist", "success"]) {
    assert.match(read(`src/app/${page}/layout.tsx`), /robots: \{ index: false, follow: true \}/, page);
  }
});

test("the vercel.app copy sends its pages to the real address, and leaves /api alone", () => {
  const config = read("next.config.ts");
  assert.match(config, /source: "\/:path\(\(\?!api\/\)\.\*\)"/);
  assert.match(config, /has: \[\{ type: "host", value: "beautasy\.vercel\.app" \}\]/);
  assert.match(config, /destination: "https:\/\/www\.beautasy\.co\.uk\/:path",\s*permanent: true/);
});
