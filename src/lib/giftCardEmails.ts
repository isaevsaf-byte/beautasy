import { Resend } from "resend";
import { sanityClient, sanityWriteClient } from "@/lib/sanity";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/site";

/**
 * Delivering gift cards: immediately, or on the date the buyer chose (which is
 * what makes a gift card usable as an actual present rather than a receipt).
 */

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

export interface DeliverableCard {
  _id: string;
  code: string;
  initialAmount: number;
  recipientEmail?: string;
  recipientName?: string;
  message?: string;
  expiresAt?: string;
}

export function giftCardEmailHtml(card: DeliverableCard): string {
  const amount = `£${(card.initialAmount / 100).toFixed(2)}`;
  const name = card.recipientName ? escapeHtml(card.recipientName) : "there";
  const expires = card.expiresAt
    ? new Date(card.expiresAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">
    <div style="background:#e8dff5;padding:36px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">Beautasy</p>
      <h1 style="margin:0;font-size:26px;font-weight:400;color:#2d2d2d;font-style:italic;">A gift for you, ${name}</h1>
    </div>
    <div style="padding:32px 40px;">
      ${
        card.message
          ? `<div style="background:#f7f3ff;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
               <p style="margin:0;color:#3d3d3d;line-height:1.7;font-style:italic;">“${escapeHtml(card.message)}”</p>
             </div>`
          : ""
      }
      <div style="border:1px dashed #cfc0f0;border-radius:14px;padding:26px;text-align:center;">
        <p style="margin:0 0 6px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;">Gift card</p>
        <p style="margin:0 0 14px;font-size:34px;color:#2d2d2d;">${amount}</p>
        <p style="margin:0;font-size:20px;letter-spacing:3px;color:#2d2d2d;">${escapeHtml(card.code)}</p>
      </div>
      <p style="color:#3d3d3d;line-height:1.7;margin:24px 0 0;">
        Enter the code in your bag at checkout. You don't have to spend it all at once —
        whatever is left stays on the card for next time.
      </p>
      ${expires ? `<p style="color:#777;font-size:13px;margin:10px 0 0;">Valid until ${expires}.</p>` : ""}
      <p style="text-align:center;margin:26px 0 0;">
        <a href="${SITE_URL}/shop" style="display:inline-block;padding:13px 30px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Choose something</a>
      </p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">Every piece handmade in Southampton 💜</p>
    </div>
  </div>
</body>
</html>`;
}

/** Emails one card to its recipient and stamps it as sent. */
export async function deliverGiftCard(card: DeliverableCard): Promise<boolean> {
  if (!card.recipientEmail || !process.env.RESEND_API_KEY) return false;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: FROM_EMAIL,
      to: card.recipientEmail,
      replyTo: KRISTINA_EMAIL,
      subject: `You've been given a Beautasy gift card 💜`,
      html: giftCardEmailHtml(card),
    });
    await sanityWriteClient.patch(card._id).set({ sentAt: new Date().toISOString() }).commit();
    return true;
  } catch (err) {
    console.error(`Failed to deliver gift card ${card._id}:`, err);
    return false;
  }
}

const DUE_QUERY = `*[
  _type == "giftCard"
  && !defined(sentAt)
  && defined(recipientEmail)
  && defined(deliverAt)
  && deliverAt <= $now
] [0...50] { _id, code, initialAmount, recipientEmail, recipientName, message, expiresAt }`;

/** Sends any scheduled cards whose date has arrived. Called by the daily job. */
export async function deliverScheduledGiftCards(): Promise<{ due: number; sent: number }> {
  if (!process.env.RESEND_API_KEY || !process.env.SANITY_API_WRITE_TOKEN) {
    return { due: 0, sent: 0 };
  }

  const cards: DeliverableCard[] = await sanityClient.fetch(DUE_QUERY, {
    now: new Date().toISOString(),
  });

  let sent = 0;
  for (const card of cards) {
    if (await deliverGiftCard(card)) sent++;
  }

  return { due: cards.length, sent };
}
