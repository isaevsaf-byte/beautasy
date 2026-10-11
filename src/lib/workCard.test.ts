import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { sanityClient } from "./sanity";
import { SITE_URL } from "./site";
import { photoSize, plainTitle, workCard } from "./workCard";
import {
  WORK_CARD_DESIGN,
  workCardAlt,
  workCardImages,
  workCardOf,
  workCardVersion,
  workPieceDescription,
} from "./workCardVersion";
import type { WorkPhoto, WorkPiece, WorkVideo } from "./work";
import * as route from "../app/cards/work/[file]/route";

/**
 * A piece of work's own link-preview card (11.10.2026): which pictures it
 * shows, the address that changes when they change, and the file a chat app
 * is sent — a JPEG light enough for WhatsApp, kept by the CDN for a year only
 * when it is the card the page names.
 */

const photo = (ref: string, extra: Partial<WorkPhoto> = {}): WorkPhoto => ({
  kind: "photo",
  key: ref,
  alt: null,
  image: { asset: { _ref: `image-${ref}-1800x2400-jpg` } },
  width: 1800,
  height: 2400,
  lqip: null,
  ...extra,
});

const film = (extra: Partial<WorkVideo> = {}): WorkVideo => ({
  kind: "video",
  key: "v",
  alt: null,
  url: "https://cdn.sanity.io/files/p/production/film.mp4",
  width: 720,
  height: 1280,
  duration: 12,
  poster: { asset: { _ref: "image-cover-1080x1920-jpg" } },
  lqip: null,
  ...extra,
});

const piece = (extra: Partial<WorkPiece> = {}): WorkPiece => ({
  id: "workPiece-grey-eyelet-curtains",
  title: "Lined eyelet curtains, taken up",
  caption: "Too long and pooling on the floor.",
  category: "home",
  service: null,
  shelf: null,
  date: "2026-09-27",
  before: null,
  media: [photo("after"), photo("lining")],
  ...extra,
});

test("the card shows what the viewer opens on: the before and after, the cover, a film's cover, or nothing", () => {
  const pair = workCardOf(piece({ before: photo("before") }));
  assert.deepEqual(
    pair.photos.map((p) => [p.tag, p.image.asset._ref]),
    [
      ["Before", "image-before-1800x2400-jpg"],
      ["After", "image-after-1800x2400-jpg"],
    ],
  );
  // A before with a film first is not a pair in the viewer, nor here
  assert.deepEqual(workCardOf(piece({ before: photo("before"), media: [film()] })).photos, [{ tag: "Film", image: film().poster! }]);
  assert.deepEqual(workCardOf(piece()).photos, [{ tag: null, image: photo("after").image }]);
  assert.deepEqual(workCardOf(piece({ media: [film({ poster: null })] })).photos, [], "Kristina's artwork stands in");
  assert.equal(workCardAlt(pair), "Lined eyelet curtains, taken up, before and after: work from Beautasy Atelier in Southampton.");
  assert.equal(workCardAlt(workCardOf(piece())), "Lined eyelet curtains, taken up: work from Beautasy Atelier in Southampton.");
});

test("the card's address moves when its title, its photos or Kristina's crop of them move", () => {
  const base = workCardOf(piece());
  const version = workCardVersion(base);
  assert.match(version, /^[0-9a-f]{10}$/);
  assert.equal(workCardVersion(workCardOf(piece())), version, "the same piece, the same address");
  for (const [what, changed] of [
    ["title", piece({ title: "Curtains, taken up" })],
    ["cover", piece({ media: [photo("other")] })],
    ["crop", piece({ media: [photo("after", { image: { asset: { _ref: "image-after-1800x2400-jpg" }, crop: { top: 0.1, bottom: 0, left: 0, right: 0 } } })] })],
    ["focus", piece({ media: [photo("after", { image: { asset: { _ref: "image-after-1800x2400-jpg" }, hotspot: { x: 0.3, y: 0.5, width: 1, height: 1 } } })] })],
    ["a before", piece({ before: photo("before") })],
  ] as const) {
    assert.notEqual(workCardVersion(workCardOf(changed)), version, what);
  }
  // A caption or a second photo is not on the card, so it moves nothing
  assert.equal(workCardVersion(workCardOf(piece({ caption: "New words", media: [photo("after")] }))), version);

  const [image] = workCardImages(piece(), "grey-eyelet-curtains");
  assert.equal(image.url, `${SITE_URL}/cards/work/grey-eyelet-curtains.jpg?v=${version}`);
  assert.deepEqual({ width: image.width, height: image.height, type: image.type }, { width: 1200, height: 630, type: "image/jpeg" });
  assert.equal(image.alt, workCardAlt(base));
});

test("the line under the card is the caption, cut at a word where Google and Facebook cut", () => {
  assert.equal(workPieceDescription({ title: "T", caption: "  Short  and\nsweet. " }), "Short and sweet.");
  assert.equal(workPieceDescription({ title: "Scrunchies by the pile", caption: null }), "Scrunchies by the pile: real work from Beautasy's Southampton workroom.");
  const long = "Too long and pooling on the floor. Measured, taken up and rehung — now these lined curtains hang in even folds that just touch it. Shown from the front and from the lining side.";
  const cut = workPieceDescription({ title: "T", caption: long });
  assert.ok(cut.length <= 155, `${cut.length}`);
  assert.ok(cut.endsWith("…"));
  assert.ok(long.startsWith(cut.slice(0, -1)), "cut, never reworded");
  assert.match(cut, /\w…$/, "at the end of a word, with no comma or dash before the ellipsis");
});

/* ─── The drawing ─── */

/** A flat photo as a PNG data: URI: lossless, so the pinned pixels are the same on every machine */
async function swatch(width: number, height: number, colour: { r: number; g: number; b: number }): Promise<string> {
  const png = await sharp({ create: { width, height, channels: 3, background: colour } }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function pixels(response: Response) {
  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), raw: await sharp(png).raw().toBuffer() };
}

/**
 * What the card looks like now, pinned, as the atelier's cards are
 * (socialPreview.test.ts): a new look must come with a new WORK_CARD_DESIGN,
 * or chat apps keep showing the old one at the same address. When this fails
 * because the drawing changed on purpose, change WORK_CARD_DESIGN, then paste
 * the new hashes here.
 */
const PINNED = {
  design: "2026-10-11.1",
  single: "0bac5b914d4fa63e6e11596b22deb36197c6fc9733edaa0eba83585f8b92e4ce",
  pair: "f158b3e19ceda5cc4e6271fabe016a62650e10c482c47fa09a17a845b6d0d15e",
};

test("a new look comes with a new design mark", async () => {
  assert.equal(WORK_CARD_DESIGN, PINNED.design, "WORK_CARD_DESIGN changed: paste the new hashes into PINNED");
  const one = photoSize(1);
  const single = await pixels(workCard({ title: "Sample & test", photos: [{ tag: "Film", src: await swatch(one.width, one.height, { r: 120, g: 110, b: 150 }) }] }));
  assert.equal(sha256(single.raw), PINNED.single, "the single card's drawing changed: change WORK_CARD_DESIGN and PINNED");
  const two = photoSize(2);
  const pair = await pixels(
    workCard({
      title: "Sample & test",
      photos: [
        { tag: "Before", src: await swatch(two.width, two.height, { r: 90, g: 90, b: 96 }) },
        { tag: "After", src: await swatch(two.width, two.height, { r: 200, g: 196, b: 210 }) },
      ],
    }),
  );
  assert.equal(sha256(pair.raw), PINNED.pair, "the pair's drawing changed: change WORK_CARD_DESIGN and PINNED");
});

test("one photo, two or none, the card is 1200x630 and its words never reach for a CDN", async (t) => {
  const reached: string[] = [];
  const real = globalThis.fetch;
  t.mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("data:")) reached.push(url);
    return real(input, init);
  });
  const one = photoSize(1);
  const two = photoSize(2);
  assert.deepEqual(one, { width: 365, height: 486 }, "3:4, as Kristina's photos are");
  assert.equal(two.height, one.height);
  for (const photos of [
    [{ tag: null, src: await swatch(one.width, one.height, { r: 1, g: 2, b: 3 }) }],
    [
      { tag: "Before" as const, src: await swatch(two.width, two.height, { r: 1, g: 2, b: 3 }) },
      { tag: "After" as const, src: await swatch(two.width, two.height, { r: 4, g: 5, b: 6 }) },
    ],
    [],
  ]) {
    // Kristina's captions run on emoji, and a title may too: one would be fetched from a CDN to be drawn
    const drawn = await pixels(workCard({ title: "Scrunchies 💜 by the pile ✨", photos }));
    assert.deepEqual({ width: drawn.width, height: drawn.height }, { width: 1200, height: 630 });
  }
  assert.deepEqual(reached, [], "drawing a work card reached the network");
  // Built from code points: several of these are invisible on their own
  const glyphs = (...points: number[]) => String.fromCodePoint(...points);
  const wave = glyphs(0x1f44b, 0x1f3fd);
  const uk = glyphs(0x1f1ec, 0x1f1e7);
  const keycap = glyphs(0x31, 0xfe0f, 0x20e3);
  const england = glyphs(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);
  const family = glyphs(0x1f469, 0x200d, 0x1f467);
  const heart = glyphs(0x2764, 0xfe0f);
  assert.equal(plainTitle(`Scrunchies ${glyphs(0x1f49c)} by the pile ${glyphs(0x2728)}`), "Scrunchies by the pile");
  assert.equal(plainTitle(`Hearts ${heart} & stars ${family}`), "Hearts & stars");
  assert.equal(plainTitle(`Hello ${wave} from ${uk} ${england} No. ${keycap}`), "Hello from No. 1");
  assert.equal(plainTitle("Свадебное платье, подшито"), "Свадебное платье, подшито", "Cyrillic is in the face");
  assert.equal(plainTitle("Café hem — “just so”, £20…"), "Café hem — “just so”, £20…");
  assert.equal(plainTitle(`Cafe${glyphs(0x301)} hem`), "Café hem", "an accent typed apart is joined to its letter");
  assert.equal(plainTitle("Hem 縫い"), "Hem", "a script the face lacks would be fetched");
  // Every kind dropped above, and every mark kept, drawn: still nothing from the network
  const before = reached.length;
  const kept = "Café «hems» & (repairs): 100% — £20.50, €5 at 10°; #1 • it's “just so”… / ok? @here * no!";
  assert.equal(plainTitle(kept), kept);
  await pixels(workCard({ title: `${kept} ${wave}${uk}${keycap}${england}${family}${heart} 縫い`, photos: [] }));
  assert.deepEqual(reached.slice(before), [], "a title reached the network");
});

/* ─── The file a chat app is sent ─── */

const RAW = {
  pieces: [
    {
      id: "workPiece-grey-eyelet-curtains",
      title: "Lined eyelet curtains, taken up",
      caption: "Too long and pooling on the floor.",
      category: "home",
      date: "2026-09-27",
      before: { key: "before", kind: "photo", image: { asset: { _ref: "image-before-1800x2400-jpg" } }, width: 1800, height: 2400 },
      media: [{ key: "a", kind: "photo", image: { asset: { _ref: "image-after-1800x2400-jpg" } }, width: 1800, height: 2400 }],
    },
    {
      id: "workPiece-cut-and-stacked",
      title: "Cut, stacked, ready to sew",
      category: "workroom",
      date: "2026-09-20",
      media: [{ key: "v", kind: "video", url: "https://cdn.sanity.io/files/p/production/film.mp4", poster: { asset: { _ref: "image-cover-1080x1920-jpg" } } }],
    },
  ],
  showreel: null,
};

const PAIR_VERSION = workCardVersion(
  workCardOf(piece({ before: photo("before"), media: [photo("after")] })),
);

/** Sanity's answer and its CDN's photos, as the route sees them; photos as JPEG, as Sanity sends them */
async function stubSanity(t: import("node:test").TestContext, { photos = "ok" as "ok" | "missing" | "down" } = {}) {
  const asked: string[] = [];
  t.mock.method(sanityClient, "fetch", async () => RAW);
  const jpeg = await sharp({ create: { width: 270, height: 486, channels: 3, background: { r: 150, g: 140, b: 170 } } }).jpeg().toBuffer();
  const real = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("data:")) return real(input, init);
    asked.push(url);
    if (photos === "down") throw new TypeError("fetch failed");
    if (photos === "missing") return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg" } });
  });
  return asked;
}

const serve = (file: string, query = "") =>
  route.GET(new Request(`${SITE_URL}/cards/work/${file}${query}`), { params: Promise.resolve({ file }) });

async function jpegOf(response: Response) {
  const bytes = Buffer.from(await response.arrayBuffer());
  const meta = await sharp(bytes).metadata();
  return { bytes, format: meta.format, width: meta.width, height: meta.height };
}

test("the card the page names is a JPEG light enough for WhatsApp, kept by the CDN for a day", async (t) => {
  const asked = await stubSanity(t);
  assert.equal(route.dynamic, "force-dynamic", "drawn on request: a piece published now is sent now");
  const response = await serve("grey-eyelet-curtains.jpg", `?v=${PAIR_VERSION}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal(response.headers.get("cache-control"), "public, max-age=86400, s-maxage=86400");
  const card = await jpegOf(response);
  assert.deepEqual({ format: card.format, width: card.width, height: card.height }, { format: "jpeg", width: 1200, height: 630 });
  // WhatsApp is widely seen to drop a preview picture over about 300 KB
  assert.ok(card.bytes.length < 280_000, `${card.bytes.length} bytes`);
  // Both photos, cut by Sanity to the size they are drawn at, as JPEG
  const { width, height } = photoSize(2);
  assert.equal(asked.length, 2);
  for (const [k, ref] of ["before", "after"].entries()) {
    const url = new URL(asked[k]);
    assert.equal(url.origin, "https://cdn.sanity.io");
    assert.match(url.pathname, new RegExp(`/${ref}-1800x2400\\.jpg$`));
    assert.deepEqual(
      [url.searchParams.get("w"), url.searchParams.get("h"), url.searchParams.get("fit"), url.searchParams.get("fm")],
      [String(width), String(height), "crop", "jpg"],
    );
  }
});

test("an address with an older version, or none, is sent on to the current card without drawing one", async (t) => {
  const asked = await stubSanity(t);
  for (const query of ["", "?v=0123456789", `?v=${PAIR_VERSION}x`, `?v=${PAIR_VERSION}&v=0123456789`, `?v=${PAIR_VERSION}&fresh=1`, `?fresh=1&v=${PAIR_VERSION}`]) {
    const response = await serve("grey-eyelet-curtains.jpg", query);
    assert.equal(response.status, 307, query);
    assert.equal(response.headers.get("location"), `${SITE_URL}/cards/work/grey-eyelet-curtains.jpg?v=${PAIR_VERSION}`, query);
    assert.equal(response.headers.get("cache-control"), "public, max-age=300, s-maxage=300", query);
  }
  assert.deepEqual(asked, [], "a made-up version costs a redirect, not two photos and a drawing");
});

test("a photo that won't load leaves Kristina's artwork on the label, kept only five minutes", async (t) => {
  for (const photos of ["missing", "down"] as const) {
    await t.test(photos, async (t) => {
      t.mock.method(console, "error", () => {});
      await stubSanity(t, { photos });
      const response = await serve("grey-eyelet-curtains.jpg", `?v=${PAIR_VERSION}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "public, max-age=300, s-maxage=300");
      assert.equal((await jpegOf(response)).width, 1200);
    });
  }
});

test("a film's card asks for its cover; a piece taken down, or a name that isn't one, is not found", async (t) => {
  const asked = await stubSanity(t);
  const filmVersion = workCardVersion({ title: "Cut, stacked, ready to sew", photos: [{ tag: "Film", image: { asset: { _ref: "image-cover-1080x1920-jpg" } } }] });
  const response = await serve("cut-and-stacked.jpg", `?v=${filmVersion}`);
  assert.equal(response.headers.get("cache-control"), "public, max-age=86400, s-maxage=86400");
  assert.match(asked[0], /\/cover-1080x1920\.jpg\?/);
  assert.equal(new URL(asked[0]).searchParams.get("w"), String(photoSize(1).width));
  for (const file of ["gone-now.jpg", "grey-eyelet-curtains.png", "grey-eyelet-curtains", "..%2Fsecret.jpg", "a.b.jpg"]) {
    assert.equal((await serve(file)).status, 404, file);
  }
});

test("when Sanity can't be read, the link still shows the atelier's card, for five minutes", async (t) => {
  t.mock.method(console, "error", () => {});
  t.mock.method(sanityClient, "fetch", async () => {
    throw new Error("Sanity is down");
  });
  const response = await serve("grey-eyelet-curtains.jpg", "?v=0123456789");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=300, s-maxage=300");
  assert.equal((await jpegOf(response)).format, "jpeg");
});
