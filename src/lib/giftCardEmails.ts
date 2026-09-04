import { Resend } from "resend";
import { sanityWriteClient } from "@/lib/sanity";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/site";
import { revealCode } from "@/lib/giftCards";

/**
 * Delivering gift cards: immediately, or on the date the buyer chose (which is
 * what makes a gift card usable as an actual present rather than a receipt).
 */

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

export interface DeliverableCard {
  _id: string;
  /** The code in the clear — held only long enough to put it in an email */
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

// Scheduled cards whose morning has come, plus any "send now" card whose first
// attempt failed (no deliverAt, no sentAt) — those used to be lost for good.
const DUE_QUERY = `*[
  _type == "giftCard"
  && !defined(sentAt)
  && defined(recipientEmail)
  && (!defined(deliverAt) || deliverAt <= $now)
] [0...50] { _id, codeSealed, codeHint, initialAmount, recipientEmail, recipientName, message, expiresAt }`;

/** The buyer's receipt: what was bought, for whom, when it arrives, and the code as a backup. */
function purchaseReceiptHtml(
  card: DeliverableCard,
  opts: { deliverAt?: string; total: number }
): string {
  const amount = `£${(card.initialAmount / 100).toFixed(2)}`;
  const paid = `£${(opts.total / 100).toFixed(2)}`;
  const to = escapeHtml(card.recipientName ? `${card.recipientName} (${card.recipientEmail})` : card.recipientEmail ?? "");
  const when = opts.deliverAt
    ? `on ${new Date(opts.deliverAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`
    : "straight away";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">
    <div style="background:#e8dff5;padding:36px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">Beautasy</p>
      <h1 style="margin:0;font-size:26px;font-weight:400;color:#2d2d2d;font-style:italic;">Your gift card is on its way</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#3d3d3d;line-height:1.7;margin-top:0;">
        Thank you — a ${amount} Beautasy gift card is being emailed to <strong>${to}</strong> ${when}.
        You paid ${paid}.
      </p>
      <div style="border:1px dashed #cfc0f0;border-radius:14px;padding:22px;text-align:center;margin:24px 0;">
        <p style="margin:0 0 6px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;">The code, in case it goes astray</p>
        <p style="margin:0;font-size:20px;letter-spacing:3px;color:#2d2d2d;">${escapeHtml(card.code)}</p>
      </div>
      <p style="color:#777;font-size:13px;line-height:1.7;margin:0;">
        Wrong address, or want it to arrive on a different day? Reply to this email and Kristina will sort it.
      </p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">Every piece handmade in Southampton 💜</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Tells the buyer and Kristina that a card was bought.
 *
 * Neither used to hear anything: the webhook returned early for gift cards, so
 * the person who paid had no receipt and no code, and a mistyped recipient
 * address quietly swallowed the money. Both emails are best-effort — a mail
 * problem must not undo the card, which is already issued.
 */
export async function emailGiftCardPurchase(
  card: DeliverableCard,
  opts: { purchaserEmail?: string; deliverAt?: string; total: number }
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const amount = `£${(card.initialAmount / 100).toFixed(2)}`;

  if (opts.purchaserEmail) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: opts.purchaserEmail,
        replyTo: KRISTINA_EMAIL,
        subject: `Your ${amount} Beautasy gift card 💜`,
        html: purchaseReceiptHtml(card, opts),
      });
    } catch (err) {
      console.error(`Failed to send gift card receipt for ${card._id}:`, err);
    }
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: KRISTINA_EMAIL,
      subject: `Gift card sold — ${amount}`,
      html: `
        <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;">
          <p style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#9b7fd4;">Gift card</p>
          <h1 style="font-size:22px;font-weight:400;">${amount} sold</h1>
          <p style="color:#3d3d3d;line-height:1.8;">
            <strong>Code:</strong> ${escapeHtml(card.code)}<br/>
            <strong>Bought by:</strong> ${escapeHtml(opts.purchaserEmail ?? "unknown")}<br/>
            <strong>For:</strong> ${escapeHtml(card.recipientName ? `${card.recipientName} (${card.recipientEmail})` : card.recipientEmail ?? "")}<br/>
            <strong>Arrives:</strong> ${opts.deliverAt ? escapeHtml(new Date(opts.deliverAt).toLocaleDateString("en-GB")) : "straight away"}
          </p>
        </div>`,
    });
  } catch (err) {
    console.error(`Failed to notify Kristina about gift card ${card._id}:`, err);
  }
}

/** Sends any scheduled cards whose date has arrived, and retries any that failed. Called by the daily job. */
export async function deliverScheduledGiftCards(): Promise<{ due: number; sent: number }> {
  if (!process.env.RESEND_API_KEY || !process.env.SANITY_API_WRITE_TOKEN) {
    return { due: 0, sent: 0 };
  }

  const due: (Omit<DeliverableCard, "code"> & { codeSealed?: string; codeHint?: string })[] =
    await sanityWriteClient.fetch(DUE_QUERY, { now: new Date().toISOString() });

  let sent = 0;
  for (const card of due) {
    // The code is sealed in the document; an email needs the real thing
    const code = revealCode(card);
    if (!code) {
      console.error(
        `Gift card ${card._id} (…${card.codeHint ?? "????"}) could not be unsealed — DATA_SECRET may have changed. Not emailing a card nobody could spend.`
      );
      continue;
    }
    if (await deliverGiftCard({ ...card, code })) sent++;
  }

  return { due: due.length, sent };
}
