import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { carriesLocation } from "./photoLocation";

/**
 * Real files, written by the same library a phone's editor would use, rather
 * than hand-made byte strings: the check has to read what is actually out there.
 */

const canvas = () => sharp({ create: { width: 48, height: 36, channels: 3, background: "#dcd0ff" } });

const WHERE = {
  IFD3: { GPSLatitudeRef: "N", GPSLatitude: "50/1 54/1 3/1", GPSLongitudeRef: "W", GPSLongitude: "1/1 24/1 5/1" },
};
const CAMERA_ONLY = { IFD0: { Make: "Apple", Model: "iPhone 15" } };

async function file(format: "jpeg" | "png" | "webp", exif?: Record<string, Record<string, string>>) {
  const image = exif ? canvas().withExif(exif) : canvas();
  return new Uint8Array(await image[format]().toBuffer());
}

test("a photo that says where it was taken is caught, in every format a phone or an editor saves", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    assert.equal(carriesLocation(await file(format, WHERE)), true, format);
  }
});

test("a photo without a location passes, even one that names the camera", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    assert.equal(carriesLocation(await file(format)), false, `${format}, no metadata`);
    assert.equal(carriesLocation(await file(format, CAMERA_ONLY)), false, `${format}, camera only`);
  }
});

test("a location written only as XMP text is caught too", async () => {
  const xmp =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="50,54.05N" exif:GPSLongitude="1,24.08W"/>' +
    "</rdf:RDF></x:xmpmeta>";
  const bytes = new Uint8Array(await canvas().withXmp(xmp).jpeg().toBuffer());
  assert.equal(carriesLocation(bytes), true);
});

test("the photos the import script makes carry nothing", async () => {
  // The script's own recipe: upright, then re-encoded — metadata is not kept
  const processed = await sharp(await canvas().withExif({ ...WHERE, ...CAMERA_ONLY }).jpeg().toBuffer())
    .rotate()
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  assert.equal(carriesLocation(new Uint8Array(processed)), false);
});

test("only the start of a file, or no picture at all, is read without breaking", async () => {
  const full = await file("jpeg", WHERE);
  // Cut inside the EXIF block: what isn't there can't be read, and nothing throws
  for (const length of [0, 2, 12, 40, 80]) {
    assert.doesNotThrow(() => carriesLocation(full.subarray(0, length)));
  }
  assert.equal(carriesLocation(new Uint8Array(0)), false);
  const noise = new Uint8Array(4096).map((_, i) => (i * 7919) % 256);
  assert.equal(carriesLocation(noise), false);
});
