import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { publishDuePosts, publishPostById } from "@/lib/socialQueue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/social/publish — send out approved posts.
 *
 * Two ways in:
 *   { id }  — the "Post this now" button in the Studio, for one document
 *   {}      — everything approved and due, called by the schedule
 *
 * This one puts words in public, so it only ever touches a document Kristina
 * has already moved to Approved. Without that it does nothing, which is what
 * keeps the open endpoint harmless: the most an outsider can do is make an
 * already-approved post go out earlier than its date.
 *
 * The scheduled caller (Vercel cron, or GitHub Actions) sends CRON_SECRET and
 * gets a larger batch; that is the only privileged difference.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : null;

  const authorised =
    !!process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

  if (!authorised) {
    // Without the secret the caller has to be the Studio itself
    if (!fromThisSite(req)) {
      return NextResponse.json({ error: "Only the Studio can call this" }, { status: 403 });
    }
    const limited = rateLimit(`social-publish:${clientIp(req)}`, 10, 60 * 60 * 1000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
      );
    }
  }

  const result = id ? await publishPostById(id) : await publishDuePosts(authorised ? 5 : 1);
  return NextResponse.json(result);
}
