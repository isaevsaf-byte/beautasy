import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST, sniffImage, UPLOADS_PER_ORDER, UPLOADS_PER_ORDER_PER_DAY } from "./route";

/**
 * Review photos go into Sanity before the review they belong to is checked,
 * so this door decides who can put files into the shop's public asset store.
 * It used to be anyone with an account — and anyone can make one — with no
 * cap that held across servers, and it believed the browser about what the
 * file was. Now: a review link's token only, a cap per link counted in Sanity,
 * and the file's own first bytes say what it is.
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

test("each link has a cap: per day in memory, and for good in Sanity, before anything is uploaded", () => {
  assert.ok(UPLOADS_PER_ORDER_PER_DAY >= 4 && UPLOADS_PER_ORDER >= UPLOADS_PER_ORDER_PER_DAY, "room for the form's four photos and a retry");
  assert.match(ROUTE, /rateLimit\(`review-upload:order:\$\{order\._id\}`, UPLOADS_PER_ORDER_PER_DAY,/, "keyed by the order alone, not by address");
  const counted = ROUTE.indexOf("if (already >= UPLOADS_PER_ORDER)");
  const uploaded = ROUTE.indexOf("sanityWriteClient.assets.upload(");
  assert.ok(counted !== -1 && uploaded !== -1 && counted < uploaded, "the count is checked before the upload");
  assert.match(ROUTE, /source: \{ name: REVIEW_UPLOAD_SOURCE, id: mark \}/, "uploads are marked so they can be counted");
});

test("Sanity is told what the bytes are, never what the browser claimed", () => {
  const upload = ROUTE.slice(ROUTE.indexOf("sanityWriteClient.assets.upload("));
  assert.match(upload, /contentType: image\.contentType,/);
  assert.match(upload, /filename: `review-photo\.\$\{image\.extension\}`,/, "the customer's own file name stays off the public asset");
  assert.doesNotMatch(ROUTE, /file\.type|file\.name/);
});
