import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { carriesLocation } from "./photoLocation";
import { jpegWithoutLocation, orientationOnlyExif, tiffOrientation } from "./stripLocation";

/**
 * Real JPEGs written by sharp, the way a phone writes them: GPS and camera in
 * EXIF, a turned-on-its-side note, a Display P3 colour profile. Taking the
 * location out must leave the picture itself untouched, byte for byte.
 */

const canvas = () => sharp({ create: { width: 48, height: 36, channels: 3, background: "#dcd0ff" } });

const WHERE = {
  IFD0: { Make: "Apple", Model: "iPhone 15" },
  IFD3: { GPSLatitudeRef: "N", GPSLatitude: "50/1 54/1 3/1", GPSLongitudeRef: "W", GPSLongitude: "1/1 24/1 5/1" },
};

/** A phone photo held sideways: located, turned 90° by its EXIF note, in P3 */
async function sideways(): Promise<Uint8Array> {
  return new Uint8Array(await canvas().withExif(WHERE).withMetadata({ orientation: 6 }).withIccProfile("p3").jpeg().toBuffer());
}

const pixels = async (bytes: Uint8Array) => sharp(bytes).raw().toBuffer();

test("a located photo comes out without its location, every pixel as it was", async () => {
  const original = await sideways();
  assert.equal(carriesLocation(original), true, "the fixture really is located");
  const clean = jpegWithoutLocation(original);
  assert.ok(clean);
  assert.equal(carriesLocation(clean), false);
  assert.ok((await pixels(clean)).equals(await pixels(original)), "not re-compressed");
  assert.ok(clean.length < original.length);
});

test("it stays the right way up and keeps its colours", async () => {
  const clean = jpegWithoutLocation(await sideways())!;
  const meta = await sharp(clean).metadata();
  assert.equal(meta.orientation, 6, "the turn-me note is put back");
  assert.ok(meta.icc, "the colour profile is kept");
  assert.equal(meta.width, 48);
  // Nothing of the camera is left either: the new EXIF holds Orientation only
  assert.equal(Buffer.from(clean).includes("iPhone"), false);
  // And a browser turning it upright sees the same picture as before
  const upright = async (bytes: Uint8Array) => sharp(bytes).rotate().raw().toBuffer();
  assert.ok((await upright(clean)).equals(await upright(await sideways())));
});

test("an upright photo loses the EXIF block altogether", async () => {
  const clean = jpegWithoutLocation(new Uint8Array(await canvas().withExif(WHERE).jpeg().toBuffer()))!;
  assert.equal(carriesLocation(clean), false);
  assert.equal((await sharp(clean).metadata()).exif, undefined);
});

test("a location written as XMP text goes too", async () => {
  const xmp =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="50,54.05N" exif:GPSLongitude="1,24.08W"/>' +
    "</rdf:RDF></x:xmpmeta>";
  const original = new Uint8Array(await canvas().withXmp(xmp).jpeg().toBuffer());
  assert.equal(carriesLocation(original), true);
  const clean = jpegWithoutLocation(original)!;
  assert.equal(carriesLocation(clean), false);
  assert.ok((await pixels(clean)).equals(await pixels(original)));
});

test("whatever follows the picture is kept as it is, so a located second image there is still seen", async () => {
  // An iPhone appends a small HDR picture after the main one; if that had a
  // location, the strip leaves it and the Studio redraws instead
  const main = new Uint8Array(await canvas().jpeg().toBuffer());
  const appended = await sideways();
  const both = new Uint8Array([...main, ...appended]);
  const clean = jpegWithoutLocation(both)!;
  assert.deepEqual(clean, both);
  assert.equal(carriesLocation(clean), true);
});

test("bytes that aren't a JPEG, or a JPEG cut short, are not guessed at", async () => {
  assert.equal(jpegWithoutLocation(new Uint8Array(await canvas().withExif(WHERE).png().toBuffer())), null);
  assert.equal(jpegWithoutLocation(new Uint8Array(0)), null);
  const full = await sideways();
  for (const length of [3, 6, 20, 60]) {
    assert.equal(jpegWithoutLocation(full.subarray(0, length)), null, `cut at ${length}`);
  }
});

test("the Orientation note is read back in both byte orders", () => {
  for (let orientation = 1; orientation <= 8; orientation++) {
    const segment = orientationOnlyExif(orientation);
    assert.equal(tiffOrientation(segment.subarray(10)), orientation, "big-endian, as written here");
  }
  // Intel ("II") order, as many cameras write it: one entry, Orientation = 8
  const little = new Uint8Array([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  assert.equal(tiffOrientation(little), 8);
  assert.equal(tiffOrientation(new Uint8Array([0x49, 0x49])), null);
});
