import { NextRequest, NextResponse } from "next/server";
import { runSupplyWatch } from "@/lib/supplyRun";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/supplies — Monday's look at «Где брать мини-опт»: re-read the
 * prices the site may read and tell Kristina what got cheaper; once a month,
 * the whole list. See @/lib/supplyRun.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("CRON_SECRET is not set — refusing to run the supplies watch");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SANITY_API_WRITE_TOKEN) {
    return NextResponse.json({ error: "Sanity write token is not set" }, { status: 500 });
  }
  const result = await runSupplyWatch();
  console.log("Supplies watch:", JSON.stringify(result));
  return NextResponse.json(result);
}
