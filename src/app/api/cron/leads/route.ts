import { NextRequest, NextResponse } from "next/server";
import { runLeadSearch } from "@/lib/leadRun";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/leads — the morning search for people looking for a maker
 * Kristina could be. Its own schedule rather than a fourteenth job in
 * /api/cron/daily: it waits on half a dozen outside sites, and those waits
 * must not eat the minute the order and booking emails share.
 * See @/lib/leadRun.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("CRON_SECRET is not set — refusing to run the lead search");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SANITY_API_WRITE_TOKEN) {
    return NextResponse.json({ error: "Sanity write token is not set" }, { status: 500 });
  }
  const result = await runLeadSearch();
  // One line a morning in Vercel's logs: what was read, kept, new, and told
  console.log("Lead search:", JSON.stringify(result));
  return NextResponse.json(result);
}
