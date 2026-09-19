import { sanityWriteClient } from "@/lib/sanity";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/site";
import { revealCode } from "@/lib/giftCards";
import { open } from "@/lib/pii";
import { sendEmail, viaResend, type Deliver } from "@/lib/sendEmail";

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

/** The stamp DUE_QUERY reads. Separate so `deliverGiftCard` can be watched. */
async function markSent(id: string, at: string): Promise<unknown> {
  return sanityWriteClient.patch(id).set({ sentAt: at }).commit();
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

/**
 * Emails one card to its recipient and stamps it as sent.
 *
 * The stamp goes on only once the mail service has actually taken the email,
 * and that is the whole of this function's job. `sentAt` is what DUE_QUERY
 * below reads to decide a card has been delivered, so a stamp written after a
 * refusal was a paid-for present nobody would ever receive and no run would
 * ever pick up again — and `true` came back, so the cron's own count said it
 * had gone. A refusal throws now (see @/lib/sendEmail), the stamp is never
 * reached, and the next run finds the card exactly where it left it.
 *
 * Both halves are seams so that a test can watch which of them happened. The
 * order is the whole behaviour here and it is invisible from the outside: a
 * card that came back `false` and a card that came back `false` with a stamp
 * on it look identical to the caller, and only the second one is money the
 * recipient never sees.
 *
 * The price of choosing that order, said here rather than left to be found:
 * when the email goes and the stamp does not, the recipient gets the same
 * present twice, with the same code on it, on two consecutive mornings. That
 * is the cheaper of the two mistakes — the code is one document, so a card
 * delivered twice cannot be spent twice — and the write is tried again once
 * before it is accepted, below.
 */
export async function deliverGiftCard(
  card: DeliverableCard,
  deps: { deliver?: Deliver; stamp?: (id: string, at: string) => Promise<unknown> } = {}
): Promise<boolean> {
  if (!card.recipientEmail || !process.env.RESEND_API_KEY) return false;

  try {
    await sendEmail(
      {
        from: FROM_EMAIL,
        to: card.recipientEmail,
        replyTo: KRISTINA_EMAIL,
        subject: `You've been given a Beautasy gift card 💜`,
        html: giftCardEmailHtml(card),
      },
      deps.deliver ?? viaResend
    );
  } catch (err) {
    console.error(`Failed to deliver gift card ${card._id}:`, err);
    return false;
  }

  // The email has gone. From here on the only question left is whether this
  // shop can remember that it went, and the two failures are not the same
  // size, so they are no longer in the same try block.
  //
  // A stamp that does not get written leaves a card DUE_QUERY will find again
  // tomorrow morning, and the recipient is given the same present a second
  // time, with the same code on it — embarrassing, and not money lost, because
  // the card is one document and spending it twice is not possible. A stamp
  // written after a refusal is the other way round: a present somebody paid
  // for that no run will ever send. So the order stays as it is, and the one
  // thing worth adding is a second try at the write before giving up, because
  // the usual reason it fails is a moment of Sanity being busy.
  const stamp = deps.stamp ?? markSent;
  const at = new Date().toISOString();
  try {
    await stamp(card._id, at);
  } catch (err) {
    console.error(`Gift card ${card._id} was sent but not stamped — trying once more:`, err);
    try {
      await stamp(card._id, at);
    } catch (again) {
      console.error(`Gift card ${card._id} will be sent a second time tomorrow:`, again);
      return false;
    }
  }
  return true;
}

// Scheduled cards whose morning has come, plus any "send now" card whose first
// attempt failed (no deliverAt, no sentAt) — those used to be lost for good.
//
// The recipient is stored sealed (see @/lib/pii), so that is the field to ask
// for. The filter used to name the clear-text field, which no card has carried
// since sealing, and the job quietly matched nothing: a card bought for a
// birthday three weeks away would never have arrived.
//
// Friends credit (source == "referral") is a gift card too, but its delivery
// is the reward email; it marks itself sent at creation and is left out here
// as well, so a change to either side cannot put it in this queue.
export const DUE_QUERY = `*[
  _type == "giftCard"
  && !defined(sentAt)
  && defined(recipientEmailSealed)
  && source != "referral"
  && (!defined(deliverAt) || deliverAt <= $now)
] [0...50] {
  _id, codeSealed, codeHint, initialAmount, expiresAt,
  recipientEmailSealed, recipientNameSealed, messageSealed
}`;

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
 * problem must not undo the card, which is already issued. Best-effort means
 * the reason reaches the log rather than nowhere: neither of these marks
 * anything and neither is ever retried, so a refusal here costs a receipt and
 * a "gift card sold" line, and until now the only way to find out was to go
 * looking in the Studio.
 */
export async function emailGiftCardPurchase(
  card: DeliverableCard,
  opts: { purchaserEmail?: string; deliverAt?: string; total: number }
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  const amount = `£${(card.initialAmount / 100).toFixed(2)}`;

  if (opts.purchaserEmail) {
    try {
      await sendEmail({
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
    await sendEmail({
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

  const due: {
    _id: string;
    codeSealed?: string;
    codeHint?: string;
    initialAmount: number;
    expiresAt?: string;
    recipientEmailSealed?: string;
    recipientNameSealed?: string;
    messageSealed?: string;
  }[] = await sanityWriteClient.fetch(DUE_QUERY, { now: new Date().toISOString() });

  let sent = 0;
  for (const card of due) {
    // Everything about a card is sealed in the document; an email needs the
    // real values, and a card nobody could read is a card nobody can spend.
    const code = revealCode(card);
    const recipientEmail = open(card.recipientEmailSealed);
    if (!code || !recipientEmail) {
      console.error(
        `Gift card ${card._id} (…${card.codeHint ?? "????"}) could not be unsealed — DATA_SECRET may have changed. Not emailing it.`
      );
      continue;
    }
    const delivered = await deliverGiftCard({
      _id: card._id,
      code,
      initialAmount: card.initialAmount,
      expiresAt: card.expiresAt,
      recipientEmail,
      recipientName: open(card.recipientNameSealed) ?? undefined,
      message: open(card.messageSealed) ?? undefined,
    });
    if (delivered) sent++;
  }

  return { due: due.length, sent };
}
