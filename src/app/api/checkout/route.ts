import { NextRequest, NextResponse } from "next/server";
import { getStripeInstance } from "@/lib/stripe";

export const dynamic = "force-dynamic";

interface CheckoutItem {
  id: string;
  name: string;
  price: number; // in pence
  image: string;
  size?: string;
  quantity: number;
}

export async function POST(req: NextRequest) {
  try {
    const { items }: { items: CheckoutItem[] } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "No items in cart" },
        { status: 400 }
      );
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";

    const stripe = getStripeInstance();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "gbp",
      shipping_address_collection: {
        allowed_countries: ["GB", "US", "CA", "FR", "DE", "IT", "ES", "AU"],
      },
      line_items: items.map((item) => ({
        price_data: {
          currency: "gbp",
          product_data: {
            name: item.name + (item.size ? ` — ${item.size}` : ""),
            images: item.image.startsWith("http") ? [item.image] : [],
          },
          unit_amount: item.price, // already in pence
        },
        quantity: item.quantity,
      })),
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error("Stripe checkout error:", err);
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
