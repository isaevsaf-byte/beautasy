import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { isProjectMember } from "@/lib/studioMember";
import { sendPendingStatusEmails } from "@/lib/orderStatusEmails";
import { sendPendingBookingEmails } from "@/lib/bookingEmails";
import { settleReferredBookings } from "@/lib/referralSettle";

export const dynamic = "force-dynamic";

/**
 * POST /api/notify — sends the update emails that are already due.
 *
 *   { token } → the emails due now, and the recommendations now settled
 *
 * Kristina confirms a booking or marks an order as shipped in the Studio and
 * expects the customer to hear about it now, not when the nightly job runs.
 * A Sanity webhook would do this, but creating one needs project-admin rights
 * the Studio token doesn't have — so the Studio calls this instead, from a
 * button on the document.
 *
 * Guarded the way /api/studio/diary is: the Studio's own session token, spent
 * on asking Sanity whether the caller is a person who edits this project (see
 * @/lib/studioMember). Being a page on this site used to be the only check,
 * and an Origin header is one line of curl. It sends only the emails the daily
 * job would send anyway, only to the addresses stored on those documents, and
 * only once — the claim in @/lib/claim is what stops a repeat even when two
 * callers overlap.
 *
 * Every `error` is shown to Kristina in the Studio as it is, so it is Russian.
 */
export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) {
    return NextResponse.json({ error: "Это может делать только Studio." }, { status: 403 });
  }

  const limited = rateLimit(`notify:${clientIp(req)}`, 30, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов — попробуйте через несколько минут." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  // A Studio tab opened before 3 October 2026 still runs the old button, which
  // posts with no body at all, reads any JSON answer as a list of what was
  // sent, and so would tell Kristina "nothing to send, the customer already
  // knows" when nothing was sent. Plain text instead: the old button cannot
  // read it as JSON and falls back to its honest "could not reach the site,
  // the email goes tonight", which is true. Reloading the Studio fixes it.
  const raw = await req.text().catch(() => "");
  if (!raw.trim()) {
    return new NextResponse("Обновите страницу Studio и нажмите кнопку ещё раз.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  let body: { token?: unknown } | null = null;
  try {
    body = JSON.parse(raw) as { token?: unknown } | null;
  } catch {
    // Not JSON: no token, so the answer below
  }
  const token = typeof body?.token === "string" ? body.token : "";
  if (!(await isProjectMember(token))) {
    return NextResponse.json(
      { error: "Не удалось проверить вашу сессию Studio. Выйдите из Studio, войдите снова и попробуйте ещё раз." },
      { status: 401 }
    );
  }

  const [orders, bookings] = await Promise.all([
    sendPendingStatusEmails(10),
    sendPendingBookingEmails(10),
  ]);
  // After the emails, so a client with an email hears "thank you" before the
  // friend or salon who sent her hears about the credit. Never fails the button.
  const referrals = await settleReferredBookings(10).catch((error) => {
    console.error("Could not settle recommendations:", error);
    return { checked: 0, settled: 0 };
  });

  return NextResponse.json({ orders, bookings, referrals });
}
