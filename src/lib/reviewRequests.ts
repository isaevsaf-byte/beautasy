import { sanityWriteClient } from "@/lib/sanity";
import { escapeHtml } from "@/lib/escapeHtml";
import { generateReviewToken, reviewTokenFingerprint } from "@/lib/reviewToken";
import { SITE_URL } from "@/lib/site";
import { BUSINESS } from "@/lib/business";
import { open } from "@/lib/pii";
import { claimThenSend, type ClaimClient, type ClaimOutcome } from "@/lib/claim";
import { sendEmail } from "@/lib/sendEmail";

/**
 * Asks recent customers for a review, with a tokenised link so they don't need
 * an account. Extracted from the cron route so the single daily job can call it.
 */

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

/** Wait this long after the order before asking — production plus delivery. */
const DAYS_BEFORE_ASKING = 14;
/** Cap per run so one cron invocation can't hit the function timeout. */
const MAX_PER_RUN = 25;

interface PendingOrder {
  _id: string;
  /** Revision the order was read at — the claim is conditional on it */
  _rev: string;
  /** Sealed address — see @/lib/pii */
  customerEmailSealed?: string;
  /** First name, readable, for the greeting */
  displayName?: string;
  items: { productId?: string; name: string }[];
}

/**
 * Exported so a test can run it rather than read it: it is the only thing that
 * says whether a customer the mail service refused is ever looked at again.
 */
export const PENDING_QUERY = `*[
  _type == "order"
  && defined(customerEmailSealed)
  && !defined(reviewRequestSentAt)
  && createdAt < $cutoff
  && status in ["paid", "in-production", "shipped", "delivered"]
] | order(createdAt asc) [0...$limit] {
  _id, _rev, customerEmailSealed, displayName, "items": items[]{ productId, name }
}`;

function requestEmail(order: PendingOrder, token: string): string {
  const firstName = escapeHtml(order.displayName ?? "there");
  const pieces = order.items
    .filter((item) => item.productId)
    .map((item) => `<li style="margin-bottom:6px;color:#3d3d3d;">${escapeHtml(item.name)}</li>`)
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">
    <div style="background:#e8dff5;padding:34px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">Beautasy</p>
      <h1 style="margin:0;font-size:25px;font-weight:400;color:#2d2d2d;font-style:italic;">How does it feel, ${firstName}?</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#3d3d3d;line-height:1.7;margin-top:0;">
        Your pieces have been with you a couple of weeks now. Would you tell us how they wear?
        A sentence about the fit helps the next person choose their size — and it means a lot
        to a small atelier.
      </p>
      <ul style="padding-left:20px;margin:20px 0;">${pieces}</ul>
      <p style="text-align:center;margin:26px 0 0;">
        <a href="${SITE_URL}/review/${token}" style="display:inline-block;padding:13px 30px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Leave a review</a>
      </p>
      <p style="color:#777;font-size:13px;line-height:1.7;margin:24px 0 0;text-align:center;">
        No account needed — the link opens straight onto the form. Photos welcome.
      </p>
      <p style="color:#777;font-size:13px;line-height:1.7;margin:18px 0 0;text-align:center;">
        Happier writing it on Google? That one helps people in Southampton find us —
        <a href="${BUSINESS.googleReviewUrl}" style="color:#7a6d9a;">leave it here instead</a>.
      </p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">Not the right time? Just ignore this — we won't ask again.</p>
    </div>
  </div>
</body>
</html>`;
}


/**
 * Claim the order, ask for the review, and hand the claim back on a refusal.
 *
 * Its own function so a test can run the real pair rather than a copy. Both
 * fields go on together and both come off together, and the release is the
 * half worth watching: PENDING_QUERY selects on !defined(reviewRequestSentAt),
 * so a stamp left standing after a refusal meant that customer was never asked
 * again — and the stamp used to go on before the send, in the same try, with
 * no undo at all, so even a thrown error left it there. Written inline, an
 * empty release passed every test in the project.
 *
 * The fingerprint goes on first because an order that can accept a link nobody
 * received is recoverable, while an emailed link the order will not recognise
 * is dead. The token itself lives only in the email; the next run mints a
 * fresh one, and the one from a refused attempt reached nobody.
 */
export function claimReviewRequest(
  client: ClaimClient,
  order: { _id: string; _rev: string },
  token: string,
  send: () => Promise<unknown>
): Promise<ClaimOutcome> {
  return claimThenSend(
    client,
    order,
    {
      reviewTokenFingerprint: reviewTokenFingerprint(token),
      reviewRequestSentAt: new Date().toISOString(),
    },
    ["reviewTokenFingerprint", "reviewRequestSentAt"],
    send
  );
}

export async function runReviewRequests(): Promise<{ candidates: number; sent: number }> {
  if (!process.env.RESEND_API_KEY || !process.env.SANITY_API_WRITE_TOKEN) {
    return { candidates: 0, sent: 0 };
  }

  const cutoff = new Date(Date.now() - DAYS_BEFORE_ASKING * 24 * 60 * 60 * 1000).toISOString();
  const orders: PendingOrder[] = await sanityWriteClient.fetch(PENDING_QUERY, {
    cutoff,
    limit: MAX_PER_RUN,
  });

  let sent = 0;
  for (const order of orders) {
    if (!order.items?.some((item) => item.productId)) {
      await sanityWriteClient
        .patch(order._id)
        .set({ reviewRequestSentAt: new Date().toISOString() })
        .commit();
      continue;
    }

    const email = open(order.customerEmailSealed);
    if (!email) {
      console.error(`Order ${order._id} has no readable email — not asking for a review`);
      continue;
    }

    const token = generateReviewToken();
    // The fingerprint is stored first: an order that can accept a link nobody
    // received is recoverable, an emailed link the order will not recognise is
    // dead. The token itself lives only in the email.
    //
    // And it is taken back off when the mail service refuses the email, which
    // is what `claimThenSend` is for. PENDING_QUERY selects on
    // `!defined(reviewRequestSentAt)`, so a stamp left standing after a
    // refusal meant that customer was never asked for a review again — and the
    // stamp went on before the send, in the same try, with no undo at all, so
    // even a thrown error left it there. The next run mints a fresh token; the
    // one from the refused attempt reached nobody, so nothing is orphaned by
    // forgetting it.
    const outcome = await claimReviewRequest(sanityWriteClient, order, token, () =>
        sendEmail({
          from: FROM_EMAIL,
          to: email,
          replyTo: KRISTINA_EMAIL,
          subject: "How are your Beautasy pieces wearing? 💜",
          html: requestEmail(order, token),
        })
    );
    if (outcome === "sent") sent++;
  }

  return { candidates: orders.length, sent };
}
