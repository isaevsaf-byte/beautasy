import { NextRequest, NextResponse } from "next/server";
import { checkConnection } from "@/lib/instagram";
import { checkPinterest } from "@/lib/pinterest";
import { fromThisSite } from "@/lib/sameOrigin";

export const dynamic = "force-dynamic";

/**
 * GET /api/social/status — is Instagram actually connected, and to what.
 *
 * Publishing fails silently in every interesting way: the wrong id, a token
 * for the wrong account, a missing permission, a token that expired two
 * months after it was made. All of them look the same from here — posts stop
 * going out and nothing says why. This answers with the account's username,
 * so setting the credentials up can be confirmed rather than assumed. It
 * publishes nothing.
 *
 * Guarded because the reply names the account: either the Studio, or a caller
 * with CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const authorised =
    !!process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

  if (!authorised && !fromThisSite(req)) {
    return NextResponse.json({ error: "Not for you" }, { status: 403 });
  }

  const [instagram, pinterest] = await Promise.all([checkConnection(), checkPinterest()]);

  // Instagram decides the status code. Pinterest is the second channel: not
  // having it is a shop that posts less, not a shop that is broken.
  return NextResponse.json(
    { ...instagram, pinterest },
    {
      status: instagram.configured && !instagram.error ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
