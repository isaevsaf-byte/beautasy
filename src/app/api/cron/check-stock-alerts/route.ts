import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { sanityClient, sanityWriteClient } from "@/lib/sanity";
import { escapeHtml } from "@/lib/escapeHtml";

export const dynamic = "force-dynamic";

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  return new Resend(process.env.RESEND_API_KEY);
}

interface PendingAlert {
  _id: string;
  email: string;
  size?: string;
  product: {
    _id: string;
    name: string;
    slug: string;
    stock: number;
    sizeStock?: { size: string; quantity: number }[];
  } | null;
}

const PENDING_ALERTS_QUERY = `*[_type == "stockAlert" && notified == false] {
  _id,
  email,
  size,
  "product": product->{ _id, name, "slug": slug.current, stock, sizeStock }
}`;

function isBackInStock(alert: PendingAlert): boolean {
  if (!alert.product) return false;
  if (alert.size) {
    const entry = alert.product.sizeStock?.find((s) => s.size === alert.size);
    return (entry?.quantity ?? 0) > 0;
  }
  return alert.product.stock > 0;
}

/* ─── GET /api/cron/check-stock-alerts — notifies customers when a product they
   subscribed to is back in stock. Scheduled via Vercel Cron (see vercel.json). ─── */
export async function GET(req: NextRequest) {
  // Fail closed: without a secret this endpoint would be an open email trigger
  if (!process.env.CRON_SECRET) {
    console.error("CRON_SECRET is not set — refusing to run the stock alert job");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const alerts: PendingAlert[] = await sanityClient.fetch(PENDING_ALERTS_QUERY);
  const dueAlerts = alerts.filter(isBackInStock);

  let sent = 0;
  for (const alert of dueAlerts) {
    if (!alert.product) continue;
    try {
      await getResend().emails.send({
        from: FROM_EMAIL,
        to: alert.email,
        subject: `Back in stock: ${alert.product.name}${alert.size ? ` (${alert.size})` : ""} 💜`,
        html: `
          <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:32px;">
            <p style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">Beautasy</p>
            <h1 style="font-size:24px;font-weight:400;color:#2d2d2d;">Good news — it's back!</h1>
            <p style="color:#3d3d3d;line-height:1.7;">
              <strong>${escapeHtml(alert.product.name)}</strong>${alert.size ? ` in size <strong>${escapeHtml(alert.size)}</strong>` : ""} is back in stock. Handmade pieces sell out fast, so grab it before it's gone again.
            </p>
            <a href="https://beautasy.co.uk/shop/${alert.product.slug}" style="display:inline-block;margin-top:16px;padding:12px 28px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Shop Now</a>
          </div>`,
      });
      await sanityWriteClient.patch(alert._id).set({ notified: true }).commit();
      sent++;
    } catch (err) {
      console.error(`Failed to send stock alert for ${alert.email}:`, err);
    }
  }

  return NextResponse.json({ checked: alerts.length, sent });
}
