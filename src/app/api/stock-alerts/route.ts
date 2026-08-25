import { NextRequest, NextResponse } from "next/server";
import { sanityClient, sanityWriteClient } from "@/lib/sanity";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ─── POST /api/stock-alerts — subscribe an email to a product's restock ─── */
export async function POST(req: NextRequest) {
  try {
    const { productId, email, size } = await req.json();

    if (!productId || typeof productId !== "string") {
      return NextResponse.json({ error: "productId is required" }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }
    if (size !== undefined && typeof size !== "string") {
      return NextResponse.json({ error: "Invalid size" }, { status: 400 });
    }

    if (!process.env.SANITY_API_WRITE_TOKEN) {
      console.error("SANITY_API_WRITE_TOKEN is not configured");
      return NextResponse.json(
        { error: "Stock alerts are temporarily unavailable" },
        { status: 503 }
      );
    }

    const existing = await sanityClient.fetch(
      `*[_type == "stockAlert" && product._ref == $productId && email == $email && size == $size && notified == false][0]`,
      { productId, email, size: size ?? null }
    );
    if (existing) {
      return NextResponse.json({ alreadySubscribed: true }, { status: 200 });
    }

    await sanityWriteClient.create({
      _type: "stockAlert",
      product: { _type: "reference", _ref: productId },
      email,
      ...(size ? { size } : {}),
      notified: false,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ subscribed: true }, { status: 201 });
  } catch (error) {
    console.error("Error creating stock alert:", error);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}
