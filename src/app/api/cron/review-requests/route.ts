import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { sanityClient, sanityWriteClient } from "@/lib/sanity";
import { escapeHtml } from "@/lib/escapeHtml";
import { generateReviewToken } from "@/lib/reviewToken";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

/** Wait this long after the order before asking — production plus delivery. */
const DAYS_BEFORE_ASKING = 14;
/** Cap per run so one cron invocation can't hit the function timeout. */
const MAX_PER_RUN = 25;

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  return new Resend(process.env.RESEND_API_KEY);
}

interface PendingOrder {
  _id: string;
  customerEmail: string;
  customerName?: string;
  items: { productId?: string; name: string }[];
}

const PENDING_QUERY = `*[
  _type == "order"
  && defined(customerEmail)
  && !defined(reviewRequestSentAt)
  && createdAt < $cutoff
  && status in ["paid", "in-production", "shipped", "delivered"]
] | order(createdAt asc) [0...$limit] {
  _id, customerEmail, customerName, "items": items[]{ productId, name }
}`;

function requestEmail(order: PendingOrder, token: string): string {
  const firstName = escapeHtml(order.customerName?.split(" ")[0] ?? "there");
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
    </div>
    <div style="padding:20px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">Not the right time? Just ignore this — we won't ask again.</p>
    </div>
  </div>
</body>
</html>`;
}

/* ─── GET /api/cron/review-requests — asks recent customers for a review ─── */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("CRON_SECRET is not set — refusing to run the review request job");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY || !process.env.SANITY_API_WRITE_TOKEN) {
    return NextResponse.json({ error: "Email or Sanity is not configured" }, { status: 500 });
  }

  const cutoff = new Date(Date.now() - DAYS_BEFORE_ASKING * 24 * 60 * 60 * 1000).toISOString();
  const orders: PendingOrder[] = await sanityClient.fetch(PENDING_QUERY, {
    cutoff,
    limit: MAX_PER_RUN,
  });

  let sent = 0;
  for (const order of orders) {
    // Nothing to review if no line carried a product id
    if (!order.items?.some((item) => item.productId)) {
      await sanityWriteClient
        .patch(order._id)
        .set({ reviewRequestSentAt: new Date().toISOString() })
        .commit();
      continue;
    }

    const token = generateReviewToken();
    try {
      // Store the token first: a saved token with no email is recoverable,
      // an email whose token was never saved is a dead link.
      await sanityWriteClient
        .patch(order._id)
        .set({ reviewToken: token, reviewRequestSentAt: new Date().toISOString() })
        .commit();

      await getResend().emails.send({
        from: FROM_EMAIL,
        to: order.customerEmail,
        replyTo: KRISTINA_EMAIL,
        subject: "How are your Beautasy pieces wearing? 💜",
        html: requestEmail(order, token),
      });
      sent++;
    } catch (err) {
      console.error(`Failed to send review request for order ${order._id}:`, err);
    }
  }

  return NextResponse.json({ candidates: orders.length, sent });
}
