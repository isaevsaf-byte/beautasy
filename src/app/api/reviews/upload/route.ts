import { NextRequest, NextResponse } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { findOrderByReviewToken } from "@/lib/reviewToken";
import { REVIEW_UPLOAD_SOURCE, reviewUploadMark } from "@/lib/reviewPhotos";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * How many photos one review link may upload, ever. The form takes four; the
 * rest is room for a customer whose first try failed halfway and who tries
 * again. Counted in Sanity, so it holds across every server instance, where
 * the in-memory limit below is only per instance.
 */
export const UPLOADS_PER_ORDER = 12;

/** The same allowance per day in memory: the cheap first stop before Sanity is asked anything. */
export const UPLOADS_PER_ORDER_PER_DAY = 8;

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
 * The form that calls this always sends the token.
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

  // Keyed by the order alone: a new address on a phone network does not buy more
  const limited = rateLimit(`review-upload:order:${order._id}`, UPLOADS_PER_ORDER_PER_DAY, 24 * 60 * 60 * 1000);
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
      { error: "Only JPEG, PNG, WEBP or HEIC photos are allowed" },
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
    if (already >= UPLOADS_PER_ORDER) {
      return NextResponse.json(
        { error: "That's all the photos this review link can add." },
        { status: 429 }
      );
    }

    const asset = await sanityWriteClient.assets.upload("image", buffer, {
      // Our own name and type: the customer's file name ("Jane at home.jpg")
      // would sit in a public document, and their type is only a claim
      filename: `review-photo.${image.extension}`,
      contentType: image.contentType,
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
