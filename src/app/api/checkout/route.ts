import { NextRequest, NextResponse } from "next/server";
import { getStripeInstance } from "@/lib/stripe";

export const dynamic = "force-dynamic";

interface CheckoutItem {
  id: string;
  name: string;
  price: number; // in pence
  image: string;
  size?: string;
  color?: string;
  quantity: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items: CheckoutItem[] = body?.items;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "No items in cart" },
        { status: 400 }
      );
    }

    // Validate each item before sending to Stripe
    for (const item of items) {
      if (!item.name || typeof item.name !== "string") {
        return NextResponse.json(
          { error: `Invalid product name for item: ${item.id}` },
          { status: 400 }
        );
      }
      if (
        typeof item.price !== "number" ||
        !Number.isInteger(item.price) ||
        item.price < 1
      ) {
        return NextResponse.json(
          { error: `Invalid price for "${item.name}". Price must be a positive whole number (in pence).` },
          { status: 400 }
        );
      }
      if (
        typeof item.quantity !== "number" ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1
      ) {
        return NextResponse.json(
          { error: `Invalid quantity for "${item.name}".` },
          { status: 400 }
        );
      }
    }

    // Early check: make sure STRIPE_SECRET_KEY is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("STRIPE_SECRET_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables.");
      return NextResponse.json(
        { error: "Payment system is not configured. Please contact support." },
        { status: 500 }
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
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 300, currency: "gbp" },
            display_name: "UK Delivery",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 3 },
              maximum: { unit: "business_day", value: 5 },
            },
          },
        },
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 1200, currency: "gbp" },
            display_name: "International Delivery",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 7 },
              maximum: { unit: "business_day", value: 14 },
            },
          },
        },
      ],
      line_items: items.map((item) => {
        // Build a descriptive product name including size and colour
        let productName = item.name;
        const metaParts: string[] = [];
        if (item.size) metaParts.push(item.size);
        if (item.color) metaParts.push(item.color);
        if (metaParts.length > 0) {
          productName += ` — ${metaParts.join(", ")}`;
        }

        // Only include images that are valid absolute HTTPS URLs
        const images: string[] = [];
        if (
          item.image &&
          typeof item.image === "string" &&
          item.image.startsWith("https://")
        ) {
          // Stripe limits image URLs to 2000 chars
          if (item.image.length <= 2000) {
            images.push(item.image);
          }
        }

        return {
          price_data: {
            currency: "gbp",
            product_data: {
              name: productName,
              ...(images.length > 0 ? { images } : {}),
            },
            unit_amount: item.price,
          },
          quantity: item.quantity,
        };
      }),
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=true`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error("Stripe checkout error:", err);

    // Provide user-friendly error messages for common Stripe errors
    if (err instanceof Error) {
      // Stripe API errors often have a `type` property
      const stripeError = err as Error & { type?: string; code?: string };

      if (stripeError.type === "StripeAuthenticationError") {
        return NextResponse.json(
          { error: "Payment system configuration error. Please contact support." },
          { status: 500 }
        );
      }

      if (stripeError.type === "StripeInvalidRequestError") {
        return NextResponse.json(
          { error: "Invalid checkout request. Please refresh and try again." },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: "Unable to start checkout. Please try again in a moment." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
