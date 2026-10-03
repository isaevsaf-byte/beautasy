import { NextRequest, NextResponse } from "next/server";
import { checkConnection } from "@/lib/instagram";
import { checkPinterest } from "@/lib/pinterest";
import { fromThisSite } from "@/lib/sameOrigin";
import { isProjectMember } from "@/lib/studioMember";

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
 * Guarded because the reply names the account. Two ways in, both in the
 * Authorization header, because a GET has no body and a token in the address
 * is a token in every log on the way:
 *   Bearer CRON_SECRET          → a schedule, or Safar with curl
 *   Bearer <Studio session>     → someone who edits this project, asked of
 *                                 Sanity as /api/studio/diary does (see
 *                                 @/lib/studioMember)
 * Being a page on this site used to be enough, and an Origin header is one
 * line of curl.
 */
export async function GET(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  const byMachine = !!process.env.CRON_SECRET && bearer === process.env.CRON_SECRET;
  const byStudio = !byMachine && fromThisSite(req) && (await isProjectMember(bearer));

  if (!byMachine && !byStudio) {
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
