import { Resend } from "resend";
import { sanityWriteClient } from "@/lib/sanity";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/site";
import { claimThenSend } from "@/lib/claim";
import { open } from "@/lib/pii";
import { friendsBlockHtml, ownLinkFor, referralSettings } from "@/lib/referrals";
import type { ReferralSettings } from "@/lib/referralRules";

/**
 * Keeps the customer in the loop while their order is being made.
 *
 * Pieces are sewn to order over 3–5 days, and until now the shop went silent
 * the moment the confirmation email landed: Kristina moved the order through
 * "in production → shipped → delivered" in the Studio and the customer never
 * heard about any of it. That silence is what turns into "where is my order?".
 */

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

/** Statuses worth an email. "paid" is already covered by the confirmation. */
const NOTIFIABLE = ["in-production", "shipped", "delivered"] as const;
type NotifiableStatus = (typeof NOTIFIABLE)[number];

export interface NotifiableOrder {
  _id: string;
  /** Revision the order was read at — the claim is conditional on it */
  _rev: string;
  status: string;
  notifiedStatus?: string;
  /** Sealed address — see @/lib/pii */
  customerEmailSealed?: string;
  /** First name, readable, for the greeting */
  displayName?: string;
  trackingUrl?: string;
  items?: { name: string; quantity: number }[];
}

const COPY: Record<NotifiableStatus, { subject: string; heading: string; body: string }> = {
  "in-production": {
    subject: "Your Beautasy order is on the cutting table 💜",
    heading: "We've started making it",
    body: "Your fabric is cut and your pieces are being sewn in our Southampton atelier. We'll email again the moment they're on their way to you.",
  },
  shipped: {
    subject: "Your Beautasy order is on its way 💜",
    heading: "It's on its way",
    body: "Your parcel has left the atelier. UK deliveries usually arrive within 3–5 business days, and international orders within 7–14.",
  },
  delivered: {
    subject: "Your Beautasy order has arrived 💜",
    heading: "It's with you",
    body: "Your parcel has been delivered. Give everything a gentle first wash by hand, and if anything isn't quite right, reply to this email — we'd rather fix it than have you wear something that doesn't fit.",
  },
};

function statusEmail(
  order: NotifiableOrder,
  status: NotifiableStatus,
  /** The customer's own "Give £5, get £5" link — offered once the parcel has arrived */
  friends: { code: string; settings: ReferralSettings } | null = null
): string {
  const { heading, body } = COPY[status];
  const firstName = escapeHtml(order.displayName ?? "there");
  const pieces = (order.items ?? [])
    .map((item) => `<li style="margin-bottom:6px;color:#3d3d3d;">${escapeHtml(item.name)} × ${item.quantity}</li>`)
    .join("");

  const trackingButton =
    status === "shipped" && order.trackingUrl
      ? `<p style="text-align:center;margin:26px 0 0;">
           <a href="${escapeHtml(order.trackingUrl)}" style="display:inline-block;padding:13px 30px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Track your parcel</a>
         </p>`
      : `<p style="text-align:center;margin:26px 0 0;">
           <a href="${SITE_URL}/orders" style="display:inline-block;padding:13px 30px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">View your order</a>
         </p>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">
    <div style="background:#e8dff5;padding:34px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">Beautasy</p>
      <h1 style="margin:0;font-size:25px;font-weight:400;color:#2d2d2d;font-style:italic;">${heading}</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#3d3d3d;line-height:1.7;margin-top:0;">${firstName}, ${body}</p>
      ${pieces ? `<ul style="padding-left:20px;margin:20px 0;">${pieces}</ul>` : ""}
      ${trackingButton}
      <p style="color:#777;font-size:13px;line-height:1.7;margin:24px 0 0;text-align:center;">
        Questions? Just reply — Kristina reads every message.
      </p>
      ${status === "delivered" && friends ? friendsBlockHtml(friends.code, friends.settings) : ""}
    </div>
    <div style="padding:20px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">Made with 💜 in Southampton</p>
    </div>
  </div>
</body>
</html>`;
}

const PENDING_QUERY = `*[
  _type == "order"
  && defined(customerEmailSealed)
  && status in ["in-production", "shipped", "delivered"]
  && (!defined(notifiedStatus) || notifiedStatus != status)
] | order(createdAt desc) [0...$limit] {
  _id, _rev, status, notifiedStatus, customerEmailSealed, displayName, trackingUrl,
  "items": items[]{ name, quantity }
}`;

/**
 * Emails everyone whose order moved to a status they haven't been told about.
 * Safe to call repeatedly, and safe to call from several places at once: the
 * order is claimed (notifiedStatus set, conditional on its revision) before
 * the email goes out, so the Studio button, the Sanity webhook and the daily
 * job can overlap without anyone hearing the same news twice.
 */
export async function sendPendingStatusEmails(limit = 50): Promise<{ checked: number; sent: number }> {
  if (!process.env.RESEND_API_KEY || !process.env.SANITY_API_WRITE_TOKEN) {
    return { checked: 0, sent: 0 };
  }

  const orders: NotifiableOrder[] = await sanityWriteClient.fetch(PENDING_QUERY, { limit });
  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;

  for (const order of orders) {
    const status = order.status as NotifiableStatus;
    if (!NOTIFIABLE.includes(status)) continue;

    const email = open(order.customerEmailSealed);
    if (!email) {
      console.error(`Order ${order._id} has no readable email — not notifying`);
      continue;
    }

    // The parcel has arrived and been tried on: the moment to offer a link
    let friends: { code: string; settings: ReferralSettings } | null = null;
    if (status === "delivered") {
      const code = await ownLinkFor(order.displayName, email, "order");
      if (code) friends = { code, settings: await referralSettings() };
    }

    const outcome = await claimThenSend(
      sanityWriteClient,
      order,
      { notifiedStatus: status },
      order.notifiedStatus ? { notifiedStatus: order.notifiedStatus } : ["notifiedStatus"],
      () =>
        resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          replyTo: KRISTINA_EMAIL,
          subject: COPY[status].subject,
          html: statusEmail(order, status, friends),
        })
    );
    if (outcome === "sent") sent++;
  }

  return { checked: orders.length, sent };
}
