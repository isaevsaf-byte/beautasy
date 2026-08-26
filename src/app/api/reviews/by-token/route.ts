import { NextRequest, NextResponse } from "next/server";
import { sanityClient, sanityWriteClient } from "@/lib/sanity";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { findOrderByReviewToken, orderContainsProduct } from "@/lib/reviewToken";

export const dynamic = "force-dynamic";

/* ─── POST /api/reviews/by-token — leave a review from an emailed link ─── */
export async function POST(req: NextRequest) {
  const limited = rateLimit(`review-token:${clientIp(req)}`, 20, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  try {
    const { token, productId, rating, comment, userName, imageAssetIds } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "This link is not valid" }, { status: 400 });
    }
    if (!productId || typeof productId !== "string") {
      return NextResponse.json({ error: "Which product are you reviewing?" }, { status: 400 });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Please choose a rating from 1 to 5" }, { status: 400 });
    }
    if (typeof comment !== "string" || comment.length < 10 || comment.length > 1000) {
      return NextResponse.json(
        { error: "Your review needs to be between 10 and 1,000 characters" },
        { status: 400 }
      );
    }
    if (
      imageAssetIds !== undefined &&
      (!Array.isArray(imageAssetIds) ||
        imageAssetIds.length > 4 ||
        imageAssetIds.some((id) => typeof id !== "string"))
    ) {
      return NextResponse.json({ error: "Invalid photo attachments" }, { status: 400 });
    }

    const order = await findOrderByReviewToken(token);
    if (!order) {
      return NextResponse.json(
        { error: "This review link has expired or is not valid" },
        { status: 404 }
      );
    }
    // Only the pieces actually bought on this order can be reviewed with it
    if (!orderContainsProduct(order, productId)) {
      return NextResponse.json(
        { error: "That product isn't part of this order" },
        { status: 400 }
      );
    }

    if (!process.env.SANITY_API_WRITE_TOKEN) {
      return NextResponse.json({ error: "Reviews are temporarily unavailable" }, { status: 503 });
    }

    // One review per product per order
    const existing = await sanityClient.fetch<string | null>(
      `*[_type == "review" && product._ref == $productId && orderId == $orderId][0]._id`,
      { productId, orderId: order._id }
    );
    if (existing) {
      return NextResponse.json(
        { error: "You've already reviewed this piece — thank you!" },
        { status: 409 }
      );
    }

    const displayName =
      (typeof userName === "string" && userName.trim().slice(0, 40)) ||
      order.customerName?.split(" ")[0] ||
      "Customer";

    const review = await sanityWriteClient.create({
      _type: "review",
      product: { _type: "reference", _ref: productId },
      orderId: order._id,
      userName: displayName,
      rating,
      comment,
      verifiedPurchase: true,
      // Still moderated before it appears, same as account reviews
      approved: false,
      images: (imageAssetIds || []).map((assetId: string) => ({
        _type: "image",
        _key: assetId,
        asset: { _type: "reference", _ref: assetId },
      })),
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ review: { _id: review._id } }, { status: 201 });
  } catch (error) {
    console.error("Error creating review from token:", error);
    return NextResponse.json({ error: "Could not save your review" }, { status: 500 });
  }
}
