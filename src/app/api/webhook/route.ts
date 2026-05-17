import { NextRequest, NextResponse } from "next/server";
import { getStripeInstance } from "@/lib/stripe";
import Stripe from "stripe";
import { Resend } from "resend";

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
    .join("\n");
}

/* ─── Format line items ─── */
function formatItems(items: Stripe.LineItem[]): string {
  return items
    .map((item) => {
      const qty = item.quantity ?? 1;
      const price = item.amount_total ? `£${(item.amount_total / 100).toFixed(2)}` : "";
      return `• ${item.description ?? item.price?.product} × ${qty}  ${price}`;
    })
    .join("\n");
}

/* ─── Customer confirmation email (HTML) ─── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function customerEmailHtml(session: any, items: Stripe.LineItem[]): string {
  const address = formatAddress(session.shipping_details);
  const total = `£${((session.amount_total ?? 0) / 100).toFixed(2)}`;
  const name = session.shipping_details?.name ?? session.customer_details?.name ?? "there";
  const firstName = name.split(" ")[0];

  const itemRows = items
    .map((item) => {
      const qty = item.quantity ?? 1;
      const price = item.amount_total ? `£${(item.amount_total / 100).toFixed(2)}` : "";
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0eaf8;color:#3d3d3d;">${item.description ?? "Item"}</td>
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
          <a href="https://beautasy.co.uk/contact" style="color:#9b7fd4;text-decoration:none;">beautasy.co.uk/contact</a>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:24px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:12px;color:#aaa;">Made with 💜 in Southampton · <a href="https://beautasy.co.uk" style="color:#aaa;">beautasy.co.uk</a></p>
    </div>
  </div>
</body>
</html>`;
}

/* ─── Kristina notification email (HTML) ─── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adminEmailHtml(session: any, items: Stripe.LineItem[]): string {
  const address = formatAddress(session.shipping_details);
  const total = `£${((session.amount_total ?? 0) / 100).toFixed(2)}`;
  const customer = session.customer_details?.email ?? "Unknown";
  const phone = session.customer_details?.phone ?? "Not provided";
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
      <p style="margin:0 0 4px;color:#3d3d3d;">${session.shipping_details?.name ?? "Unknown"}</p>
      <p style="margin:0 0 4px;color:#3d3d3d;">${customer}</p>
      <p style="margin:0 0 24px;color:#3d3d3d;">${phone}</p>

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

    // Fetch line items (not included in webhook by default)
    let items: Stripe.LineItem[] = [];
    try {
      const stripe = getStripeInstance();
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      items = lineItems.data;
    } catch (err) {
      console.error("Failed to fetch line items:", err);
    }

    const customerEmail = session.customer_details?.email;

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
      await getResend().emails.send({
        from: FROM_EMAIL,
        to: KRISTINA_EMAIL,
        subject: `New order — ${session.shipping_details?.name ?? customerEmail} · £${((session.amount_total ?? 0) / 100).toFixed(2)}`,
        html: adminEmailHtml(session, items),
      });
      console.log("Admin notification sent to Kristina");
    } catch (err) {
      console.error("Failed to send admin email:", err);
    }
  }

  return NextResponse.json({ received: true });
}
