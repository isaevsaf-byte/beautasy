import { readUint16, readUint32 } from "@/lib/photoLocation";

/**
 * A JPEG with where it was taken taken out, and nothing else changed.
 *
 * Why bytes and not a redraw: the picture inside a JPEG is the part after the
 * headers, and the location sits in a header (the EXIF block). Lifting that
 * header out leaves every pixel exactly as the phone saved it and keeps the
 * colour profile (an iPhone's Display P3 lives in its own header). Redrawing
 * on a canvas would compress the photo a second time and turn P3 into plain
 * sRGB — the Studio does that only for files this can't handle (see
 * src/sanity/cleanUploads.ts).
 *
 * What goes:
 * - the EXIF block (APP1 "Exif"): GPS, but also the camera's serial numbers,
 *   Apple's maker notes and a thumbnail — nothing the site uses;
 * - XMP (APP1, Adobe's text metadata), which can repeat the position as text;
 * - IPTC (APP13), which can name the city and the street.
 *
 * What is put back: the one EXIF tag the picture needs, Orientation. A phone
 * stores a photo sideways and notes "turn me 90°" in EXIF; without that note
 * every portrait shot would arrive lying on its side. So when the original
 * had one, a new EXIF block holding only that note takes the old one's place.
 * Nothing else is rebuilt, so a photo needs no canvas to stay upright.
 */

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif" and two zero bytes
const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
const XMP_HEADERS = [ascii("http://ns.adobe.com/xap/1.0/"), ascii("http://ns.adobe.com/xmp/extension/")];

const APP1 = 0xe1;
const APP13 = 0xed;
const START_OF_SCAN = 0xda;
const END_OF_IMAGE = 0xd9;
const ORIENTATION = 0x0112;
const SHORT = 3;

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((b, i) => bytes[i] === b);
}

/** Markers that are two bytes with no length after them */
function standalone(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

/** The Orientation tag (1–8) in a TIFF-shaped EXIF block, or null when it has none */
export function tiffOrientation(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return null;
  const directory = readUint32(tiff, 4, little);
  if (directory < 8 || directory + 2 > tiff.length) return null;
  const count = readUint16(tiff, directory, little);
  for (let i = 0; i < count; i++) {
    const entry = directory + 2 + i * 12;
    if (entry + 12 > tiff.length) return null;
    if (readUint16(tiff, entry, little) !== ORIENTATION || readUint16(tiff, entry + 2, little) !== SHORT) continue;
    // A SHORT sits in the first two bytes of the four-byte value field
    const value = readUint16(tiff, entry + 8, little);
    return value >= 1 && value <= 8 ? value : null;
  }
  return null;
}

/** A whole APP1 segment holding an EXIF block with Orientation and nothing else */
export function orientationOnlyExif(orientation: number): Uint8Array {
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, // big-endian TIFF
    0x00, 0x00, 0x00, 0x08, // the first directory right after this header
    0x00, 0x01, // one entry:
    0x01, 0x12, 0x00, SHORT, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, one SHORT
    0x00, 0x00, 0x00, 0x00, // no further directory
  ];
  const length = 2 + EXIF_HEADER.length + tiff.length;
  return new Uint8Array([0xff, APP1, length >> 8, length & 0xff, ...EXIF_HEADER, ...tiff]);
}

/**
 * The JPEG without its EXIF, XMP and IPTC headers (Orientation kept, see
 * above), or null when the bytes aren't a JPEG this can walk through.
 *
 * Only the headers before the picture are touched. Anything after it is kept
 * as it is — an iPhone appends a second, small picture there for HDR, which
 * can have headers of its own — so the caller still checks the result with
 * carriesLocation and redraws the photo if a location is left.
 */
export function jpegWithoutLocation(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let exifSeen = false;
  let at = 2;
  for (;;) {
    if (at + 2 > bytes.length || bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      // A fill byte before the marker
      at += 1;
      continue;
    }
    if (marker === START_OF_SCAN || marker === END_OF_IMAGE) {
      kept.push(bytes.subarray(at));
      break;
    }
    if (standalone(marker)) {
      kept.push(bytes.subarray(at, at + 2));
      at += 2;
      continue;
    }
    if (at + 4 > bytes.length) return null;
    const end = at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
    if (end < at + 4 || end > bytes.length) return null;
    const payload = bytes.subarray(at + 4, end);
    if (marker === APP1 && startsWith(payload, EXIF_HEADER)) {
      const orientation = tiffOrientation(payload.subarray(EXIF_HEADER.length));
      // Upright (1) is what a picture without the note means anyway
      if (orientation && orientation !== 1 && !exifSeen) kept.push(orientationOnlyExif(orientation));
      exifSeen = true;
    } else if (!(marker === APP1 && XMP_HEADERS.some((header) => startsWith(payload, header))) && marker !== APP13) {
      kept.push(bytes.subarray(at, end));
    }
    at = end;
  }
  const out = new Uint8Array(kept.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of kept) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
