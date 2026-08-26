import { NextRequest, NextResponse } from "next/server";
import { getStripeInstance } from "@/lib/stripe";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

/**
 * GET /api/checkout-session?session_id=cs_...
 *
 * Feeds the "thank you" page, which previously showed nothing about the order
 * the customer had just placed — no items, no total, no reference to quote when
 * emailing about it. Only the buyer who completed checkout has the session id,
 * and this deliberately returns just the receipt-level facts (never the address
 * or payment details).
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");

  if (!sessionId || !sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "A checkout session id is required" }, { status: 400 });
  }

  try {
    const stripe = getStripeInstance();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price.product"],
    });

    if (session.payment_status !== "paid") {
      return NextResponse.json({ paid: false }, { status: 200 });
    }

    const lineItems = (session.line_items?.data ?? []) as Stripe.LineItem[];

    return NextResponse.json({
      paid: true,
      // Short, human-quotable reference — the full session id is unwieldy
      reference: sessionId.slice(-8).toUpperCase(),
      total: session.amount_total ?? 0,
      shippingTotal: session.total_details?.amount_shipping ?? 0,
      discountTotal: session.total_details?.amount_discount ?? 0,
      email: session.customer_details?.email ?? null,
      items: lineItems.map((item) => {
        const product = item.price?.product;
        const meta =
          product && typeof product === "object" && !("deleted" in product)
            ? (product as Stripe.Product).metadata
            : undefined;
        const productId = meta?.product_id;
        return {
          id: productId ?? item.id,
          slug: meta?.slug,
          name: item.description ?? "Item",
          quantity: item.quantity ?? 1,
          amountTotal: item.amount_total ?? 0,
        };
      }),
    });
  } catch (error) {
    console.error("Failed to load checkout session:", error);
    return NextResponse.json({ error: "Could not load your order" }, { status: 500 });
  }
}
