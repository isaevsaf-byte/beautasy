import { NextRequest, NextResponse } from "next/server";
import { getStripeInstance } from "@/lib/stripe";
import Stripe from "stripe";
import { ownLinkFor, referralSettings } from "@/lib/referrals";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/checkout-session?session_id=cs_...
 *
 * Feeds the "thank you" page, which previously showed nothing about the order
 * the customer had just placed — no items, no total, no reference to quote when
 * emailing about it.
 *
 * The session id is not a secret, whatever it looks like. It is the id of the
 * order document (`order-cs_…`) and sits on gift cards and referral events, in
 * a Sanity dataset anyone can read. So this answers with nothing about the
 * buyer: not their email, name or address — it used to return the email, which
 * made every sealed address in the shop one query and one request away — and
 * only for a day after paying, which is all the thank-you page needs. What is
 * left is the receipt the page prints, and the items and total are already in
 * the order document.
 */

/** How long after paying the thank-you page can still read its order back. */
export const RECEIPT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Whether a session is recent enough to answer for. `created` is Stripe's, in seconds. */
export function receiptIsFresh(createdSeconds: number, now: number): boolean {
  return now - createdSeconds * 1000 <= RECEIPT_WINDOW_MS;
}

export interface Receipt {
  paid: true;
  friendsCode: string | null;
  friendsOffer: { give: number; get: number } | null;
  reference: string;
  total: number;
  shippingTotal: number;
  discountTotal: number;
  items: { id: string; slug?: string; name: string; quantity: number; amountTotal: number }[];
}

/**
 * Everything the thank-you page is told, built in one place so a test can hold
 * the whole answer up against the buyer's details and find none of them in it.
 */
export function receiptOf(input: {
  sessionId: string;
  session: Pick<Stripe.Checkout.Session, "amount_total" | "total_details" | "line_items">;
  friendsCode: string | null;
  friendsOffer: { give: number; get: number } | null;
}): Receipt {
  const { sessionId, session } = input;
  const lineItems = (session.line_items?.data ?? []) as Stripe.LineItem[];

  return {
    paid: true,
    friendsCode: input.friendsCode,
    friendsOffer: input.friendsOffer,
    // Short, human-quotable reference — the full session id is unwieldy
    reference: sessionId.slice(-8).toUpperCase(),
    total: session.amount_total ?? 0,
    shippingTotal: session.total_details?.amount_shipping ?? 0,
    discountTotal: session.total_details?.amount_discount ?? 0,
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
  };
}

export async function GET(req: NextRequest) {
  // A buyer loads this once or twice; anything more is somebody walking ids
  const limited = rateLimit(`checkout-session:${clientIp(req)}`, 20, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const sessionId = req.nextUrl.searchParams.get("session_id");

  if (!sessionId || !sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "A checkout session id is required" }, { status: 400 });
  }

  try {
    const stripe = getStripeInstance();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price.product"],
    });

    // An old session gets the page's generic thank-you, and does not mint a
    // Friends link or report a purchase a second time
    if (session.payment_status !== "paid" || !receiptIsFresh(session.created, Date.now())) {
      return NextResponse.json({ paid: false }, { status: 200 });
    }

    // The buyer's own Friends link, for the "Give £5, get £5" block on the
    // thank-you page. Minted here rather than awaited from the webhook, which
    // may not have run yet when the page loads — both make the same document.
    // The email is used to find or make that document and goes no further.
    const friendsCode = await ownLinkFor(
      session.customer_details?.name,
      session.customer_details?.email,
      "order"
    );
    const friendsOffer = friendsCode
      ? await referralSettings().then((s) => ({ give: s.friendShopDiscount, get: s.referrerReward }))
      : null;

    return NextResponse.json(receiptOf({ sessionId, session, friendsCode, friendsOffer }));
  } catch (error) {
    console.error("Failed to load checkout session:", error);
    return NextResponse.json({ error: "Could not load your order" }, { status: 500 });
  }
}
