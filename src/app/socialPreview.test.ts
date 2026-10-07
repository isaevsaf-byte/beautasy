import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import ogImage, { alt, contentType, size } from "./opengraph-image";
import * as cardRoute from "./cards/[card]/route";
import { domainVerificationTags } from "../lib/domainVerification";
import { ATELIER_CARD_IMAGES, SEWN_CARDS, SOCIAL_CARD_IMAGES, SOCIAL_CARD_URL, sewnCardFor, sewnCardImages } from "../lib/socialCard";
import { SITE_DESCRIPTION, SITE_TITLE, lowestPrice } from "../lib/siteCopy";
import { LOCAL_SERVICES } from "../lib/localServices";
import { bindAmpersands, sewnCard } from "../lib/sewnCard";
import { ATELIER_LEAD, CARD_DESIGN, cardVersion, sewnCardAlt, sewnLead } from "../lib/sewnCardVersion";
import { SITE_URL } from "../lib/site";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomeContent from "./HomeContent";

/**
 * What a shared link looks like, and who is allowed to claim this domain.
 *
 * The shop is passed around in WhatsApp and Instagram DMs far more often than
 * it is found in a search result, and for a year every one of those messages
 * showed the site icon cropped through the middle.
 *
 * The first version of this file only read src/app/layout.tsx, and it read it
 * as text — it asserted that the words "images:" did not appear anywhere in
 * the metadata export, comments included. It passed by accident: a backtick in
 * a comment sat between the word and the colon. Rewording the comment would
 * have turned the suite red with a message about the card being overridden,
 * pointing at nothing. Worse, checking one file proved nothing about the rest
 * of the site — while it was green, /gift-cards, /refer and /gift-boxes were
 * shipping no og:image at all and four more routes were declaring sizes their
 * files have never had.
 *
 * So these tests sweep every route that declares an Open Graph picture and
 * measure the file it names, and every assertion about comment-free source is
 * made on source with the comments removed.
 */

const APP_DIR = __dirname;
const PUBLIC_DIR = resolve(APP_DIR, "..", "..", "public");

/**
 * Every real URL anything in this file has fetched, collected from the moment
 * the file loads.
 *
 * This has to be installed here rather than inside the test that checks it,
 * because @vercel/og keeps a module-level cache of the assets it downloads. A
 * second render of the same card is a cache hit that touches nothing, so a
 * guard that wraps only its own render measures a warm cache and passes no
 * matter what the card says. Wrapping fetch for the whole file means whichever
 * render happens first — cold, the one that would really download — is the one
 * on record.
 *
 * The wasm the renderer loads comes through the same call as a data: URI,
 * which is not the network, so only real schemes are kept.
 */
const networkCalls: string[] = [];

{
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((...args: Parameters<typeof realFetch>) => {
    const target = String(args[0]);
    if (!target.startsWith("data:")) networkCalls.push(target);
    return realFetch(...args);
  }) as typeof realFetch;
}

/* ─── Reading the source without reading the prose ─── */

/**
 * The file with its comments taken out.
 *
 * A plain regex cannot do this: every one of these files contains
 * "https://www.beautasy.co.uk" and the // in the middle of it is not a
 * comment. So this walks the text once, keeping track of whether it is inside
 * a quote, and only treats // and slash-star as comments when it is not.
 */
function stripComments(source: string): string {
  let out = "";
  let quote: string | null = null;

  for (let i = 0; i < source.length; i++) {
    const here = source[i];
    const next = source[i + 1];

    if (quote) {
      if (here === "\\") {
        out += here + (next ?? "");
        i++;
        continue;
      }
      if (here === quote) quote = null;
      out += here;
      continue;
    }

    if (here === '"' || here === "'" || here === "`") {
      quote = here;
      out += here;
      continue;
    }

    if (here === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
      continue;
    }

    if (here === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i++;
      out += " ";
      continue;
    }

    out += here;
  }

  return out;
}

/**
 * The `{ ... }` that follows `key:`, brace-counted so a nested object does not
 * end the block early. Quotes are tracked for the same reason as above — a
 * brace inside a string must not count. Template holes balance themselves:
 * `${` opens and `}` closes.
 */
function blocksFor(source: string, key: string): string[] {
  const blocks: string[] = [];
  const opener = new RegExp(`\\b${key}\\s*:\\s*\\{`, "g");

  for (const match of source.matchAll(opener)) {
    let depth = 0;
    let quote: string | null = null;
    const from = match.index + match[0].length - 1;

    for (let i = from; i < source.length; i++) {
      const here = source[i];

      if (quote) {
        if (here === "\\") i++;
        else if (here === quote) quote = null;
        continue;
      }
      if (here === '"' || here === "'" || here === "`") {
        quote = here;
        continue;
      }
      if (here === "{") depth++;
      if (here === "}") {
        depth--;
        if (depth === 0) {
          blocks.push(source.slice(from, i + 1));
          break;
        }
      }
    }
  }

  return blocks;
}

/** Every .ts/.tsx under src/app that mentions openGraph, tests excluded. */
function routeFilesDeclaringOpenGraph(): string[] {
  const found: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || entry.name.includes(".test.")) continue;
      if (readFileSync(path, "utf8").includes("openGraph")) found.push(path);
    }
  };

  walk(APP_DIR);
  return found.sort();
}

/* ─── Measuring the files those routes name ─── */

interface Measured {
  format: "png" | "jpeg";
  width: number;
  height: number;
}

/**
 * The real size and real format of an image on disk, read from its header.
 *
 * No library for this on purpose: the point of the test is to distrust what
 * the code claims about these files, and a header is two numbers in a fixed
 * place. PNG keeps them in the IHDR chunk; JPEG keeps them in whichever
 * start-of-frame segment turns up first, which means walking the segments.
 */
function measure(file: string): Measured {
  const bytes = readFileSync(file);

  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { format: "png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      // Padding, restart markers and the start-of-image carry no length.
      if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        i += 2;
        continue;
      }
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) {
        return { format: "jpeg", height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
      }
      i += 2 + bytes.readUInt16BE(i + 2);
    }
  }

  throw new Error(`${file} is neither a PNG nor a JPEG`);
}

/** The name of a file in public/, if this URL expression points at one. */
function publicFileIn(urlExpression: string): string | null {
  const named = /\/([A-Za-z0-9._ -]+\.(?:png|jpe?g|webp|gif))/.exec(urlExpression);
  if (!named) return null;
  const path = join(PUBLIC_DIR, named[1]);
  try {
    readFileSync(path);
    return path;
  } catch {
    return null;
  }
}

/** Every `{ url, width, height }` written out longhand in a route's metadata. */
interface Declared {
  file: string;
  urlExpression: string;
  width: number;
  height: number;
}

function declaredImages(): Declared[] {
  const declared: Declared[] = [];

  for (const file of routeFilesDeclaringOpenGraph()) {
    const source = stripComments(readFileSync(file, "utf8"));
    for (const block of blocksFor(source, "openGraph")) {
      const descriptor = /\{\s*url\s*:\s*([^,]+?)\s*,\s*width\s*:\s*(\d+)\s*,\s*height\s*:\s*(\d+)/g;
      for (const match of block.matchAll(descriptor)) {
        declared.push({
          file,
          urlExpression: match[1],
          width: Number(match[2]),
          height: Number(match[3]),
        });
      }
    }
  }

  return declared;
}

/* ─── The card itself ─── */

test("the card declares the size chat apps crop from", () => {
  assert.deepEqual(size, { width: 1200, height: 630 });
  assert.equal(contentType, "image/png");
  assert.ok(alt.length > 0, "a preview image needs alt text");
});

test("the card really renders at 1200x630", async () => {
  const png = Buffer.from(await (await ogImage()).arrayBuffer());

  // A PNG opens with a fixed 8-byte signature, then an IHDR chunk whose width
  // and height are the two big-endian 32-bit numbers at offsets 16 and 20.
  // Reading them is how we know the renderer agreed with `size` rather than
  // silently producing something else.
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});

test("drawing the card touches no network", async () => {
  // satori has no picture for a glyph its font lacks, so it downloads one: a
  // single emoji in this card turns the render into a fetch of
  // cdn.jsdelivr.net/gh/twitter/twemoji/.../1f49c.svg, and on Vercel that
  // happens during the build. Plain Latin, an em dash and Cyrillic all draw
  // from the bundled font and ask for nothing. next/og assembles satori's
  // options itself and hardwires loadAdditionalAsset, so there is no setting
  // that switches this off — this test is the guarantee instead. Kristina's
  // captions run on emoji, so one landing in this card is an ordinary edit.
  //
  // What is asserted is the whole file's traffic, not this render's: see
  // networkCalls above for why a render of its own would prove nothing.
  await (await ogImage()).arrayBuffer();

  assert.deepEqual(
    networkCalls,
    [],
    "drawing the card reached the network — almost certainly an emoji or a non-Latin script in its text, which makes every build depend on a CDN staying up",
  );
});

/* ─── Where that card is and is not used ─── */

test("the shared card constant matches the card that gets drawn", () => {
  assert.equal(SOCIAL_CARD_IMAGES.length, 1);
  const [card] = SOCIAL_CARD_IMAGES;
  assert.equal(card.url, SOCIAL_CARD_URL);
  assert.equal(card.width, size.width);
  assert.equal(card.height, size.height);
  assert.equal(card.alt, alt);
});

test("the root layout offers no picture of its own to crop", () => {
  const source = stripComments(readFileSync(join(APP_DIR, "layout.tsx"), "utf8"));

  // openGraph and twitter must both stay silent about images here: that
  // silence is what hands the job to opengraph-image.tsx, which sits in this
  // same segment.
  for (const key of ["openGraph", "twitter"]) {
    const blocks = blocksFor(source, key);
    assert.equal(blocks.length, 1, `expected exactly one ${key} block in the root layout`);
    assert.doesNotMatch(
      blocks[0],
      /\bimages\b/,
      `naming images in the root ${key} block overrides the generated card, and the file it named before was 1378x1179 — the shape that gets cropped`,
    );
  }

  // The favicon is a file beside this layout now (see the next test). An
  // `icons` key here would override it with whatever it names — which was a
  // 138 KB picture, fetched again on every first visit.
  assert.doesNotMatch(source, /\bicons\s*:/, "the favicon comes from src/app/icon.png, not from metadata");
});

test("the favicon and the home-screen icon are small square PNGs", () => {
  // Next links these two files itself, with a hash, so browsers may keep them
  for (const [name, side] of [["icon.png", 64], ["apple-icon.png", 180]] as const) {
    const file = join(APP_DIR, name);
    const real = measure(file);
    assert.equal(real.format, "png", `${name} must really be a PNG`);
    assert.deepEqual({ width: real.width, height: real.height }, { width: side, height: side }, `${name} is square, ${side}px`);
    // The old icon was 138,569 bytes for a 16px tab
    assert.ok(statSync(file).size < 20_000, `${name} is ${statSync(file).size} bytes; it is drawn a few dozen pixels wide`);
  }
  // A second icon file would be linked as well, and browsers pick between them
  for (const other of ["icon.svg", "icon.ico", "favicon.ico", "icon.jpg", "apple-icon.jpg"]) {
    assert.ok(!existsSync(join(APP_DIR, other)), `src/app/${other} would be served beside icon.png`);
  }
});

/* ─── Atelier first, and every link at its own address ─── */

test("the site introduces itself as the atelier first, in lengths Google shows whole", () => {
  assert.ok(SITE_TITLE.length <= 60, `the title is ${SITE_TITLE.length} characters`);
  assert.ok(SITE_DESCRIPTION.length <= 160, `the description is ${SITE_DESCRIPTION.length} characters`);
  assert.ok(
    SITE_TITLE.indexOf("Alterations") > -1 && SITE_TITLE.indexOf("Alterations") < SITE_TITLE.indexOf("Lingerie"),
    "alterations come before the shop in the title",
  );
  assert.match(SITE_DESCRIPTION, /^Alterations and repairs/);
  // The price is the service pages' own, not a number typed twice
  assert.equal(lowestPrice(), "£8");
  assert.ok(SITE_DESCRIPTION.includes(`from ${lowestPrice()}`));

  const layout = stripComments(readFileSync(join(APP_DIR, "layout.tsx"), "utf8"));
  assert.doesNotMatch(layout, /Handmade Lingerie & Accessories/, "the old shop-first title");
  assert.equal(layout.match(/title: SITE_TITLE/g)?.length, 3, "page, Open Graph and Twitter titles");
  assert.equal(layout.match(/description: SITE_DESCRIPTION/g)?.length, 3);

  assert.match(alt, /^Beautasy — alterations, repairs/);
  const card = readFileSync(join(APP_DIR, "opengraph-image.tsx"), "utf8");
  assert.match(card, /Alterations, repairs &amp; handmade lingerie/);
});

test("the cheapest price is read from the price lines however they are written", () => {
  assert.equal(lowestPrice([{ name: "a", price: "from £12" }, { name: "b", price: "£15.50" }]), "£12");
  assert.equal(lowestPrice([{ name: "a", price: "£15.50" }, { name: "b", price: "from £20" }]), "£15.50");
  assert.equal(lowestPrice([{ name: "a", price: "ask" }]), null);
});

test("no page but the home page tells a chat app it is the home page", () => {
  // A friend's /r/ link and a salon's /p/ card inherited og:url = the home
  // page from the root layout, and Facebook treats og:url as the real
  // address: shared, they could open the home page, where no £5 is kept.
  const bareHome = /\burl\s*:\s*(SITE_URL|siteUrl|base|`\$\{(SITE_URL|siteUrl)\}\/?`)\s*[,}]/;
  const root = blocksFor(stripComments(readFileSync(join(APP_DIR, "layout.tsx"), "utf8")), "openGraph")[0];
  assert.doesNotMatch(root, /\burl\s*:/, "the root layout's og:url would be inherited by every page without its own");

  for (const file of routeFilesDeclaringOpenGraph()) {
    const where = relative(APP_DIR, file);
    for (const block of blocksFor(stripComments(readFileSync(file, "utf8")), "openGraph")) {
      if (where === "page.tsx") {
        assert.match(block, bareHome, "the home page names its own address");
        continue;
      }
      assert.doesNotMatch(block, bareHome, `${where} gives the home page's address as its own`);
    }
  }
});

test("a friend's link and a salon's card preview as the atelier, at their own address", () => {
  for (const [route, path] of [["r/[code]/page.tsx", "/r/"], ["p/[slug]/page.tsx", "/p/"]] as const) {
    const source = stripComments(readFileSync(join(APP_DIR, route), "utf8"));
    const [og] = blocksFor(source, "openGraph");
    assert.ok(og, `${route} has an openGraph block of its own`);
    assert.ok(og.includes(`url: \`\${SITE_URL}${path}`), `${route} names its own address`);
    assert.match(og, /images: ATELIER_CARD_IMAGES/);
    const [twitter] = blocksFor(source, "twitter");
    assert.match(twitter, /title: shareTitle/);
    // Still personal pages: kept out of search
    assert.match(source, /robots: \{ index: false, follow: true \}/);
  }
  assert.match(readFileSync(join(APP_DIR, "r/[code]/page.tsx"), "utf8"), /off your first alteration — Beautasy Atelier/);
  assert.match(readFileSync(join(APP_DIR, "p/[slug]/page.tsx"), "utf8"), /\$\{partner\.partner\.name\} recommends Beautasy Atelier/);
});

/**
 * Three more pages that are shared more than searched for: /reviews goes to
 * clients after a finished job, /refer is where the friends' links come from,
 * and a gift card is sent to somebody. Each sets its own openGraph, and each
 * needs its own twitter block as well — without one, the root's is inherited
 * whole and X previews the link with the home page's title. /reviews and
 * /refer are about the atelier, so they show the atelier's picture, as /r/
 * does. The two whose metadata is a constant are imported and read as Next
 * will read them; /reviews builds its own per request, so it is read as source.
 */
test("/reviews, /refer and /gift-cards preview with their own words everywhere, and the atelier where it belongs", async () => {
  const { metadata: refer } = await import("./refer/page");
  const { metadata: giftCards } = await import("./gift-cards/page");
  for (const [where, meta, images] of [["refer", refer, ATELIER_CARD_IMAGES], ["gift-cards", giftCards, SOCIAL_CARD_IMAGES]] as const) {
    const og = meta.openGraph as { title?: string; description?: string; images?: unknown };
    const twitter = meta.twitter as { card?: string; title?: string; description?: string; images?: unknown };
    assert.deepEqual(og.images, images, `${where}: its picture`);
    assert.ok(twitter, `${where} has a twitter block of its own`);
    assert.equal(twitter.card, "summary_large_image", where);
    assert.equal(twitter.title, og.title, `${where}: the same title on X as in WhatsApp`);
    assert.equal(twitter.description, og.description, where);
    assert.notEqual(twitter.title, SITE_TITLE, `${where}: not the home page's`);
    assert.equal("images" in twitter, false, `${where}: no images key, so Next copies the Open Graph ones`);
  }

  const reviews = stripComments(readFileSync(join(APP_DIR, "reviews", "page.tsx"), "utf8"));
  const [og] = blocksFor(reviews, "openGraph");
  const [twitter] = blocksFor(reviews, "twitter");
  assert.match(og, /images: ATELIER_CARD_IMAGES/);
  assert.match(og, /title: shareTitle,/);
  assert.ok(twitter, "/reviews has a twitter block of its own");
  assert.match(twitter, /card: "summary_large_image"/);
  assert.match(twitter, /title: shareTitle,/);
  assert.match(twitter, /description,/);
  assert.doesNotMatch(twitter, /\bimages\b/);
});

/** A card's PNG: its size, from the IHDR chunk, and its bytes */
async function drawn(response: Response | Promise<Response>): Promise<{ width: number; height: number; bytes: Buffer }> {
  const png = Buffer.from(await (await response).arrayBuffer());
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png };
}

/**
 * What the atelier's cards look like now, pinned. The card's address ends in
 * a hash of its words and of CARD_DESIGN (src/lib/sewnCardVersion.ts), so a
 * chat app that kept an old picture fetches the new one — but only if the
 * mark changes with the look. When one of these fails because the drawing or
 * Kristina's artwork changed on purpose: change CARD_DESIGN, then paste the
 * new hashes here.
 */
const PINNED = {
  design: "2026-10-07.3",
  artwork: "42da08475688a6e77916730100dc841ca3599ec1593944d8e924c344b575f22f",
  sample: "5b9d01dd3777797f48a63a6cd866da9909174f87075c4049c1f8246c80f49fcc",
};

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** A card as its route serves it */
const fetchCard = (card: string) => cardRoute.GET(new Request(`${SITE_URL}/cards/${card}`), { params: Promise.resolve({ card }) });

test("the atelier's card and each alteration page's own card are drawn at build time, 1200x630, light enough for WhatsApp, touching no network", async () => {
  // Until 07.10.2026 all of these named Kristina's artwork itself, 1200x1028,
  // and chat apps cut the ALTERATIONS banner off its top (src/lib/sewnCard.tsx)
  assert.deepEqual([...SEWN_CARDS], ["atelier", ...LOCAL_SERVICES.map((service) => service.slug)]);
  assert.equal(cardRoute.dynamic, "force-static", "drawn once at build time");
  assert.equal(cardRoute.dynamicParams, false, "and no other card is drawn on request");
  assert.deepEqual(cardRoute.generateStaticParams(), SEWN_CARDS.map((name) => ({ card: `${name}.png` })));
  for (const name of SEWN_CARDS) {
    const response = await fetchCard(`${name}.png`);
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get("content-type"), "image/png");
    const png = await drawn(response);
    assert.deepEqual({ width: png.width, height: png.height }, size, name);
    // WhatsApp is widely seen to drop a preview picture over about 300 KB
    assert.ok(png.bytes.length < 280_000, `${name} is ${png.bytes.length} bytes`);
  }
  for (const nowhere of ["not-a-service.png", "atelier", "atelier.jpg"]) {
    assert.equal((await fetchCard(nowhere)).status, 404, nowhere);
  }
  // The renders above are this file's first of these cards, so a fetch would be on record
  assert.deepEqual(networkCalls, [], "drawing a card reached the network");
});

test("a card's address moves when what it shows moves, and every page that names it names it the same way", () => {
  for (const name of SEWN_CARDS) {
    const content = sewnCardFor(name)!;
    const [image] = sewnCardImages(name);
    assert.equal(image.url, `${SITE_URL}/cards/${name}.png?v=${cardVersion(content.lead, content.priceFrom)}`);
    assert.deepEqual({ width: image.width, height: image.height }, size);
    assert.equal(image.alt, sewnCardAlt(content.lead, content.priceFrom));
  }
  assert.deepEqual(ATELIER_CARD_IMAGES, sewnCardImages("atelier"));
  assert.throws(() => sewnCardImages("nope"));
  // A new price, a new address
  assert.notEqual(cardVersion("Wedding Dress Alterations", "£45"), cardVersion("Wedding Dress Alterations", "£50"));
  assert.match(cardVersion("x", null), /^[0-9a-f]{10}$/);
  // The home page, the atelier and each alteration page name their card in both blocks
  for (const [file, call] of [
    ["page.tsx", /images: ATELIER_CARD_IMAGES/],
    ["atelier/layout.tsx", /images: ATELIER_CARD_IMAGES/],
    ["alterations/[slug]/page.tsx", /images: sewnCardImages\(service\.slug\)/],
  ] as const) {
    const source = stripComments(readFileSync(join(APP_DIR, file), "utf8"));
    for (const key of file === "page.tsx" ? ["openGraph"] : ["openGraph", "twitter"]) {
      const [block] = blocksFor(source, key);
      assert.match(block, call, `${file} ${key}`);
    }
  }
});

test("a new look or new artwork comes with a new design mark", async () => {
  assert.equal(CARD_DESIGN, PINNED.design, "CARD_DESIGN changed: paste the new hashes into PINNED");
  const artwork = readFileSync(join(PUBLIC_DIR, "beautasy-atelier-art.png"));
  assert.equal(sha256(artwork), PINNED.artwork, "the artwork changed: change CARD_DESIGN and PINNED");
  // The pixels, not the file: an encoder's choices are not a new look
  const sample = await drawn(sewnCard({ lead: "Sample & test", priceFrom: "£1.50" }));
  const pixels = await sharp(sample.bytes).raw().toBuffer();
  assert.equal(sha256(pixels), PINNED.sample, "the card's drawing changed: change CARD_DESIGN and PINNED");
});

test("a card says what its page's heading says, at the price its page and its description show", async () => {
  for (const service of LOCAL_SERVICES) {
    const lead = sewnLead(service.h1);
    assert.equal(`${lead} in Southampton`, service.h1, service.slug);
    const price = lowestPrice(service.prices)!;
    assert.deepEqual(sewnCardFor(service.slug), { lead, priceFrom: price });
    const [image] = sewnCardImages(service.slug);
    assert.ok(image.alt.includes(service.h1) && image.alt.includes(price), image.alt);
    // The description printed under the picture in the same preview: the
    // card's "from" price is in it, and every price in it is on the page
    assert.ok(service.metaDescription.length <= 160, `${service.slug} description is ${service.metaDescription.length} characters`);
    assert.match(service.metaDescription, new RegExp(`from ${price.replace(".", "\\.")}\\b`, "i"), service.slug);
    const listed = new Set(service.prices.map((line) => /£\d+(?:\.\d+)?/.exec(line.price)?.[0]));
    for (const [figure] of service.metaDescription.matchAll(/£\d+(?:\.\d+)?/g)) {
      assert.ok(listed.has(figure), `${service.slug}: ${figure} is not on the page's list`);
    }
  }
  // The same lowest price the page's hero prints under its heading
  const page = stripComments(readFileSync(join(APP_DIR, "alterations", "[slug]", "page.tsx"), "utf8"));
  assert.match(page, /const priceFrom = lowestPrice\(service\.prices\);/);
  // The atelier's card: the home page's heading, at the price its hero shows
  assert.deepEqual(sewnCardFor("atelier"), { lead: ATELIER_LEAD, priceFrom: lowestPrice() });
  assert.match(stripComments(readFileSync(join(APP_DIR, "page.tsx"), "utf8")), /const priceFrom = lowestPrice\(\);/);
  // The atelier's card sews the home page's heading
  const home = renderToStaticMarkup(createElement(HomeContent, { priceFrom: "£8" }));
  const h1 = (/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(home)?.[1] ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  assert.equal(h1, `${ATELIER_LEAD} in Southampton`);
  // A line never ends on "&"
  assert.equal(bindAmpersands("Zip Replacement & Repairs"), `Zip Replacement &${String.fromCharCode(160)}Repairs`);
});

test("every other route that sets openGraph still names a picture", () => {
  const files = routeFilesDeclaringOpenGraph();
  assert.ok(files.length > 5, "the sweep found almost nothing — it is probably looking in the wrong place");

  for (const file of files) {
    const where = relative(APP_DIR, file);
    if (where === "layout.tsx") continue; // the one segment that inherits the file convention

    // A segment that draws its own card: the file convention wins over the
    // metadata there anyway, so naming a picture as well only says something
    // the page does not do — and twitter would keep the stale one
    // (The root's own card is named by the home page on purpose, tested above.)
    if (dirname(file) !== APP_DIR && existsSync(join(dirname(file), "opengraph-image.tsx"))) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const key of ["openGraph", "twitter"]) {
        for (const block of blocksFor(source, key)) {
          assert.doesNotMatch(block, /\bimages\b/, `${where} has its own opengraph-image.tsx, so its ${key} block names no picture`);
        }
      }
      continue;
    }

    for (const block of blocksFor(stripComments(readFileSync(file, "utf8")), "openGraph")) {
      assert.match(
        block,
        /\bimages\b/,
        `${where} declares an openGraph block without images. Next replaces openGraph whole between segments instead of merging it, so this page ships no og:image at all — which is what /refer, /gift-cards and /gift-boxes were doing. Import SOCIAL_CARD_IMAGES from @/lib/socialCard.`,
      );
    }
  }
});

test("every declared picture is the size the file really is", () => {
  const declared = declaredImages();
  assert.ok(declared.length > 0, "no longhand image descriptors found — the scan is broken");

  let measured = 0;
  for (const image of declared) {
    const file = publicFileIn(image.urlExpression);
    if (!file) continue; // a Sanity URL, or the generated card, both checked elsewhere

    const real = measure(file);
    const where = relative(APP_DIR, image.file);
    assert.deepEqual(
      { width: image.width, height: image.height },
      { width: real.width, height: real.height },
      `${where} declares ${file.split("/").pop()} as ${image.width}x${image.height}; the file is ${real.width}x${real.height}. A scraper reserves the space it is told about and then fits the real picture into it.`,
    );
    measured++;
  }

  // No route names a file in public/ since 07.10.2026 — the atelier's
  // pictures are drawn — so this only proves the lookup itself still works
  assert.ok(measured > 0 || publicFileIn("/beautasy-atelier-og.jpg"), "publicFileIn finds nothing in public/");
});

test("every picture the site serves is the format its name claims", () => {
  // public/beautasy-icon.png was a JPEG with a .png name for a year. Nothing
  // broke visibly — browsers sniff the bytes — but Vercel sends it as
  // image/png on the strength of the extension, which is a lie told to every
  // client that believes the header.
  const named = new Set<string>();

  for (const image of declaredImages()) {
    const file = publicFileIn(image.urlExpression);
    if (file) named.add(file);
  }

  const layout = stripComments(readFileSync(join(APP_DIR, "layout.tsx"), "utf8"));
  for (const block of blocksFor(layout, "icons")) {
    for (const match of block.matchAll(/["'`](\/[^"'`]+)["'`]/g)) {
      const file = publicFileIn(match[1]);
      if (file) named.add(file);
    }
  }
  // The artwork the atelier's cards are drawn from, read by src/lib/sewnCard.tsx
  for (const source of ["/beautasy-atelier-og.jpg", "/beautasy-atelier-art.png"]) {
    const file = publicFileIn(source);
    assert.ok(file, `${source} is in public/`);
    named.add(file);
  }

  assert.ok(named.size > 0, "no local images were found to check");

  for (const file of named) {
    const expected = /\.png$/.test(file) ? "png" : "jpeg";
    assert.equal(
      measure(file).format,
      expected,
      `${file.split("/").pop()} is not a ${expected} despite its name, and it is served with a content type taken from that name`,
    );
  }
});

/* ─── Proof that this domain is ours ─── */

test("Pinterest keeps its proof of ownership", () => {
  const tags = domainVerificationTags({});
  assert.match(tags["p:domain_verify"], /^[a-f0-9]{32}$/);
});

test("Meta's tag appears once the token is set", () => {
  const tags = domainVerificationTags({
    META_DOMAIN_VERIFICATION: "qwe123rty456",
  });
  assert.equal(tags["facebook-domain-verification"], "qwe123rty456");
});

test("Meta's tag is absent, not empty, when the token is missing", () => {
  // An empty content attribute is worse than no tag: Meta reads it as a token
  // that does not match and calls the domain unverified.
  for (const env of [{}, { META_DOMAIN_VERIFICATION: "" }, { META_DOMAIN_VERIFICATION: "   " }]) {
    const tags = domainVerificationTags(env);
    assert.ok(
      !("facebook-domain-verification" in tags),
      `an unset token still produced a tag for ${JSON.stringify(env)}`,
    );
  }
});

test("pasting the whole tag Meta hands you still works", () => {
  // Business Manager shows the finished tag next to a copy button and never
  // shows the bare token, so the tag is what is most likely to end up in the
  // environment variable.
  const pasted = [
    '<meta name="facebook-domain-verification" content="qwe123rty456" />',
    "<meta name='facebook-domain-verification' content='qwe123rty456'>",
    '  <meta name="facebook-domain-verification" content = "qwe123rty456"/>  ',
  ];

  for (const value of pasted) {
    const tags = domainVerificationTags({ META_DOMAIN_VERIFICATION: value });
    assert.equal(
      tags["facebook-domain-verification"],
      "qwe123rty456",
      `the token was not recovered from ${value}`,
    );
  }
});

test("a token that is not a token produces no tag at all", () => {
  // Half a tag, or a sentence, would otherwise be rendered into the content
  // attribute and break the markup around it. Verification fails either way;
  // only the missing tag is visible in the page source.
  const broken = [
    "<meta name=facebook-domain-verification content=qwe123>",
    "qwe123 rty456",
    "<meta",
    'qwe"123',
  ];

  for (const value of broken) {
    const tags = domainVerificationTags({ META_DOMAIN_VERIFICATION: value });
    assert.ok(
      !("facebook-domain-verification" in tags),
      `${JSON.stringify(value)} was accepted as a Meta token`,
    );
  }
});

test("the layout builds its verification tags from the helper", () => {
  // Otherwise the tests above would pass while the page served a hardcoded
  // list that Meta's token never reaches.
  const source = stripComments(readFileSync(join(APP_DIR, "layout.tsx"), "utf8"));
  assert.match(source, /verification:\s*\{\s*other:\s*domainVerificationTags\(\)/);
});
