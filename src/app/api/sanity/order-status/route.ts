import { NextRequest, NextResponse } from "next/server";
import { sendPendingStatusEmails } from "@/lib/orderStatusEmails";
import { sendPendingBookingEmails } from "@/lib/bookingEmails";

export const dynamic = "force-dynamic";

/**
 * POST /api/sanity/order-status — called by a Sanity webhook when an order
 * document changes, so moving an order to "shipped" in the Studio emails the
 * customer within seconds rather than waiting for the nightly cron.
 *
 * Optional: the daily job covers the same ground, this just makes it immediate.
 * Set up in sanity.io/manage → API → Webhooks, filtered to `_type == "order"`,
 * with CRON_SECRET as a Bearer token.
 */
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The payload isn't trusted for anything — it's only a nudge to go and look
  // at which orders are due an email, which the query decides.
  const [orders, bookings] = await Promise.all([
    sendPendingStatusEmails(10),
    sendPendingBookingEmails(10),
  ]);
  return NextResponse.json({ orders, bookings });
}
