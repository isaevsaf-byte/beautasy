import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
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
 * No secret, because the Studio has nowhere safe to keep one; instead the
 * caller has to be a page on this site, which the Studio is. It sends only
 * the emails the daily job would send anyway, only to the addresses stored on
 * those documents, and only once — the claim in @/lib/claim is what stops a
 * repeat even when two callers overlap.
 */
export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) {
    return NextResponse.json({ error: "Only the Studio can call this" }, { status: 403 });
  }

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
