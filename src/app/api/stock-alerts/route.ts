import { NextRequest, NextResponse } from "next/server";
import { sanityClient, sanityWriteClient } from "@/lib/sanity";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { emailFingerprint, maskEmail, sealOptional } from "@/lib/pii";
import { secretsConfigured } from "@/lib/secrets";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ─── POST /api/stock-alerts — subscribe an email to a product's restock ─── */
export async function POST(req: NextRequest) {
  const limited = rateLimit(`stock-alerts:${clientIp(req)}`, 10, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

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

    if (!process.env.SANITY_API_WRITE_TOKEN || !secretsConfigured()) {
      console.error("SANITY_API_WRITE_TOKEN or DATA_SECRET is not configured");
      return NextResponse.json(
        { error: "Stock alerts are temporarily unavailable" },
        { status: 503 }
      );
    }

    const productExists = await sanityClient.fetch<string | null>(
      `*[_id == $productId && _type == "product"][0]._id`,
      { productId }
    );
    if (!productExists) {
      return NextResponse.json({ error: "Unknown product" }, { status: 400 });
    }

    // Matched on a fingerprint: the address itself is not in the document
    const existing = await sanityClient.fetch(
      `*[_type == "stockAlert" && product._ref == $productId && emailFingerprint == $fingerprint && size == $size && notified == false][0]`,
      { productId, fingerprint: emailFingerprint(email), size: size ?? null }
    );
    if (existing) {
      return NextResponse.json({ alreadySubscribed: true }, { status: 200 });
    }

    await sanityWriteClient.create({
      _type: "stockAlert",
      product: { _type: "reference", _ref: productId },
      emailHint: maskEmail(email),
      emailFingerprint: emailFingerprint(email),
      emailSealed: sealOptional(email),
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
