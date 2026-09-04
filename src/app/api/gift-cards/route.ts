import { NextRequest, NextResponse } from "next/server";
import { getStripeInstance } from "@/lib/stripe";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { findSpendableCard, normaliseCode, sanitiseAmount, PRESET_AMOUNTS } from "@/lib/giftCards";
import { SITE_URL } from "@/lib/site";
import { secretsConfigured } from "@/lib/secrets";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_MAX = 300;

/* ─── GET /api/gift-cards?code=... — how much is left on a card ─── */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";

  const limited = rateLimit(`gift-card-check:${clientIp(req)}`, 20, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const card = await findSpendableCard(code);
  if (!card) {
    // Deliberately vague: don't help anyone guess at codes
    return NextResponse.json({ valid: false, error: "That code isn't valid" }, { status: 404 });
  }

  // Echoes back what the shopper typed, not what is stored: the document has
  // only a keyed fingerprint of the code, never the code itself.
  return NextResponse.json({ valid: true, code: normaliseCode(code), balance: card.balance });
}

/* ─── POST /api/gift-cards — buy one ─── */
export async function POST(req: NextRequest) {
  const limited = rateLimit(`gift-card-buy:${clientIp(req)}`, 10, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  try {
    const body = await req.json();
    const { amount, recipientEmail, recipientName, message, deliverAt, company } = body;

    // Honeypot
    if (typeof company === "string" && company.trim() !== "") {
      return NextResponse.json({ error: "Could not start checkout" }, { status: 400 });
    }

    const value = sanitiseAmount(amount);
    if (value === null) {
      return NextResponse.json(
        { error: "Choose an amount between £10 and £500" },
        { status: 400 }
      );
    }
    if (!recipientEmail || typeof recipientEmail !== "string" || !EMAIL_RE.test(recipientEmail)) {
      return NextResponse.json(
        { error: "Where should we send the gift card? Please add a valid email." },
        { status: 400 }
      );
    }
    if (typeof message === "string" && message.length > MESSAGE_MAX) {
      return NextResponse.json({ error: "That message is a little too long" }, { status: 400 });
    }
    // A scheduled delivery has to be in the future and within a year
    let deliverAtIso: string | undefined;
    if (deliverAt) {
      const when = new Date(deliverAt);
      const maxAhead = Date.now() + 365 * 24 * 60 * 60 * 1000;
      if (Number.isNaN(when.getTime()) || when.getTime() > maxAhead) {
        return NextResponse.json({ error: "Pick a delivery date within the next year" }, { status: 400 });
      }
      if (when.getTime() > Date.now()) deliverAtIso = when.toISOString();
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Payment system is not configured. Please contact support." },
        { status: 500 }
      );
    }
    // Codes are stored keyed and sealed; without the key one could be sold and
    // then never issued. Better to refuse the sale than to take the money.
    if (!secretsConfigured()) {
      console.error("DATA_SECRET is not set — refusing to sell a gift card that could not be issued");
      return NextResponse.json(
        { error: "Gift cards are temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }

    const stripe = getStripeInstance();
    const origin = req.headers.get("origin") || SITE_URL;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "gbp",
      // A gift card is emailed, not posted — no address needed
      line_items: [
        {
          price_data: {
            currency: "gbp",
            unit_amount: value,
            product_data: {
              name: `Beautasy Gift Card — £${(value / 100).toFixed(2)}`,
              description: deliverAtIso
                ? `Emailed to ${recipientEmail} on ${new Date(deliverAtIso).toLocaleDateString("en-GB")}`
                : `Emailed to ${recipientEmail}`,
              metadata: { gift_card: "true" },
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        gift_card: "true",
        gift_card_amount: String(value),
        gift_card_recipient: recipientEmail,
        ...(recipientName ? { gift_card_recipient_name: String(recipientName).slice(0, 60) } : {}),
        ...(message ? { gift_card_message: String(message).slice(0, MESSAGE_MAX) } : {}),
        ...(deliverAtIso ? { gift_card_deliver_at: deliverAtIso } : {}),
      },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/gift-cards?canceled=true`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url, amount: value, presets: PRESET_AMOUNTS });
  } catch (error) {
    console.error("Gift card checkout failed:", error);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
