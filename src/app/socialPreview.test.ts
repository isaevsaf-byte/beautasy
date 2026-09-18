import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import ogImage, { alt, contentType, size } from "./opengraph-image";
import { domainVerificationTags } from "../lib/domainVerification";
import { SOCIAL_CARD_IMAGES, SOCIAL_CARD_URL } from "../lib/socialCard";

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
  // same segment. `icons` is a different key and still points at the square
  // icon, because a favicon wants one.
  for (const key of ["openGraph", "twitter"]) {
    const blocks = blocksFor(source, key);
    assert.equal(blocks.length, 1, `expected exactly one ${key} block in the root layout`);
    assert.doesNotMatch(
      blocks[0],
      /\bimages\b/,
      `naming images in the root ${key} block overrides the generated card, and the file it named before was 1378x1179 — the shape that gets cropped`,
    );
  }

  assert.match(source, /icons\s*:/, "the favicon should still be declared");
});

test("every other route that sets openGraph still names a picture", () => {
  const files = routeFilesDeclaringOpenGraph();
  assert.ok(files.length > 5, "the sweep found almost nothing — it is probably looking in the wrong place");

  for (const file of files) {
    const where = relative(APP_DIR, file);
    if (where === "layout.tsx") continue; // the one segment that inherits the file convention

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

  assert.ok(measured > 0, "nothing in public/ was actually measured — publicFileIn found no files");
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
