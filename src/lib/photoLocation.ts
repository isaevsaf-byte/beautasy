/**
 * Whether a picture file still says where it was taken.
 *
 * A phone writes the spot a photo was taken into the file itself — GPS in its
 * EXIF block, sometimes again in XMP. The site never shows it, but Sanity
 * keeps every uploaded file exactly as sent, and on this plan the dataset is
 * public: remove `?w=…` from any picture's address and the original comes back,
 * coordinates and all. For a workroom at home, that is the address the Google
 * listing hides on purpose.
 *
 * So the Studio reads the first bytes of each gallery photo after upload and
 * refuses to publish one that carries a location (see workPiece.ts).
 *
 * Reads JPEG, PNG and WebP — wherever a TIFF-shaped EXIF block sits — without
 * decoding the picture, so it runs in the Studio on a few hundred kilobytes.
 */

const GPS_IFD = 0x8825;
const GPS_LATITUDE = 0x0002;
const GPS_LONGITUDE = 0x0004;

function readUint16(bytes: Uint8Array, at: number, little: boolean): number {
  return little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1];
}

function readUint32(bytes: Uint8Array, at: number, little: boolean): number {
  return little
    ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
    : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

/** The tags of one directory, or null when it doesn't fit inside what was read */
function directoryTags(bytes: Uint8Array, tiff: number, offset: number, little: boolean): Map<number, number> | null {
  const at = tiff + offset;
  if (offset < 8 || at + 2 > bytes.length) return null;
  const count = readUint16(bytes, at, little);
  if (count === 0 || count > 1000 || at + 2 + count * 12 > bytes.length) return null;
  const tags = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const entry = at + 2 + i * 12;
    tags.set(readUint16(bytes, entry, little), readUint32(bytes, entry + 8, little));
  }
  return tags;
}

/** A TIFF block at `tiff` (as EXIF is stored) with a GPS directory holding a latitude and longitude */
function tiffHasLocation(bytes: Uint8Array, tiff: number): boolean {
  if (tiff + 8 > bytes.length) return false;
  // Only called where a TIFF signature (byte order + 42) was found
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
  if (!little && !big) return false;
  const first = directoryTags(bytes, tiff, readUint32(bytes, tiff + 4, little), little);
  const gpsOffset = first?.get(GPS_IFD);
  if (gpsOffset === undefined) return false;
  const gps = directoryTags(bytes, tiff, gpsOffset, little);
  return Boolean(gps?.has(GPS_LATITUDE) && gps.has(GPS_LONGITUDE));
}

function indexOf(bytes: Uint8Array, needle: readonly number[], from: number): number {
  outer: for (let i = from; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
const TIFF_LITTLE = [0x49, 0x49, 0x2a, 0x00];
const TIFF_BIG = [0x4d, 0x4d, 0x00, 0x2a];
// XMP writes the same position as text: exif:GPSLatitude="50,54.05N"
const XMP_LATITUDE = ascii("GPSLatitude");

/**
 * True when the bytes carry a location. `bytes` may be only the start of the
 * file: the metadata comes before the picture in every format read here.
 */
export function carriesLocation(bytes: Uint8Array): boolean {
  for (const signature of [TIFF_LITTLE, TIFF_BIG]) {
    for (let at = indexOf(bytes, signature, 0); at !== -1; at = indexOf(bytes, signature, at + 1)) {
      if (tiffHasLocation(bytes, at)) return true;
    }
  }
  return indexOf(bytes, XMP_LATITUDE, 0) !== -1;
}
