import { NextRequest, NextResponse } from "next/server";
import { runReviewRequests } from "@/lib/reviewRequests";

export const dynamic = "force-dynamic";

/* ─── GET /api/cron/review-requests — kept so the job can be run by hand;
   the scheduled run happens inside /api/cron/daily. ─── */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("CRON_SECRET is not set — refusing to run the review request job");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await runReviewRequests());
}
