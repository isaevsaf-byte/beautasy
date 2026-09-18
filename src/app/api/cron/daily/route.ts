import { NextRequest, NextResponse } from "next/server";
import { runStockAlerts } from "@/lib/stockAlerts";
import { runReviewRequests } from "@/lib/reviewRequests";
import { sendPendingStatusEmails } from "@/lib/orderStatusEmails";
import { deliverScheduledGiftCards } from "@/lib/giftCardEmails";
import { sendPendingBookingEmails } from "@/lib/bookingEmails";
import { draftPostsForNewProducts } from "@/lib/socialQueue";
import { runHealthWatchdog } from "@/lib/siteHealth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/daily — every scheduled email job, in one request.
 *
 * Vercel's Hobby plan allows only a couple of cron entries, and we now have
 * three jobs, so they share a single schedule. Each one is independent: a
 * failure in one is logged and the rest still run.
 *
 * The counters below go nowhere but this response, which nobody reads. That
 * is why one of the jobs is the watchman: it is the only one that speaks up on
 * its own, and only when something is wrong.
 *
 * All seven start together, so the order of the list below is only the order
 * the results are read back in. Nothing here waits for anything else, and no
 * job may assume it runs before or after another. That rule is why sending
 * approved posts is no longer one of them: the watchman's answer depended on
 * a record the publisher writes, so a publisher running in this same request
 * was writing the measurement the watchman was reading. See the note above
 * `draftPostsForNewProducts` below.
 *
 * What is not tested here, said plainly rather than left to be discovered.
 * There is no behavioural test of this handler: standing in for seven job
 * modules needs module mocking, which this project's test command does not
 * turn on. What the tests do instead is read this file's own source, so they
 * hold the shape — the watchman is called, it is called once, and it is called
 * inside `allSettled` — and they cannot see what the handler does when it
 * runs. Two mistakes would therefore pass: the destructuring below is
 * positional, so swapping two entries of either list silently mislabels the
 * counters in the answer, and a job left in `allSettled` but also awaited
 * elsewhere would run twice. Both are read from here by eye. Anything worth a
 * real test belongs in the job's own module, where it can have one.
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
    deliverScheduledGiftCards(),
    sendPendingBookingEmails(),
    // Drafting only writes suggestions into the Studio. Sending them is not
    // here, and the reason is the line below: the publisher writes down every
    // run of itself, and the watchman reads that record to say whether the
    // fifteen-minute schedule is still knocking. Calling the publisher from
    // this request made the watchman's own request stamp the record it was
    // about to read, and the two sat in the same `allSettled` with no order
    // between them. Measured on one world, forty-five mornings, the Cloudflare
    // schedule removed on the third: with nobody but the schedule writing the
    // record, the fourth morning says so and twenty-one emails follow. With
    // this request writing it first, forty-five green mornings and no email at
    // all, the whole time with nothing being published. Which of those two
    // happened was decided by whichever promise settled first. Nothing is lost
    // by dropping the call: the Worker knocks every fifteen minutes and the
    // GitHub workflow is still there as a spare, so the nine o'clock knock this
    // used to add was one of ninety-six a day. What is gained is that `at` in
    // that record now means one thing only — the alarm clock went off — and it
    // can be read in any order by anything.
    draftPostsForNewProducts(3),
    // On its own terms. It reports on the state of the shop as the morning
    // starts rather than on what these jobs just did — they run alongside it,
    // not before it — and `allSettled` means a watchman that trips over its
    // own feet cannot stop an order email going out. It also caps the waits it
    // can be made to take, because `allSettled` guards against a job throwing,
    // not against one eating the whole sixty seconds: everything it reads from
    // outside costs at most eighteen of them together, and the one email it
    // may send another five, with the arithmetic written out over the timeouts
    // in siteHealth.ts. Two waits are left uncapped on purpose — the writes
    // that claim this morning and hand it back — because a write we stopped
    // waiting for can still land, and a watchman guessing whether it already
    // claimed the morning sends duplicate emails. That is the trade: a Sanity
    // write that hangs can still spend this request's minute.
    runHealthWatchdog(),
  ]);

  const [
    statusEmails,
    stockAlerts,
    reviewRequests,
    giftCards,
    bookings,
    socialDrafts,
    health,
  ] = results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) }));

  for (const result of results) {
    if (result.status === "rejected") console.error("Daily job failed:", result.reason);
  }

  return NextResponse.json({
    statusEmails,
    stockAlerts,
    reviewRequests,
    giftCards,
    bookings,
    socialDrafts,
    health,
  });
}
