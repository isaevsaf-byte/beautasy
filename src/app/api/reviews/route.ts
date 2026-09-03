import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/clerkServer";
import { sanityClient, sanityWriteClient } from "@/lib/sanity";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/* ─── GET /api/reviews?productId=xxx ─── */
export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId) {
    return NextResponse.json(
      { error: "productId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const REVIEWS_QUERY = `*[_type == "review" && product._ref == $productId && approved == true] | order(createdAt desc) {
      _id, userId, userName, rating, comment, createdAt,
      "images": images[].asset->url
    }`;

    const reviews = await sanityClient.fetch(REVIEWS_QUERY, { productId });

    const averageRating =
      reviews.length > 0
        ? reviews.reduce(
            (sum: number, r: { rating: number }) => sum + r.rating,
            0
          ) / reviews.length
        : 0;

    return NextResponse.json({
      reviews,
      averageRating,
      count: reviews.length,
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return NextResponse.json(
      { error: "Failed to fetch reviews" },
      { status: 500 }
    );
  }
}

/* ─── POST /api/reviews ─── */
export async function POST(req: NextRequest) {
  try {
    // Account reviews need Clerk; without it the emailed review link is the way in
    const userId = await currentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = rateLimit(`reviews:${userId}`, 10, 60 * 60 * 1000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many reviews submitted. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
      );
    }

    const body = await req.json();
    const { productId, userName, rating, comment, imageAssetIds } = body;

    // Validate
    if (!productId || !userName || !rating || !comment) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be an integer between 1 and 5" },
        { status: 400 }
      );
    }
    if (comment.length < 10 || comment.length > 1000) {
      return NextResponse.json(
        { error: "Comment must be between 10 and 1,000 characters" },
        { status: 400 }
      );
    }
    if (
      imageAssetIds !== undefined &&
      (!Array.isArray(imageAssetIds) ||
        imageAssetIds.length > 4 ||
        imageAssetIds.some((id) => typeof id !== "string"))
    ) {
      return NextResponse.json(
        { error: "Invalid photo attachments" },
        { status: 400 }
      );
    }

    // Check for existing review by this user on this product
    const existing = await sanityClient.fetch(
      `*[_type == "review" && product._ref == $productId && userId == $userId][0]`,
      { productId, userId }
    );
    if (existing) {
      return NextResponse.json(
        { error: "You have already reviewed this product" },
        { status: 409 }
      );
    }

    // Check write token
    if (!process.env.SANITY_API_WRITE_TOKEN) {
      console.error("SANITY_API_WRITE_TOKEN is not configured");
      return NextResponse.json(
        { error: "Reviews are temporarily unavailable" },
        { status: 503 }
      );
    }

    // Create review — hidden from the shop (approved: false) until a moderator
    // reviews it in Sanity Studio, to filter out spam or abuse before publishing.
    const review = await sanityWriteClient.create({
      _type: "review",
      product: { _type: "reference", _ref: productId },
      userId,
      userName,
      rating,
      comment,
      approved: false,
      images: (imageAssetIds || []).map((assetId: string) => ({
        _type: "image",
        _key: assetId,
        asset: { _type: "reference", _ref: assetId },
      })),
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    console.error("Error creating review:", error);
    return NextResponse.json(
      { error: "Failed to create review" },
      { status: 500 }
    );
  }
}
