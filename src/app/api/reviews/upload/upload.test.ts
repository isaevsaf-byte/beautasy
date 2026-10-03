import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { sanityWriteClient } from "@/lib/sanity";
import { REVIEW_UPLOAD_SOURCE, reviewUploadMark } from "@/lib/reviewPhotos";
import type { TokenOrder } from "@/lib/reviewToken";
import { photoAllowance, POST, sniffImage, UPLOADS_PER_PIECE, UPLOADS_PER_PIECE_PER_DAY } from "./route";

/**
 * Review photos go into Sanity before the review they belong to is checked,
 * so this door decides who can put files into the shop's public asset store.
 * It used to be anyone with an account — and anyone can make one — with no
 * cap that held across servers, and it believed the browser about what the
 * file was. Now: a review link's token only, a cap per piece on the link
 * counted in Sanity, and the file's own first bytes say what it is.
 *
 * And what goes in is never the file as it came. The dataset is public and
 * Sanity serves the stored file at its own address, so an original with GPS in
 * its EXIF would tell anyone where the customer lives. The route stores a
 * fresh JPEG drawn from the pixels instead (see @/lib/cleanPhoto).
 */

const ROUTE = readFileSync(join(process.cwd(), "src", "app", "api", "reviews", "upload", "route.ts"), "utf8");

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])));

test("a photo is known by its first bytes", () => {
  assert.equal(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, "JFIF"))?.contentType, "image/jpeg");
  assert.equal(sniffImage(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d))?.contentType, "image/png");
  assert.equal(sniffImage(bytes("RIFF", 0x24, 0, 0, 0, "WEBPVP8 "))?.contentType, "image/webp");
  // What an iPhone writes: a box size, then "ftyp", then the brand
  assert.equal(sniffImage(bytes(0, 0, 0, 0x18, "ftypheic", 0, 0, 0, 0, "mif1"))?.contentType, "image/heic");
  assert.equal(sniffImage(bytes(0, 0, 0, 0x18, "ftyphevc"))?.extension, "heic");
});

test("anything else is not a photo, whatever it calls itself", () => {
  const notPhotos: [string, Uint8Array][] = [
    ["an empty file", bytes()],
    ["an HTML page", bytes("<!doctype html><script>")],
    ["an SVG", bytes("<svg xmlns=")],
    ["a PDF", bytes("%PDF-1.7")],
    ["a GIF", bytes("GIF89a")],
    ["a RIFF that is a WAV", bytes("RIFF", 0, 0, 0, 0, "WAVEfmt ")],
    ["an MP4 video", bytes(0, 0, 0, 0x18, "ftypisom")],
    ["a QuickTime video", bytes(0, 0, 0, 0x14, "ftypqt  ")],
    ["two bytes of a JPEG", bytes(0xff, 0xd8)],
  ];
  for (const [what, file] of notPhotos) assert.equal(sniffImage(file), null, `${what} was taken for a photo`);
});

function upload(token?: string): NextRequest {
  const form = new FormData();
  if (token !== undefined) form.append("token", token);
  form.append("file", new File([bytes(0xff, 0xd8, 0xff, 0xe0)], "photo.jpg", { type: "image/jpeg" }));
  return new NextRequest("https://www.beautasy.co.uk/api/reviews/upload", { method: "POST", body: form });
}

test("without a review link's token nothing is uploaded, signed in or not", async () => {
  const real = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    asked.push(String(url));
    return new Response(null, { status: 599 });
  }) as typeof fetch;
  try {
    for (const token of [undefined, "", "too-short"]) {
      const res = await POST(upload(token));
      assert.equal(res.status, 401, `token ${JSON.stringify(token)} was let through`);
    }
    assert.deepEqual(asked, [], "nothing was asked of Sanity, and nothing uploaded");
  } finally {
    globalThis.fetch = real;
  }
});

test("a signed-in account is no longer a way in", () => {
  assert.doesNotMatch(ROUTE, /currentUserId|clerk/i, "an account anyone can make is not proof of a purchase");
  assert.match(ROUTE, /const order = typeof token === "string" \? await findOrderByReviewToken\(token\) : null;/);
});

test("each piece on a link has a cap: per day in memory, and for good in Sanity, before anything is uploaded", () => {
  assert.ok(UPLOADS_PER_PIECE_PER_DAY >= 4 && UPLOADS_PER_PIECE >= UPLOADS_PER_PIECE_PER_DAY, "room for the form's four photos and a retry");
  assert.match(ROUTE, /`review-upload:order:\$\{order\._id\}:\$\{productId\}`,\s+UPLOADS_PER_PIECE_PER_DAY,/, "keyed by the order and the piece, not by address");
  const counted = ROUTE.indexOf("if (already >= photoAllowance(order))");
  const uploaded = ROUTE.indexOf("sanityWriteClient.assets.upload(");
  assert.ok(counted !== -1 && uploaded !== -1 && counted < uploaded, "the count is checked before the upload");
  assert.match(ROUTE, /source: \{ name: REVIEW_UPLOAD_SOURCE, id: mark \}/, "uploads are marked so they can be counted");
});

test("a link's allowance is the per-piece cap for every piece it covers, counted once each", () => {
  const order = (...productIds: (string | undefined)[]): TokenOrder => ({
    _id: "o",
    createdAt: "2026-09-20T10:00:00Z",
    items: productIds.map((productId) => ({ productId, name: "x", quantity: 1 })),
  });
  assert.equal(photoAllowance(order("robe")), UPLOADS_PER_PIECE);
  assert.equal(photoAllowance(order("robe", "slip", "bra")), UPLOADS_PER_PIECE * 3);
  assert.equal(photoAllowance(order("robe", "robe")), UPLOADS_PER_PIECE, "two of one piece is still one form");
  assert.equal(photoAllowance(order(undefined, "robe")), UPLOADS_PER_PIECE, "a line with no product has no form");
  assert.equal(photoAllowance(order()), UPLOADS_PER_PIECE);
});

test("Sanity is told what was made, never what the browser claimed", () => {
  const upload = ROUTE.slice(ROUTE.indexOf("sanityWriteClient.assets.upload("));
  assert.match(upload, /^sanityWriteClient\.assets\.upload\("image", photo, \{/, "the cleaned copy, not the bytes as they came");
  assert.match(upload, /contentType: "image\/jpeg",/);
  assert.match(upload, /filename: "review-photo\.jpg",/, "the customer's own file name stays off the public asset");
  assert.doesNotMatch(ROUTE, /file\.type|file\.name/);
});

/* ─── Through the door for real, with a pretend Sanity ─── */

interface Stored {
  bytes: Buffer;
  options: { filename?: string; contentType?: string; source?: { name: string; id: string } };
}

/**
 * Sanity as the route sees it: the order a link belongs to, the count of
 * photos already uploaded with it, and an asset store that keeps what it is
 * given. Like the real one, the same bytes twice are one asset.
 */
function pretendSanity(t: TestContext, order: TokenOrder): Stored[] {
  const stored: Stored[] = [];
  const assets = new Set<string>();
  t.mock.method(sanityWriteClient, "fetch", async (query: string) => {
    if (query.includes('_type == "order"')) return order;
    if (query.startsWith("count(")) return assets.size;
    throw new Error(`Not a question this route asks: ${query}`);
  });
  t.mock.method(sanityWriteClient.assets, "upload", async (_kind: string, bytes: Buffer, options: Stored["options"]) => {
    const id = `image-${createHash("sha1").update(bytes).digest("hex")}`;
    assets.add(id);
    stored.push({ bytes, options });
    return { _id: id };
  });
  return stored;
}

function withSecrets(t: TestContext): void {
  const before = { write: process.env.SANITY_API_WRITE_TOKEN, data: process.env.DATA_SECRET };
  process.env.SANITY_API_WRITE_TOKEN = "test-write-token";
  process.env.DATA_SECRET = "test-secret-for-the-review-upload-suite";
  t.after(() => {
    for (const [name, value] of [["SANITY_API_WRITE_TOKEN", before.write], ["DATA_SECRET", before.data]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

const LINK = "a-review-link-token-of-decent-length";

function photoUpload(file: Uint8Array, ip: string, productId?: string): NextRequest {
  const form = new FormData();
  form.append("token", LINK);
  if (productId !== undefined) form.append("productId", productId);
  form.append("file", new File([Uint8Array.from(file)], "IMG_0042.jpg", { type: "image/jpeg" }));
  return new NextRequest("https://www.beautasy.co.uk/api/reviews/upload", {
    method: "POST",
    body: form,
    headers: { "x-forwarded-for": ip },
  });
}

function orderOf(id: string, ...productIds: string[]): TokenOrder {
  return {
    _id: id,
    createdAt: "2026-09-20T10:00:00Z",
    items: productIds.map((productId) => ({ productId, name: productId, quantity: 1 })),
  };
}

/** A small photo of one flat colour, so each one is a different file. */
async function plainPhoto(shade: number, format: "jpeg" | "png" | "webp" = "jpeg", width = 40, height = 30): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: shade, g: 120, b: 160 } } })[format]().toBuffer();
}

/**
 * What an iPhone photo AirDropped to a laptop carries: the camera, which way
 * up it was held, a colour profile, and where it was taken.
 */
async function photoFromHome(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: "#c08080" } })
    .withMetadata({
      orientation: 6,
      exif: {
        IFD0: { Make: "Apple", Model: "iPhone 15 Pro" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "50/1 54/1 2160/100", GPSLongitudeRef: "W", GPSLongitude: "1/1 24/1 0/1" },
      },
    })
    .jpeg()
    .toBuffer();
}

/** The GPS block's own tag, 0x8825, as it sits in EXIF either way round. */
function hasGpsBlock(exif: Buffer | undefined): boolean {
  return !!exif && (exif.includes(Buffer.from([0x88, 0x25])) || exif.includes(Buffer.from([0x25, 0x88])));
}

test("what is stored is a new JPEG, upright, with nothing of the original's metadata", async (t) => {
  withSecrets(t);
  const order = orderOf("order-exif", "silk-slip");
  const stored = pretendSanity(t, order);
  const original = await photoFromHome();
  const before = await sharp(original).metadata();
  assert.ok(hasGpsBlock(before.exif) && before.icc && before.orientation === 6, "the test photo really does carry GPS, a profile and a turn");

  const res = await POST(photoUpload(original, "10.1.0.1", "silk-slip"));
  assert.equal(res.status, 201);
  assert.equal(stored.length, 1);
  const { bytes, options } = stored[0];

  assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], "a JPEG");
  assert.notDeepEqual(bytes, original, "never the bytes as they came");
  const after = await sharp(bytes).metadata();
  assert.equal(after.exif, undefined, "no EXIF, so no GPS and no camera");
  assert.equal(after.xmp, undefined);
  assert.equal(after.iptc, undefined);
  assert.equal(after.icc, undefined);
  assert.ok(!bytes.includes(Buffer.from("Exif\0\0")) && !bytes.includes(Buffer.from("iPhone")), "not even a stray copy");
  assert.equal(hasGpsBlock(bytes), false);
  // Held on its side: turned upright before the turn was thrown away with the rest
  assert.deepEqual([after.width, after.height, after.orientation], [20, 40, undefined]);

  assert.equal(options.contentType, "image/jpeg");
  assert.equal(options.filename, "review-photo.jpg");
  assert.deepEqual(options.source, { name: REVIEW_UPLOAD_SOURCE, id: reviewUploadMark(order._id) }, "the mark the review is checked against");
});

test("PNG and WebP are stored as JPEG too, and nothing longer than 2000 pixels", async (t) => {
  withSecrets(t);
  const stored = pretendSanity(t, orderOf("order-sizes", "robe"));
  const png = await sharp({ create: { width: 3000, height: 1500, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .withMetadata({ exif: { IFD0: { Make: "Apple" } } })
    .png()
    .toBuffer();
  const webp = await plainPhoto(30, "webp", 1200, 2400);

  for (const file of [png, webp]) assert.equal((await POST(photoUpload(file, "10.1.0.2", "robe"))).status, 201);
  const [fromPng, fromWebp] = await Promise.all(stored.map(({ bytes }) => sharp(bytes).metadata()));
  assert.deepEqual([fromPng.format, fromPng.width, fromPng.height, fromPng.exif], ["jpeg", 2000, 1000, undefined]);
  assert.deepEqual([fromWebp.format, fromWebp.width, fromWebp.height], ["jpeg", 1000, 2000]);
  assert.ok(stored.every(({ options }) => options.contentType === "image/jpeg"));
});

test("a HEIC photo is turned away kindly, and nothing is stored", async (t) => {
  withSecrets(t);
  const stored = pretendSanity(t, orderOf("order-heic", "robe"));
  const heic = bytes(0, 0, 0, 0x18, "ftypheic", 0, 0, 0, 0, "mif1heic", 0, 0, 0, 0x20, "meta");

  const res = await POST(photoUpload(heic, "10.1.0.3", "robe"));
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /HEIC/);
  assert.match(error, /JPEG/, "and says what will do instead");
  assert.equal(stored.length, 0);
});

test("a file that only starts like a JPEG is refused, never stored as it came", async (t) => {
  withSecrets(t);
  const stored = pretendSanity(t, orderOf("order-junk", "robe"));
  const res = await POST(photoUpload(bytes(0xff, 0xd8, 0xff, 0xe0, "not really a photo at all"), "10.1.0.4", "robe"));
  assert.equal(res.status, 400);
  assert.equal(stored.length, 0);
});

/* ─── One link, several pieces ─── */

test("each piece on the review page gets its own photos: three pieces, three photos each", async (t) => {
  withSecrets(t);
  const stored = pretendSanity(t, orderOf("order-three", "bra", "brief", "robe"));
  const statuses: number[] = [];
  let shade = 0;
  for (const piece of ["bra", "brief", "robe"]) {
    for (let i = 0; i < 3; i++) statuses.push((await POST(photoUpload(await plainPhoto(shade++), "10.1.0.5", piece))).status);
  }
  assert.deepEqual(statuses, Array(9).fill(201));
  assert.equal(stored.length, 9);
});

test("four pieces with the form's four photos each all go in", async (t) => {
  withSecrets(t);
  pretendSanity(t, orderOf("order-four", "a", "b", "c", "d"));
  const statuses: number[] = [];
  let shade = 0;
  for (const piece of ["a", "b", "c", "d"]) {
    for (let i = 0; i < 4; i++) statuses.push((await POST(photoUpload(await plainPhoto(shade++), "10.1.0.6", piece))).status);
  }
  assert.deepEqual(statuses, Array(16).fill(201));
});

test("a piece's day still has a stop", async (t) => {
  withSecrets(t);
  pretendSanity(t, orderOf("order-day", "robe", "slip"));
  const statuses: number[] = [];
  for (let i = 0; i <= UPLOADS_PER_PIECE_PER_DAY; i++) statuses.push((await POST(photoUpload(await plainPhoto(i), "10.1.0.7", "robe"))).status);
  assert.deepEqual(statuses, [...Array(UPLOADS_PER_PIECE_PER_DAY).fill(201), 429]);
  // The other piece on the same link is not held up by it
  assert.equal((await POST(photoUpload(await plainPhoto(99), "10.1.0.7", "slip"))).status, 201);
});

test("the cap for good grows with the pieces bought, and still holds", async (t) => {
  withSecrets(t);
  const order = orderOf("order-cap", "robe", "slip");
  let already = 0;
  t.mock.method(sanityWriteClient, "fetch", async (query: string) => {
    if (query.includes('_type == "order"')) return order;
    return already;
  });
  const upload = t.mock.method(sanityWriteClient.assets, "upload", async () => ({ _id: "image-x" }));

  // One piece's worth uploaded: the other piece still has its own
  already = UPLOADS_PER_PIECE + 4;
  assert.equal((await POST(photoUpload(await plainPhoto(1), "10.1.0.8", "slip"))).status, 201);

  // Both pieces' worth: that is all this link can add
  already = UPLOADS_PER_PIECE * 2;
  const res = await POST(photoUpload(await plainPhoto(2), "10.1.0.8", "slip"));
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /all the photos/);
  assert.equal(upload.mock.callCount(), 1);
});

test("a photo for a piece that is not in the order, or for no piece, is refused", async (t) => {
  withSecrets(t);
  const stored = pretendSanity(t, orderOf("order-other", "robe"));
  for (const productId of ["someone-elses-piece", "", undefined]) {
    const res = await POST(photoUpload(await plainPhoto(5), "10.1.0.9", productId));
    assert.equal(res.status, 400, `piece ${JSON.stringify(productId)} was let through`);
  }
  assert.equal(stored.length, 0);
});
