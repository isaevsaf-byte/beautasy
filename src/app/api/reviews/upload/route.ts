import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sanityWriteClient } from "@/lib/sanity";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/* ─── POST /api/reviews/upload — uploads one review photo to Sanity, returns its asset id ─── */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Assets are uploaded before the review is validated, so an unlimited caller
  // could fill the Sanity asset store with orphaned files
  const limited = rateLimit(`review-upload:${userId}`, 20, 60 * 60 * 1000);
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

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WEBP, or GIF images are allowed" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image must be under 5MB" },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await sanityWriteClient.assets.upload("image", buffer, {
      filename: file.name,
      contentType: file.type,
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
