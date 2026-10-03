import { NextRequest, NextResponse } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { findOrderByReviewToken, orderContainsProduct, type TokenOrder } from "@/lib/reviewToken";
import { REVIEW_UPLOAD_SOURCE, reviewUploadMark } from "@/lib/reviewPhotos";
import { cleanReviewPhoto, UnreadablePhoto } from "@/lib/cleanPhoto";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * How many photos each piece on a review link may have uploaded, ever. One
 * link opens a form for every piece in the order, and each form takes four;
 * the rest is room for a photo whose upload failed and was sent again.
 *
 * The cap used to be twelve per link, whatever was in the order, and a
 * customer who added three photos to each of three pieces had the last one
 * refused. Now a link's allowance is this many times the pieces it covers
 * (photoAllowance). Counted in Sanity, so it holds across every server
 * instance, where the in-memory limit below is only per instance.
 */
export const UPLOADS_PER_PIECE = 8;

/**
 * Per piece per day, in memory: the cheap first stop before Sanity is asked
 * anything. Four photos and two to spare. A form no longer sends a photo
 * again once it has its asset id, so a review sent twice — say its comment
 * was too long the first time — does not spend this twice.
 */
export const UPLOADS_PER_PIECE_PER_DAY = 6;

/** How many photos a link may have uploaded in all: UPLOADS_PER_PIECE for each piece it covers. */
export function photoAllowance(order: TokenOrder): number {
  const pieces = new Set((order.items ?? []).map((item) => item.productId).filter(Boolean));
  return UPLOADS_PER_PIECE * Math.max(1, pieces.size);
}

export interface SniffedImage {
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/heic";
  extension: "jpg" | "png" | "webp" | "heic";
}

/** HEIC's brands — what an iPhone writes after "ftyp" in a photo it took. */
const HEIC_BRANDS = ["heic", "heix", "heim", "heis", "hevc", "hevx"];

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to));
}

/**
 * What the file really is, read from its first bytes — never from the name
 * or the type the browser sent, both of which are whatever the sender typed.
 * A JPEG, PNG, WebP or HEIC photo, or null for anything else.
 *
 * Only the first gate: whatever passes is decoded and drawn again as a JPEG
 * before it is stored (see @/lib/cleanPhoto). HEIC is told apart here so its
 * refusal can say what to send instead.
 */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && PNG.every((byte, i) => bytes[i] === byte)) {
    return { contentType: "image/png", extension: "png" };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp" && HEIC_BRANDS.includes(ascii(bytes, 8, 12))) {
    return { contentType: "image/heic", extension: "heic" };
  }
  return null;
}

/**
 * POST /api/reviews/upload — uploads one review photo to Sanity, returns its asset id.
 *
 * Only with a review-request link's token. It also used to take any signed-in
 * account, and anyone can make one — so anyone could fill the asset store,
 * because photos are uploaded before the review they belong to is checked.
 * The form that calls this always sends the token, and the piece the photo
 * is for.
 *
 * 🚨 Never stores the file as it came: see @/lib/cleanPhoto for why.
 */
export async function POST(req: NextRequest) {
  // Before anything is asked of Sanity: a flood of made-up tokens costs a lookup each
  const flood = rateLimit(`review-upload-ip:${clientIp(req)}`, 30, 60 * 60 * 1000);
  if (!flood.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Please try again later." },
      { status: 429, headers: { "Retry-After": String(flood.retryAfter) } }
    );
  }

  const formData = await req.formData().catch(() => null);
  const token = formData?.get("token");
  const order = typeof token === "string" ? await findOrderByReviewToken(token) : null;
  if (!formData || !order) {
    return NextResponse.json({ error: "This review link is not valid." }, { status: 401 });
  }

  // Each piece on the page has its own form and its own photos. A form from
  // before the piece was sent along has no productId: a reload fixes that.
  const productId = formData.get("productId");
  if (typeof productId !== "string" || !productId) {
    return NextResponse.json(
      { error: "Please reload this page and add your photos again." },
      { status: 400 }
    );
  }
  if (!orderContainsProduct(order, productId)) {
    return NextResponse.json({ error: "That piece isn't part of this order." }, { status: 400 });
  }

  // Keyed by the order and the piece, not by address: a new address on a
  // phone network does not buy more
  const limited = rateLimit(
    `review-upload:order:${order._id}:${productId}`,
    UPLOADS_PER_PIECE_PER_DAY,
    24 * 60 * 60 * 1000
  );
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  if (!process.env.SANITY_API_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Photo uploads are temporarily unavailable" },
      { status: 503 }
    );
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image must be under 5MB" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const image = sniffImage(buffer);
  if (!image) {
    return NextResponse.json(
      { error: "Only JPEG, PNG or WebP photos can be added." },
      { status: 400 }
    );
  }

  let photo: Buffer;
  try {
    photo = await cleanReviewPhoto(buffer);
  } catch (error) {
    if (!(error instanceof UnreadablePhoto)) throw error;
    return NextResponse.json(
      {
        error:
          image.contentType === "image/heic"
            ? "This photo is in Apple's HEIC format, which we can't read yet. Please add it as a JPEG or PNG instead."
            : "We couldn't read that photo. Please try another one, saved as a JPEG or PNG.",
      },
      { status: 400 }
    );
  }

  try {
    // The same mark the review is checked against, and the morning clean-up
    // finds abandoned photos by (see @/lib/reviewPhotos)
    const mark = reviewUploadMark(order._id);
    const already = await sanityWriteClient.fetch<number>(
      `count(*[_type == "sanity.imageAsset" && source.name == $source && source.id == $mark])`,
      { source: REVIEW_UPLOAD_SOURCE, mark }
    );
    if (already >= photoAllowance(order)) {
      return NextResponse.json(
        { error: "That's all the photos this review link can add." },
        { status: 429 }
      );
    }

    // The clean copy, never `buffer`: the original may say where she lives
    const asset = await sanityWriteClient.assets.upload("image", photo, {
      // Our own name: the customer's file name ("Jane at home.jpg") would sit
      // in a public document. Always a JPEG, because that is what was made.
      filename: "review-photo.jpg",
      contentType: "image/jpeg",
      source: { name: REVIEW_UPLOAD_SOURCE, id: mark },
    });
    return NextResponse.json({ assetId: asset._id }, { status: 201 });
  } catch (error) {
    console.error("Error uploading review photo:", error);
    return NextResponse.json(
      { error: "Failed to upload photo" },
      { status: 500 }
    );
  }
}
