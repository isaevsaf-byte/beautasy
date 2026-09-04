import { NextRequest, NextResponse } from "next/server";
import { getStripeInstance } from "@/lib/stripe";
import Stripe from "stripe";
import { Resend } from "resend";
import { sanityWriteClient } from "@/lib/sanity";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/site";
import {
  generateGiftCardCode,
  expiryFromNow,
  deductFromCard,
  releaseCard,
} from "@/lib/giftCards";
import { deliverGiftCard, emailGiftCardPurchase } from "@/lib/giftCardEmails";
import { getSiteSettings, DEFAULT_INT_RATE } from "@/lib/siteSettings";
import {
  collectOrdered,
  planStockDecrement,
  planStockFloor,
  type OrderedLine,
  type StockDoc,
} from "@/lib/stock";

export const dynamic = "force-dynamic";

// Lazy init — avoids build-time crash when env var isn't set yet
function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  return new Resend(process.env.RESEND_API_KEY);
}

const KRISTINA_EMAIL = "hello@beautasy.co.uk";
const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";

/* ─── Types ─── */
interface ShippingDetails {
  name?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
}

/**
 * Where the parcel goes. Stripe moved this from `shipping_details` to
 * `collected_information.shipping_details` in the 2025-03-31 API; which one a
 * webhook carries depends on the endpoint's API version, so both are read.
 * Without this an order on a newer endpoint arrives as "Not provided" — and
 * there is nothing to post to.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shippingOf(session: any): ShippingDetails | null | undefined {
  return session?.collected_information?.shipping_details ?? session?.shipping_details;
}

/* ─── Format address ─── */
function formatAddress(shipping: ShippingDetails | null | undefined): string {
  if (!shipping?.address) return "Not provided";
  const a = shipping.address;
  return [
    shipping.name,
    a.line1,
    a.line2,
    a.city,
    a.state,
    a.postal_code,
    a.country,
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join("\n");
}

/* ─── Format line items ─── */
function formatItems(items: Stripe.LineItem[]): string {
  return items
    .map((item) => {
      const qty = item.quantity ?? 1;
      const price = item.amount_total ? `£${(item.amount_total / 100).toFixed(2)}` : "";
      return `• ${escapeHtml(item.description ?? item.price?.product)} × ${qty}  ${price}`;
    })
    .join("\n");
}

/* ─── Customer confirmation email (HTML) ─── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function customerEmailHtml(session: any, items: Stripe.LineItem[]): string {
  const address = formatAddress(shippingOf(session));
  const total = `£${((session.amount_total ?? 0) / 100).toFixed(2)}`;
  const name = shippingOf(session)?.name ?? session.customer_details?.name ?? "there";
  const firstName = escapeHtml(name.split(" ")[0]);

  const itemRows = items
    .map((item) => {
      const qty = item.quantity ?? 1;
      const price = item.amount_total ? `£${(item.amount_total / 100).toFixed(2)}` : "";
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0eaf8;color:#3d3d3d;">${escapeHtml(item.description ?? "Item")}</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0eaf8;text-align:center;color:#3d3d3d;">${qty}</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0eaf8;text-align:right;color:#3d3d3d;">${price}</td>
        </tr>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">

    <!-- Header -->
    <div style="background:#e8dff5;padding:40px 40px 32px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">Beautasy</p>
      <h1 style="margin:0;font-size:28px;font-weight:400;color:#2d2d2d;font-style:italic;">Thank you, ${firstName}!</h1>
      <p style="margin:12px 0 0;color:#6b6b6b;font-size:15px;">Your order is confirmed 💜</p>
    </div>

    <!-- Body -->
    <div style="padding:36px 40px;">
      <p style="color:#3d3d3d;line-height:1.7;margin-top:0;">
        We're so excited to start crafting your piece. Every item is handmade with love in our Southampton atelier —
        please allow <strong>3–5 business days</strong> for production before dispatch.
      </p>

      <!-- Order summary -->
      <h2 style="font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;margin:28px 0 16px;">Your Order</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;font-size:12px;color:#999;font-weight:normal;padding-bottom:8px;">Item</th>
            <th style="text-align:center;font-size:12px;color:#999;font-weight:normal;padding-bottom:8px;">Qty</th>
            <th style="text-align:right;font-size:12px;color:#999;font-weight:normal;padding-bottom:8px;">Price</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:14px 0 0;font-weight:bold;color:#2d2d2d;">Total</td>
            <td style="padding:14px 0 0;text-align:right;font-weight:bold;color:#2d2d2d;">${total}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Delivery address -->
      <h2 style="font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;margin:32px 0 12px;">Delivery Address</h2>
      <p style="color:#3d3d3d;line-height:1.8;white-space:pre-line;margin:0;">${address}</p>

      <!-- Questions -->
      <div style="background:#f7f3ff;border-radius:12px;padding:20px 24px;margin-top:32px;">
        <p style="margin:0;font-size:14px;color:#5a5a5a;line-height:1.7;">
          Questions about your order? Reply to this email or visit
          <a href="${SITE_URL}/contact" style="color:#9b7fd4;text-decoration:none;">beautasy.co.uk/contact</a>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:24px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:12px;color:#aaa;">Made with 💜 in Southampton · <a href="${SITE_URL}" style="color:#aaa;">beautasy.co.uk</a></p>
    </div>
  </div>
</body>
</html>`;
}

/* ─── Kristina notification email (HTML) ─── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adminEmailHtml(session: any, items: Stripe.LineItem[], internationalRate: number): string {
  const address = formatAddress(shippingOf(session));
  // The bag decides the region before Stripe, but a shopper can still pick the
  // wrong one. Flag a non-UK address that paid less than the international
  // rate rather than silently eating the difference.
  const country = shippingOf(session)?.address?.country;
  const shippingPaid = session.total_details?.amount_shipping ?? 0;
  const ukRateMismatch = !!country && country !== "GB" && shippingPaid < internationalRate;
  const total = `£${((session.amount_total ?? 0) / 100).toFixed(2)}`;
  const customer = escapeHtml(session.customer_details?.email ?? "Unknown");
  const phone = escapeHtml(session.customer_details?.phone ?? "Not provided");
  const itemList = formatItems(items);

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">

    <div style="background:#2d2d2d;padding:32px 40px;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#9b7fd4;">New Order 🎉</p>
      <h1 style="margin:0;font-size:24px;font-weight:400;color:#fff;">${total} received</h1>
    </div>

    <div style="padding:36px 40px;">

      <h2 style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;margin:0 0 12px;">Customer</h2>
      <p style="margin:0 0 4px;color:#3d3d3d;">${escapeHtml(shippingOf(session)?.name ?? "Unknown")}</p>
      <p style="margin:0 0 4px;color:#3d3d3d;">${customer}</p>
      <p style="margin:0 0 24px;color:#3d3d3d;">${phone}</p>

      ${ukRateMismatch ? `<p style="margin:0 0 20px;padding:12px 16px;background:#fff4e5;border-radius:10px;color:#8a5a00;font-size:13px;line-height:1.6;">⚠️ Delivery address is outside the UK (${escapeHtml(country)}) but only £${(shippingPaid / 100).toFixed(2)} of shipping was paid. You may want to ask for the difference before dispatch.</p>` : ""}

      <h2 style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;margin:0 0 12px;">Delivery Address</h2>
      <p style="margin:0 0 24px;color:#3d3d3d;line-height:1.8;white-space:pre-line;">${address}</p>

      <h2 style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;margin:0 0 12px;">Items Ordered</h2>
      <p style="margin:0 0 24px;color:#3d3d3d;line-height:2;white-space:pre-line;">${itemList}</p>

      <div style="background:#f7f3ff;border-radius:12px;padding:20px 24px;">
        <p style="margin:0 0 8px;font-weight:bold;color:#2d2d2d;">Total: ${total}</p>
        <p style="margin:0;font-size:13px;color:#777;">
          <a href="https://dashboard.stripe.com/payments/${session.payment_intent}" style="color:#9b7fd4;">View in Stripe →</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/* ─── Ready-made stock ─── */

/**
 * Decrements the ready-made stock counters for everything in a paid order.
 * The arithmetic lives in @/lib/stock so it can be exercised on its own.
 */
async function decrementStock(items: Stripe.LineItem[]): Promise<void> {
  const lines: OrderedLine[] = [];

  for (const item of items) {
    const product = item.price?.product;
    if (!product || typeof product !== "object" || "deleted" in product) continue;

    const metadata = (product as Stripe.Product).metadata ?? {};
    if (!metadata.product_id) continue;

    lines.push({
      productId: metadata.product_id,
      size: metadata.size || undefined,
      quantity: item.quantity ?? 1,
    });
  }

  const wanted = collectOrdered(lines);
  if (wanted.size === 0) return;

  const ids = Array.from(wanted.keys());
  const docs = await sanityWriteClient.fetch<StockDoc[]>(
    `*[_id in $ids]{ _id, stock, sizeStock }`,
    { ids }
  );

  // Atomic decrements: two orders for the same piece paid in the same second
  // both count, where a read-then-set would have dropped one of them.
  const tx = sanityWriteClient.transaction();
  let patches = 0;

  for (const doc of docs) {
    const entry = wanted.get(doc._id);
    if (!entry) continue;
    const dec = planStockDecrement(doc, entry);
    if (!dec) continue;
    tx.patch(doc._id, (p) => p.dec(dec));
    patches++;
  }

  if (patches === 0) return;
  await tx.commit();
  console.log(`Ready-made stock decremented for ${patches} product(s)`);

  // dec cannot floor, so bring anything that went below zero back up
  const after = await sanityWriteClient.fetch<StockDoc[]>(
    `*[_id in $ids]{ _id, stock, sizeStock }`,
    { ids }
  );
  const floor = sanityWriteClient.transaction();
  let floored = 0;
  for (const doc of after) {
    const fields = planStockFloor(doc);
    if (!fields) continue;
    floor.patch(doc._id, (p) => p.set(fields));
    floored++;
  }
  if (floored > 0) await floor.commit();
}

/* ─── Abandoned cart ─── */
function abandonedCartHtml(items: Stripe.LineItem[], total: number): string {
  const rows = items
    .map((item) => {
      const qty = item.quantity ?? 1;
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0eaf8;color:#3d3d3d;">${escapeHtml(item.description ?? "Item")}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0eaf8;text-align:right;color:#3d3d3d;">× ${qty}</td>
      </tr>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">
    <div style="background:#e8dff5;padding:34px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">Beautasy</p>
      <h1 style="margin:0;font-size:25px;font-weight:400;color:#2d2d2d;font-style:italic;">Still thinking it over?</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#3d3d3d;line-height:1.7;margin-top:0;">
        Your bag is waiting. Every piece is sewn to order in our Southampton atelier,
        so nothing is mass produced — and popular fabrics do run out.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:22px 0;">${rows}</table>
      <p style="color:#3d3d3d;margin:0 0 22px;"><strong>Total: £${(total / 100).toFixed(2)}</strong></p>
      <p style="text-align:center;margin:0;">
        <a href="${SITE_URL}/shop" style="display:inline-block;padding:13px 30px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Finish your order</a>
      </p>
      <p style="color:#777;font-size:13px;line-height:1.7;margin:24px 0 0;">
        Questions about sizing or fabric? Just reply — Kristina reads every message.
      </p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">You're getting this because you started an order at beautasy.co.uk. Reply "stop" and we won't send another.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Emails a reminder when a checkout expires unpaid.
 *
 * Stripe only knows the address if the shopper typed one before leaving, so
 * this fires for the people who got furthest — exactly the ones worth a nudge.
 * One document per session keeps it to a single reminder.
 */
async function handleAbandonedCart(session: Stripe.Checkout.Session): Promise<void> {
  const email = session.customer_details?.email;
  if (!email) return;

  const already = await sanityWriteClient.fetch<string | null>(
    `*[_type == "abandonedCart" && stripeSessionId == $id][0]._id`,
    { id: session.id }
  );
  if (already) return;

  let items: Stripe.LineItem[] = [];
  try {
    const stripe = getStripeInstance();
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
    items = lineItems.data;
  } catch (err) {
    console.error("Failed to fetch line items for abandoned cart:", err);
  }
  if (items.length === 0) return;

  const total = session.amount_total ?? items.reduce((sum, i) => sum + (i.amount_total ?? 0), 0);
  let reminderSent = false;

  if (process.env.RESEND_API_KEY) {
    try {
      await getResend().emails.send({
        from: FROM_EMAIL,
        to: email,
        replyTo: KRISTINA_EMAIL,
        subject: "Your Beautasy bag is still waiting 💜",
        html: abandonedCartHtml(items, total),
      });
      reminderSent = true;
    } catch (err) {
      console.error("Failed to send abandoned cart email:", err);
    }
  }

  await sanityWriteClient.create({
    _type: "abandonedCart",
    stripeSessionId: session.id,
    email,
    total,
    items: items.map((item, i) => ({
      _key: item.id ?? `item-${i}`,
      name: item.description ?? "Item",
      quantity: item.quantity ?? 1,
    })),
    reminderSent,
    recovered: false,
    createdAt: new Date().toISOString(),
  });

  console.log("Abandoned cart reminder handled for", email);
}

/* ─── Gift cards ─── */

/**
 * Issues a gift card once its purchase is paid for.
 *
 * Scheduled cards are stored but not emailed — the daily job sends those on the
 * chosen morning, which is what makes a gift card work as an actual present.
 */
async function issueGiftCard(session: Stripe.Checkout.Session): Promise<void> {
  const meta = session.metadata ?? {};
  if (meta.gift_card !== "true") return;

  const amount = Number(meta.gift_card_amount ?? session.amount_total ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const existing = await sanityWriteClient.fetch<string | null>(
    `*[_type == "giftCard" && stripeSessionId == $id][0]._id`,
    { id: session.id }
  );
  if (existing) return;

  const deliverAt = meta.gift_card_deliver_at;
  const card = await sanityWriteClient.create({
    _type: "giftCard",
    code: generateGiftCardCode(),
    initialAmount: amount,
    balance: amount,
    recipientEmail: meta.gift_card_recipient,
    recipientName: meta.gift_card_recipient_name,
    message: meta.gift_card_message,
    purchaserEmail: session.customer_details?.email ?? undefined,
    deliverAt: deliverAt || undefined,
    expiresAt: expiryFromNow(),
    active: true,
    stripeSessionId: session.id,
    createdAt: new Date().toISOString(),
  });

  const scheduledForLater = !!deliverAt && new Date(deliverAt).getTime() > Date.now();
  const deliverable = {
    _id: card._id,
    code: card.code as string,
    initialAmount: amount,
    recipientEmail: meta.gift_card_recipient,
    recipientName: meta.gift_card_recipient_name,
    message: meta.gift_card_message,
    expiresAt: card.expiresAt as string,
  };

  if (!scheduledForLater) {
    // If this fails the card keeps no sentAt, and the daily job retries it
    await deliverGiftCard(deliverable);
  }

  // The buyer paid for this and used to hear nothing at all — no receipt, no
  // code, no way to fix a mistyped recipient. Kristina hears about it too.
  await emailGiftCardPurchase(deliverable, {
    purchaserEmail: session.customer_details?.email ?? undefined,
    deliverAt: scheduledForLater ? (deliverAt as string) : undefined,
    total: session.amount_total ?? amount,
  });

  console.log("Gift card issued:", card.code, scheduledForLater ? "(scheduled)" : "(sent)");
}

/** Takes the spent amount off a gift card that paid for part of an order. */
async function spendGiftCard(session: Stripe.Checkout.Session): Promise<void> {
  const cardId = session.metadata?.gift_card_id;
  if (!cardId) return;

  const spent = session.total_details?.amount_discount ?? 0;
  if (spent <= 0) {
    await releaseCard(cardId, session.id);
    return;
  }

  await deductFromCard(cardId, spent, session.id);
  console.log(`Gift card ${cardId} spent £${(spent / 100).toFixed(2)}`);
}

/** An unpaid checkout that held a gift card lets go of it. */
async function releaseGiftCard(session: Stripe.Checkout.Session): Promise<void> {
  const cardId = session.metadata?.gift_card_id;
  if (!cardId) return;
  await releaseCard(cardId, session.id);
}

/* ─── Webhook handler ─── */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeInstance();
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = event.data.object as any as (Stripe.Checkout.Session & { shipping_details?: ShippingDetails | null });

    // Idempotency: Stripe retries delivery on timeouts and non-2xx replies, and
    // without this guard every retry created a second order document, decremented
    // stock again, and emailed the customer and Kristina a duplicate.
    try {
      const alreadyHandled = await sanityWriteClient.fetch<string | null>(
        `*[_type == "order" && stripeSessionId == $id][0]._id`,
        { id: session.id }
      );
      if (alreadyHandled) {
        console.log("Duplicate webhook for session, skipping:", session.id);
        return NextResponse.json({ received: true, duplicate: true });
      }
    } catch (err) {
      // If the lookup itself fails we continue: a possible duplicate order is
      // less damaging than silently dropping a paid order.
      console.error("Duplicate check failed, processing anyway:", err);
    }

    // Fetch line items (not included in webhook by default).
    // Expand price.product so we can read back the product_id metadata we
    // attached at checkout, for the order record below.
    let items: Stripe.LineItem[] = [];
    try {
      const stripe = getStripeInstance();
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        limit: 100,
        expand: ["data.price.product"],
      });
      items = lineItems.data;
    } catch (err) {
      console.error("Failed to fetch line items:", err);
    }

    const customerEmail = session.customer_details?.email;

    // A gift card purchase is not a normal order — issue the card and stop
    if (session.metadata?.gift_card === "true") {
      try {
        await issueGiftCard(session);
      } catch (err) {
        console.error("Failed to issue gift card:", err);
      }
      return NextResponse.json({ received: true, giftCard: true });
    }

    // Deduct whatever a gift card paid towards this order
    try {
      await spendGiftCard(session);
    } catch (err) {
      console.error("Failed to deduct gift card balance:", err);
    }

    // Save the order to Sanity so signed-in customers can see it in "My Orders".
    try {
      await sanityWriteClient.create({
        _type: "order",
        stripeSessionId: session.id,
        userId: session.client_reference_id || undefined,
        customerEmail: customerEmail || undefined,
        customerName: shippingOf(session)?.name ?? session.customer_details?.name ?? undefined,
        items: items.map((item) => {
          const product = item.price?.product;
          const productId =
            product && typeof product === "object" && !("deleted" in product)
              ? (product as Stripe.Product).metadata?.product_id
              : undefined;
          return {
            _key: item.id,
            productId,
            name: item.description ?? "Item",
            quantity: item.quantity ?? 1,
            amountTotal: item.amount_total ?? 0,
          };
        }),
        total: session.amount_total ?? 0,
        shippingAddress: formatAddress(shippingOf(session)),
        status: "paid",
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to save order to Sanity:", err);
    }

    // Keep the ready-made stock counters honest (never blocks made-to-order sales)
    try {
      await decrementStock(items);
    } catch (err) {
      console.error("Failed to decrement stock:", err);
    }

    // Send customer confirmation
    if (customerEmail) {
      try {
        await getResend().emails.send({
          from: FROM_EMAIL,
          to: customerEmail,
          replyTo: KRISTINA_EMAIL,
          subject: "Your Beautasy order is confirmed 💜",
          html: customerEmailHtml(session, items),
        });
        console.log("Customer confirmation sent to:", customerEmail);
      } catch (err) {
        console.error("Failed to send customer email:", err);
      }
    }

    // Send Kristina notification
    try {
      const settings = await getSiteSettings();
      const internationalRate = settings.shipping?.internationalRate ?? DEFAULT_INT_RATE;
      await getResend().emails.send({
        from: FROM_EMAIL,
        to: KRISTINA_EMAIL,
        subject: `New order — ${shippingOf(session)?.name ?? customerEmail} · £${((session.amount_total ?? 0) / 100).toFixed(2)}`,
        html: adminEmailHtml(session, items, internationalRate),
      });
      console.log("Admin notification sent to Kristina");
    } catch (err) {
      console.error("Failed to send admin email:", err);
    }
  }

  if (event.type === "checkout.session.expired") {
    const expired = event.data.object as Stripe.Checkout.Session;
    try {
      await releaseGiftCard(expired);
    } catch (err) {
      console.error("Failed to release a gift card hold:", err);
    }
    try {
      await handleAbandonedCart(expired);
    } catch (err) {
      console.error("Failed to handle abandoned cart:", err);
    }
  }

  return NextResponse.json({ received: true });
}
