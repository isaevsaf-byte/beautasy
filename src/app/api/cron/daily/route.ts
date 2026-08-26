import { NextRequest, NextResponse } from "next/server";
import { runStockAlerts } from "@/lib/stockAlerts";
import { runReviewRequests } from "@/lib/reviewRequests";
import { sendPendingStatusEmails } from "@/lib/orderStatusEmails";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/daily — every scheduled email job, in one request.
 *
 * Vercel's Hobby plan allows only a couple of cron entries, and we now have
 * three jobs, so they share a single schedule. Each one is independent: a
 * failure in one is logged and the rest still run.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("CRON_SECRET is not set — refusing to run the daily jobs");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await Promise.allSettled([
    sendPendingStatusEmails(),
    runStockAlerts(),
    runReviewRequests(),
  ]);

  const [statusEmails, stockAlerts, reviewRequests] = results.map((r) =>
    r.status === "fulfilled" ? r.value : { error: String(r.reason) }
  );

  for (const result of results) {
    if (result.status === "rejected") console.error("Daily job failed:", result.reason);
  }

  return NextResponse.json({ statusEmails, stockAlerts, reviewRequests });
}
