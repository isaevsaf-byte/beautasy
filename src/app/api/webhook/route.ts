import { NextRequest, NextResponse } from "next/server";
import { getStripeInstance } from "@/lib/stripe";
import Stripe from "stripe";
import { sanityWriteClient } from "@/lib/sanity";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/site";
import { sendEmail } from "@/lib/sendEmail";
import {
  generateGiftCardCode,
  codeFields,
  expiryFromNow,
  deductFromCard,
  releaseCard,
  deactivateCardForSession,
} from "@/lib/giftCards";
import { deliverGiftCard, emailGiftCardPurchase } from "@/lib/giftCardEmails";
import { getSiteSettings, DEFAULT_INT_RATE } from "@/lib/siteSettings";
import { sealOptional, maskEmail, firstNameOf, emailFingerprint } from "@/lib/pii";
import {
  friendsBlockHtml,
  ownLinkFor,
  referralSettings,
  rewardReferral,
  reverseReferralReward,
} from "@/lib/referrals";
import { stampRefund } from "@/lib/ledgerStore";
import { splitDiscount, type ReferralSettings } from "@/lib/referralRules";
import { pounds } from "@/lib/friendsLink";
import {
  collectOrdered,
  planStockDecrement,
  planStockFloor,
  type OrderedLine,
  type StockDoc,
} from "@/lib/stock";
import {
  giftCardDetails,
  isAlreadyExists,
  lineDetail,
  mayRemind,
  recoveryLinkOf,
  type GiftCardPurchase,
} from "@/lib/orderLines";
import {
  alertReason,
  giftCardNotChargedAlert,
  giftCardNotIssuedAlert,
  orderNotSavedAlert,
  sendPaymentAlert,
} from "@/lib/paymentAlerts";

export const dynamic = "force-dynamic";

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

/** The address on one line, unescaped — for an alert, which escapes it itself. */
function plainAddress(shipping: ShippingDetails | null | undefined): string | undefined {
  if (!shipping?.address) return undefined;
  const a = shipping.address;
  return [shipping.name, a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(", ");
}

/* ─── Format line items ─── */

/**
 * The lines as Kristina reads them: each piece, and under it whatever the
 * customer typed for it — the measurements to cut to, the words for the gift
 * card (see lineDetail). Plain text; the caller escapes it for its email.
 *
 * Only Kristina's emails use this. The measurements are the customer's own
 * and are not repeated back in their confirmation.
 */
function itemLines(items: Stripe.LineItem[]): string[] {
  return items.flatMap((item) => {
    const qty = item.quantity ?? 1;
    const price = item.amount_total ? `£${(item.amount_total / 100).toFixed(2)}` : "";
    const line = `• ${item.description ?? "Item"} × ${qty}  ${price}`;
    const detail = lineDetail(item);
    return detail ? [line, `   ${detail}`] : [line];
  });
}

function formatItems(items: Stripe.LineItem[]): string {
  return itemLines(items).map(escapeHtml).join("\n");
}

/* ─── Customer confirmation email (HTML) ─── */
function customerEmailHtml(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any,
  items: Stripe.LineItem[],
  /** The buyer's own "Give £5, get £5" link, when the programme is on */
  friends: { code: string; settings: ReferralSettings } | null
): string {
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
      ${friends ? friendsBlockHtml(friends.code, friends.settings) : ""}
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
// Exported for its test: what she reads is what she sews to, so it is
// rendered there rather than read off this file's source.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function adminEmailHtml(session: any, items: Stripe.LineItem[], internationalRate: number): string {
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
  // A friend's link brought this order — worth knowing which of them is bringing people in
  const referralDiscount = Number(session.metadata?.referral_discount ?? 0);
  const referredBy = session.metadata?.referrer_name
    ? `<p style="margin:0 0 20px;padding:12px 16px;background:#f7f3ff;border-radius:10px;color:#5e4b9a;font-size:13px;line-height:1.6;">💜 Came through <strong>${escapeHtml(session.metadata.referrer_name)}</strong>'s Friends link${referralDiscount > 0 ? ` — ${pounds(referralDiscount)} off applied` : ""}. Their credit is topped up automatically.</p>`
    : "";

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
      ${referredBy}

      <h2 style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;margin:0 0 12px;">Delivery Address</h2>
      <p style="margin:0 0 24px;color:#3d3d3d;line-height:1.8;white-space:pre-line;">${address}</p>

      <h2 style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;margin:0 0 12px;">Items Ordered</h2>
      <p style="margin:0 0 24px;color:#3d3d3d;line-height:2;white-space:pre-line;">${itemList}</p>

      <div style="background:#f7f3ff;border-radius:12px;padding:20px 24px;">
        <p style="margin:0 0 8px;font-weight:bold;color:#2d2d2d;">Total: ${total}</p>
        <p style="margin:0;font-size:13px;color:#777;">
          <a href="${session.payment_intent ? `https://dashboard.stripe.com/payments/${session.payment_intent}` : `https://dashboard.stripe.com/search?query=${session.id}`}" style="color:#9b7fd4;">View in Stripe →</a>
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
function abandonedCartHtml(
  items: Stripe.LineItem[],
  total: number,
  /** Stripe's link back into this same checkout, or the shop */
  link: string,
  giftCard: boolean
): string {
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
        ${
          giftCard
            ? "Your gift card is one step away. It takes a minute to finish, and it's emailed the moment you do — or on the day you picked."
            : "Your bag is waiting. Every piece is sewn to order in our Southampton atelier, so nothing is mass produced — and popular fabrics do run out."
        }
      </p>
      <table style="width:100%;border-collapse:collapse;margin:22px 0;">${rows}</table>
      <p style="color:#3d3d3d;margin:0 0 22px;"><strong>Total: £${(total / 100).toFixed(2)}</strong></p>
      <p style="text-align:center;margin:0;">
        <a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 30px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">${giftCard ? "Finish your gift card" : "Finish your order"}</a>
      </p>
      <p style="color:#777;font-size:13px;line-height:1.7;margin:24px 0 0;">
        ${giftCard ? "Questions?" : "Questions about sizing or fabric?"} Just reply — Kristina reads every message.
      </p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">You're getting this because you started an order at beautasy.co.uk and said yes to hearing from us. Reply "stop" and we won't send another.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Emails a reminder when a checkout expires unpaid.
 *
 * Only to somebody who ticked "yes" to hearing from us at Stripe's checkout
 * (see mayRemind): a reminder is marketing. Stripe agrees — without that yes,
 * an expired session does not carry the shopper's email at all, which is why
 * this never sent a single one before checkout started asking (see
 * createCheckoutSession). Nothing is kept about anybody who said no.
 *
 * The button reopens the same checkout through Stripe's recovery link rather
 * than the shop: the bag lives in one browser's storage, and an email opened
 * on a phone would have found it empty. One document per session keeps it to
 * a single reminder.
 */
async function handleAbandonedCart(session: Stripe.Checkout.Session): Promise<void> {
  if (!mayRemind(session)) return;
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
  const giftCard = giftCardDetails(session, items) !== null;
  const link = recoveryLinkOf(session, `${SITE_URL}${giftCard ? "/gift-cards" : "/shop"}`);
  let reminderSent = false;

  if (process.env.RESEND_API_KEY) {
    try {
      await sendEmail({
        from: FROM_EMAIL,
        to: email,
        replyTo: KRISTINA_EMAIL,
        subject: giftCard ? "Your Beautasy gift card is still waiting 💜" : "Your Beautasy bag is still waiting 💜",
        html: abandonedCartHtml(items, total, link, giftCard),
      });
      reminderSent = true;
    } catch (err) {
      // `reminderSent` is written onto the document below, and it used to be
      // true whatever Resend answered — so the Studio said a nudge had gone to
      // somebody who never got one. It is the honest answer now. What it is
      // not is a retry: the document itself is the only-one-reminder guard,
      // the `already` check above finds it next time, and nothing reads this
      // field looking for work to redo. A nudge is the cheapest thing on this
      // list to lose, and losing it silently was the part worth fixing.
      console.error("Failed to send abandoned cart email:", err);
    }
  }

  await sanityWriteClient.create({
    _type: "abandonedCart",
    stripeSessionId: session.id,
    emailHint: maskEmail(email),
    emailSealed: sealOptional(email),
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

  // Masked, like everything else about a customer that leaves this shop.
  // The Vercel log is not a safer place for an address than the dataset is —
  // see withoutAddresses in @/lib/sendEmail, which strips them out of refusal
  // reasons heading for the same log.
  console.log("Abandoned cart reminder handled for", maskEmail(email));
}

/* ─── Gift cards ─── */

/**
 * Issues a gift card once its purchase is paid for.
 *
 * Scheduled cards are stored but not emailed — the daily job sends those on the
 * chosen morning, which is what makes a gift card work as an actual present.
 *
 * Safe to run twice for one payment, which is what lets the webhook ask Stripe
 * to try again when it fails: the card is looked for first, and its id is the
 * payment, so two deliveries in flight at once cannot both make one — Sanity
 * refuses the second, and that refusal is read as "already issued". Nothing
 * before the create moves money or sends anything; the emails after it never
 * throw (see @/lib/giftCardEmails), and a card that exists but was never
 * emailed is picked up by the daily job.
 */
async function issueGiftCard(session: Stripe.Checkout.Session, purchase: GiftCardPurchase): Promise<void> {
  const { amount, meta } = purchase;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("The gift card's amount is missing from the payment");
  }

  const existing = await sanityWriteClient.fetch<string | null>(
    `*[_type == "giftCard" && stripeSessionId == $id][0]._id`,
    { id: session.id }
  );
  if (existing) return;

  const deliverAt = meta.gift_card_deliver_at;
  // Generated here and stored only keyed and sealed — the clear code exists
  // for the length of this function and then only in the recipient's inbox.
  const code = generateGiftCardCode();
  let card: { _id: string; codeHint?: string; expiresAt?: string };
  try {
    card = await sanityWriteClient.create({
      _id: `giftCard-${session.id}`,
      _type: "giftCard",
      ...codeFields(code),
      initialAmount: amount,
      balance: amount,
      recipientHint: maskEmail(meta.gift_card_recipient),
      recipientEmailSealed: sealOptional(meta.gift_card_recipient),
      recipientNameSealed: sealOptional(meta.gift_card_recipient_name),
      messageSealed: sealOptional(meta.gift_card_message),
      purchaserEmailSealed: sealOptional(session.customer_details?.email),
      deliverAt: deliverAt || undefined,
      expiresAt: expiryFromNow(),
      active: true,
      stripeSessionId: session.id,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    // The other delivery of this same event made it a moment ago
    if (isAlreadyExists(err)) return;
    throw err;
  }

  const scheduledForLater = !!deliverAt && new Date(deliverAt).getTime() > Date.now();
  const deliverable = {
    _id: card._id,
    code,
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

  // Never log the code itself — Vercel logs are one more place it would sit
  console.log("Gift card issued: …", card.codeHint, scheduledForLater ? "(scheduled)" : "(sent)");
}

/**
 * Takes the spent amount off a gift card that paid for part of an order.
 *
 * Runs once per payment and is not tried again — `dec` twice is the money off
 * twice — so when it fails hello@ is told the card and the amount, to take
 * off by hand. Never throws.
 */
async function spendGiftCard(session: Stripe.Checkout.Session): Promise<void> {
  const cardId = session.metadata?.gift_card_id;
  if (!cardId) return;

  // One coupon carried both a friend's discount and the card; the friend's
  // part is not the card's to pay
  const { giftCard: spent } = splitDiscount(
    session.total_details?.amount_discount ?? 0,
    Number(session.metadata?.referral_discount ?? 0) || 0
  );

  try {
    if (spent <= 0) {
      await releaseCard(cardId, session.id);
      return;
    }
    await deductFromCard(cardId, spent, session.id);
  } catch (err) {
    console.error("Failed to deduct gift card balance:", err);
    if (spent > 0) {
      await sendPaymentAlert(
        giftCardNotChargedAlert({
          sessionId: session.id,
          paymentIntent: paymentIntentOf(session),
          cardId,
          amount: spent,
          reason: alertReason(err),
        })
      );
    }
    return;
  }
  console.log(`Gift card ${cardId} spent £${(spent / 100).toFixed(2)}`);
}

/** The payment's id, for a link into Stripe — absent when a gift card paid it all. */
function paymentIntentOf(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  return typeof pi === "string" ? pi : pi?.id ?? null;
}

/**
 * Marks the abandoned cart a reminder reopened as recovered, so the Studio can
 * tell a reminder that worked from one that did not. Best-effort: it is a
 * number on a dashboard, not money.
 */
async function markCartRecovered(expiredSessionId: string): Promise<void> {
  const cartId = await sanityWriteClient.fetch<string | null>(
    `*[_type == "abandonedCart" && stripeSessionId == $id][0]._id`,
    { id: expiredSessionId }
  );
  if (cartId) await sanityWriteClient.patch(cartId).set({ recovered: true }).commit();
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
    const customerName = shippingOf(session)?.name ?? session.customer_details?.name;

    // A gift card purchase is not a normal order — issue the card and stop
    const giftCard = giftCardDetails(session, items);
    if (giftCard) {
      try {
        await issueGiftCard(session, giftCard);
      } catch (err) {
        console.error("Failed to issue gift card:", err);
        await sendPaymentAlert(
          giftCardNotIssuedAlert({
            sessionId: session.id,
            paymentIntent: paymentIntentOf(session),
            amount: giftCard.amount || (session.amount_total ?? 0),
            buyerEmail: customerEmail,
            recipient: giftCard.meta.gift_card_recipient,
            recipientName: giftCard.meta.gift_card_recipient_name,
            deliverAt: giftCard.meta.gift_card_deliver_at,
            reason: alertReason(err),
          })
        );
        // A 500 makes Stripe deliver this event again, for up to three days,
        // and that is safe here and only here: issueGiftCard looks for the
        // card before making one and makes it under the payment's own id, and
        // nothing before that moves money or sends an email. So the next try
        // either finds the card a lost reply had in fact made, or makes it —
        // never a second card. It used to answer 200, and a card somebody had
        // paid for was never issued and never mentioned to anyone.
        return NextResponse.json({ error: "Gift card not issued yet" }, { status: 500 });
      }
      return NextResponse.json({ received: true, giftCard: true });
    }

    // The order is written before anything else is done for it — before the
    // gift card is charged, the stock taken off or anybody emailed — because
    // that order is what makes a failure here safe to hand back to Stripe.
    // When the write fails, nothing has happened yet, so a 500 lets Stripe
    // deliver the event again later and the whole handler runs once, properly,
    // on the try that works. Charging the card first, as this used to, would
    // have charged it again on every retry; so it used to answer 200, and a
    // paid order lived only in two emails.
    const referrerId = session.metadata?.referrer_id || undefined;
    const referralDiscount = Number(session.metadata?.referral_discount ?? 0) || 0;
    try {
      await sanityWriteClient.create({
        // The id is the payment, the way a booked slot's id is the slot. The
        // check above catches the ordinary retry; this catches the one it
        // cannot — two retries in flight at once, both reading "no order yet"
        // before either writes. Sanity refuses a second document with an id
        // that exists, and the delivery that loses stops right there (below),
        // so the stock is taken off and the confirmation sent once, by the
        // delivery that saved the order.
        _id: `order-${session.id}`,
        _type: "order",
        stripeSessionId: session.id,
        userId: session.client_reference_id || undefined,
        // Readable enough to find the order, sealed everywhere it matters
        displayName: firstNameOf(customerName),
        emailHint: maskEmail(customerEmail),
        customerEmailSealed: sealOptional(customerEmail),
        customerNameSealed: sealOptional(customerName),
        // Keyed and one-way: what "has this address ordered before?" is asked of
        emailFingerprint: customerEmail ? emailFingerprint(customerEmail) : undefined,
        ...(referrerId
          ? {
              referrer: { _type: "reference", _ref: referrerId, _weak: true },
              referredBy: session.metadata?.referrer_name || undefined,
              referralDiscount: referralDiscount || undefined,
            }
          : {}),
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
            // The measurements or the gift card's words, sealed like every
            // other thing a customer told us (see lineDetail)
            detailSealed: sealOptional(lineDetail(item)),
          };
        }),
        total: session.amount_total ?? 0,
        shippingAddressSealed: sealOptional(formatAddress(shippingOf(session))),
        status: "paid",
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      if (isAlreadyExists(err)) {
        // Another delivery of this same event saved it a moment ago and is
        // doing the rest; doing it here too is the stock off twice
        console.log("Order already saved by another delivery, skipping:", session.id);
        return NextResponse.json({ received: true, duplicate: true });
      }
      console.error("Failed to save order to Sanity:", err);
      await sendPaymentAlert(
        orderNotSavedAlert({
          sessionId: session.id,
          paymentIntent: paymentIntentOf(session),
          total: session.amount_total ?? 0,
          customerName,
          customerEmail,
          phone: session.customer_details?.phone,
          address: plainAddress(shippingOf(session)),
          items: itemLines(items),
          reason: alertReason(err),
        })
      );
      return NextResponse.json({ error: "Order not saved yet" }, { status: 500 });
    }

    // Deduct whatever a gift card paid towards this order. Once only, after
    // the order exists — see spendGiftCard, which tells hello@ if it fails.
    await spendGiftCard(session);

    // A reminder brought them back: the cart it was about is now an order
    if (session.recovered_from) {
      try {
        await markCartRecovered(session.recovered_from);
      } catch (err) {
        console.error("Could not mark an abandoned cart as recovered:", err);
      }
    }

    // A friend's link brought this order: credit whoever shared it. The event
    // is keyed on the session, so a retried webhook cannot pay twice.
    if (referrerId) {
      try {
        const outcome = await rewardReferral({
          kind: "order",
          referrerId,
          friend: { name: customerName, email: customerEmail },
          sourceId: session.id,
          discount: referralDiscount,
        });
        console.log("Referral reward for session", session.id, "→", outcome);
      } catch (err) {
        console.error("Failed to reward a referral:", err);
      }
    }

    // The buyer gets a link of their own — the confirmation is the moment they
    // are most likely to tell someone
    let friends: { code: string; settings: ReferralSettings } | null = null;
    try {
      const code = await ownLinkFor(customerName, customerEmail, "order");
      if (code) friends = { code, settings: await referralSettings() };
    } catch (err) {
      console.error("Could not prepare the buyer's Friends link:", err);
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
        // Best-effort, and it has to be: by now the order is saved and the
        // card charged, so this webhook is answered 200 whatever happens here
        // and nothing comes back for a second go. The order itself is in
        // Sanity, so a confirmation that was refused can be sent by hand — but
        // only by somebody who knows it was, which before this was nobody.
        await sendEmail({
          from: FROM_EMAIL,
          to: customerEmail,
          replyTo: KRISTINA_EMAIL,
          subject: "Your Beautasy order is confirmed 💜",
          html: customerEmailHtml(session, items, friends),
        });
        console.log("Customer confirmation sent to:", maskEmail(customerEmail));
      } catch (err) {
        console.error("Failed to send customer email:", err);
      }
    }

    // Send Kristina notification
    try {
      const settings = await getSiteSettings();
      const internationalRate = settings.shipping?.internationalRate ?? DEFAULT_INT_RATE;
      await sendEmail({
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

  // A refunded order undoes the friend's reward. Without this, paying £15 and
  // then asking for the money back still leaves £5 of spendable credit on
  // someone's card — buying money at a discount.
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;

    // The referral event and the order are both keyed on the Checkout
    // session, and a charge only knows its payment intent, so ask Stripe for
    // the session once, for both.
    let sessionId: string | undefined;
    let refundedSession: Stripe.Checkout.Session | undefined;
    try {
      const paymentIntent =
        typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (paymentIntent) {
        const stripe = getStripeInstance();
        const sessions = await stripe.checkout.sessions.list({
          payment_intent: paymentIntent,
          limit: 1,
        });
        refundedSession = sessions.data[0];
        sessionId = refundedSession?.id;
      }
    } catch (err) {
      console.error("Could not find the Checkout session for a refund:", err);
    }

    // «Касса» hears about every refund, part or whole: either way it is money
    // going back out, and the order's own total never changes to say so.
    if (sessionId) {
      try {
        await stampRefund(sessionId, charge.amount_refunded, new Date().toISOString());
      } catch (err) {
        console.error("Failed to note a refund for the ledger:", err);
      }
    }

    // Part of an order coming back is not the order coming undone: the friend
    // still bought something, so the reward stands.
    if (charge.amount_refunded < charge.amount) {
      return NextResponse.json({ received: true, partialRefund: true });
    }

    // A gift card whose money has all gone back stops being money. It used to
    // stay spendable: bought, refunded in full, and then spent on a dress.
    if (sessionId && refundedSession && giftCardDetails(refundedSession, [])) {
      try {
        const cardId = await deactivateCardForSession(sessionId);
        console.log("Refund of gift card session", sessionId, "→", cardId ? `card ${cardId} switched off` : "no card found");
      } catch (err) {
        console.error("Failed to switch off a refunded gift card:", err);
      }
    }

    if (sessionId) {
      try {
        const outcome = await reverseReferralReward("order", sessionId);
        console.log("Refund of session", sessionId, "→ referral", outcome);
      } catch (err) {
        console.error("Failed to take back a referral reward after a refund:", err);
      }
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
