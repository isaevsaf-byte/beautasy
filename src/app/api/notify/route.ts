import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { sendPendingStatusEmails } from "@/lib/orderStatusEmails";
import { sendPendingBookingEmails } from "@/lib/bookingEmails";

export const dynamic = "force-dynamic";

/**
 * POST /api/notify — sends the update emails that are already due.
 *
 * Kristina confirms a booking or marks an order as shipped in the Studio and
 * expects the customer to hear about it now, not when the nightly job runs.
 * A Sanity webhook would do this, but creating one needs project-admin rights
 * the Studio token doesn't have — so the Studio calls this instead, from a
 * button on the document.
 *
 * No secret, deliberately, because there is nothing here worth stealing: it
 * sends only the emails the daily job would send anyway, only to the addresses
 * stored on those documents, and only once — `notifiedStatus` is what stops a
 * repeat. The worst an outsider can do is make a due email arrive sooner.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(`notify:${clientIp(req)}`, 30, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const [orders, bookings] = await Promise.all([
    sendPendingStatusEmails(10),
    sendPendingBookingEmails(10),
  ]);

  return NextResponse.json({ orders, bookings });
}
