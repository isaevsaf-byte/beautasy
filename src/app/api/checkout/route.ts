import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStripeInstance } from "@/lib/stripe";
import { getSiteSettings, DEFAULT_UK_RATE, DEFAULT_INT_RATE } from "@/lib/siteSettings";
import { sanityClient } from "@/lib/sanity";

export const dynamic = "force-dynamic";

const GIFTBOX_ADDON_SUFFIX = "-giftbox";

interface CheckoutItem {
  id: string;
  name: string;
  price: number; // in pence — client-supplied, NEVER trusted; overwritten below
  image: string;
  size?: string;
  color?: string;
  giftMessage?: string;
  quantity: number;
}

interface PriceLookupProduct {
  _id: string;
  price: number;
  sizePrices?: { size: string; price: number }[];
  giftBoxAvailable?: boolean;
  giftBoxPrice?: number;
}

interface PriceLookupGiftBox {
  _id: string;
  price: number;
}

const PRICE_LOOKUP_QUERY = `{
  "products": *[_type == "product" && _id in $ids]{ _id, price, sizePrices, giftBoxAvailable, giftBoxPrice },
  "giftBoxes": *[_type == "giftBox" && _id in $ids]{ _id, price }
}`;

/**
 * Resolves the authoritative price (in pence) for a cart line from Sanity.
 * Returns null when the line can't be priced (unknown id, gift box not
 * available, etc.) so the caller can reject the whole checkout.
 */
function resolvePrice(
  item: CheckoutItem,
  products: Map<string, PriceLookupProduct>,
  giftBoxes: Map<string, PriceLookupGiftBox>
): number | null {
  if (item.id.endsWith(GIFTBOX_ADDON_SUFFIX)) {
    const baseId = item.id.slice(0, -GIFTBOX_ADDON_SUFFIX.length);
    const product = products.get(baseId);
    if (!product || !product.giftBoxAvailable || !product.giftBoxPrice) return null;
    return product.giftBoxPrice;
  }

  const product = products.get(item.id);
  if (product) {
    if (item.size) {
      const sizePrice = product.sizePrices?.find((sp) => sp.size === item.size);
      if (sizePrice) return sizePrice.price;
    }
    return product.price;
  }

  const giftBox = giftBoxes.get(item.id);
  if (giftBox) return giftBox.price;

  return null;
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

    // Basic shape validation (price/quantity trust comes from Sanity below)
    for (const item of items) {
      if (!item.id || typeof item.id !== "string") {
        return NextResponse.json({ error: "Invalid item id" }, { status: 400 });
      }
      if (!item.name || typeof item.name !== "string") {
        return NextResponse.json(
          { error: `Invalid product name for item: ${item.id}` },
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

    // Look up authoritative prices in Sanity — the client-supplied `price`
    // is never trusted here, since it lives in editable localStorage and
    // would otherwise let anyone pay whatever they choose at checkout.
    const lookupIds = Array.from(
      new Set(
        items.map((item) =>
          item.id.endsWith(GIFTBOX_ADDON_SUFFIX)
            ? item.id.slice(0, -GIFTBOX_ADDON_SUFFIX.length)
            : item.id
        )
      )
    );

    const { products: productList, giftBoxes: giftBoxList } = await sanityClient.fetch<{
      products: PriceLookupProduct[];
      giftBoxes: PriceLookupGiftBox[];
    }>(PRICE_LOOKUP_QUERY, { ids: lookupIds });

    const products = new Map(productList.map((p) => [p._id, p]));
    const giftBoxes = new Map(giftBoxList.map((g) => [g._id, g]));

    const pricedItems: (CheckoutItem & { verifiedPrice: number })[] = [];
    for (const item of items) {
      const verifiedPrice = resolvePrice(item, products, giftBoxes);
      if (verifiedPrice == null || verifiedPrice < 1) {
        return NextResponse.json(
          { error: `"${item.name}" is no longer available. Please remove it and try again.` },
          { status: 400 }
        );
      }
      pricedItems.push({ ...item, verifiedPrice });
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

    // Attach the signed-in Clerk user (if any) so the webhook can link the
    // resulting order to their account for order history. Guests checkout fine.
    const { userId } = await auth();

    // Fetch live shipping rates from Sanity (falls back to defaults if not set)
    const siteSettings = await getSiteSettings();
    const ukRate = siteSettings.shipping?.ukRate ?? DEFAULT_UK_RATE;
    const intRate = siteSettings.shipping?.internationalRate ?? DEFAULT_INT_RATE;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "gbp",
      allow_promotion_codes: true,
      shipping_address_collection: {
        allowed_countries: ["GB", "US", "CA", "FR", "DE", "IT", "ES", "AU"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: ukRate, currency: "gbp" },
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
            fixed_amount: { amount: intRate, currency: "gbp" },
            display_name: "International Delivery",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 7 },
              maximum: { unit: "business_day", value: 14 },
            },
          },
        },
      ],
      ...(userId ? { client_reference_id: userId } : {}),
      line_items: pricedItems.map((item) => {
        // Build a descriptive product name including size and colour
        let productName = item.name;
        const metaParts: string[] = [];
        if (item.size) metaParts.push(`Size: ${item.size}`);
        if (item.color) metaParts.push(`Colour: ${item.color}`);
        if (metaParts.length > 0) {
          productName += ` — ${metaParts.join(", ")}`;
        }

        // Stripe shows `description` on the checkout line and on the receipt,
        // so this is where the gift card message becomes visible to merchant + buyer.
        const description = item.giftMessage
          ? `🎁 Gift card: "${item.giftMessage}"`
          : undefined;

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

        const metadata: Record<string, string> = { product_id: item.id };
        if (item.size) metadata.size = item.size;
        if (item.color) metadata.color = item.color;
        if (item.giftMessage) metadata.gift_message = item.giftMessage;

        return {
          price_data: {
            currency: "gbp",
            product_data: {
              name: productName,
              ...(description ? { description } : {}),
              ...(images.length > 0 ? { images } : {}),
              metadata,
            },
            unit_amount: item.verifiedPrice,
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
