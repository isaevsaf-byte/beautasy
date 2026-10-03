import sharp from "sharp";

/**
 * A customer's review photo, drawn again from its pixels before it is stored.
 *
 * 🚨 Why it matters: the dataset is public, and Sanity hands out the stored
 * file itself, at its own address, to anyone who asks — not only the resized
 * copies the site shows. A photo straight off a phone carries EXIF, and on an
 * iPhone that includes where it was taken: for a photo of a piece being worn,
 * usually the customer's home. Phone pickers often leave the location out; a
 * photo AirDropped to a laptop and attached from there keeps it.
 *
 * So the file she sent is never what is stored. What is stored is a new JPEG
 * made from the decoded picture, and nothing of the original comes with it:
 * no GPS, no camera, no date, no colour profile, no embedded thumbnail. That
 * is sharp's default — it keeps metadata only when asked to with
 * withMetadata/keepExif, and nothing here asks.
 *
 * Turned the right way up first, because the EXIF note that says "this photo
 * is on its side" is thrown away with everything else. No longer than
 * REVIEW_PHOTO_LONG_SIDE on its long side: a product page shows these as small
 * squares, and a 12-megapixel original is several megabytes nobody needs.
 * Transparent corners of a PNG become white rather than JPEG's default black.
 */

/** The longest side a stored review photo may have, in pixels. */
export const REVIEW_PHOTO_LONG_SIDE = 2000;

/**
 * The most pixels a photo may claim before it is even decoded: a 48-megapixel
 * iPhone photo with room to spare. A small file can claim a huge picture, and
 * decoding one would take the whole server's memory.
 */
const MOST_PIXELS = 100_000_000;

/** A file sharp could not read as a picture: damaged, not really a photo, or HEIC. */
export class UnreadablePhoto extends Error {
  constructor(cause: unknown) {
    super("This photo could not be read", { cause });
    this.name = "UnreadablePhoto";
  }
}

/**
 * The photo as a fresh JPEG with no metadata, upright and at most
 * REVIEW_PHOTO_LONG_SIDE pixels on its long side. Throws UnreadablePhoto for
 * anything that does not decode.
 *
 * HEIC, what an iPhone saves, is one of those: the sharp that comes with Next
 * is built without an HEVC decoder (a patent matter, on every platform), so it
 * can read HEIC's container but not the picture inside. iPhone Safari turns a
 * picked photo into a JPEG by itself; a .heic file attached from a laptop
 * arrives as it is and is refused, with a message that asks for a JPEG. Should
 * a future sharp read them, they come through here like any other photo.
 *
 * Default strictness on purpose (failOn "warning"): sharp's advice for files
 * from strangers. A photo that is truncated or damaged is refused rather than
 * stored half grey.
 */
export async function cleanReviewPhoto(photo: Uint8Array): Promise<Buffer> {
  try {
    return await sharp(photo, { autoOrient: true, limitInputPixels: MOST_PIXELS })
      .resize({
        width: REVIEW_PHOTO_LONG_SIDE,
        height: REVIEW_PHOTO_LONG_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    throw new UnreadablePhoto(error);
  }
}
