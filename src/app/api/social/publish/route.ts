import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { isProjectMember } from "@/lib/studioMember";
import { publishDuePosts, publishPostById } from "@/lib/socialQueue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/social/publish — send out approved posts.
 *
 * Two ways in:
 *   { id, token } — the "Post this now" button in the Studio, for one document
 *   {}            — everything approved and due, called by the schedule
 *
 * This one puts words in public, so it only ever touches a document Kristina
 * has already moved to Approved. Without the schedule's secret the caller has
 * to be someone who edits this project: the Studio sends its own session
 * token and Sanity is asked who it belongs to, as /api/studio/diary does (see
 * @/lib/studioMember). Being a page on this site used to be the only check,
 * and an Origin header is one line of curl.
 *
 * The scheduled caller sends CRON_SECRET and gets a larger batch. That caller
 * is the Cloudflare Worker every fifteen minutes, with the GitHub workflow as
 * a spare. The daily Vercel cron used to call this too and no longer does: it
 * runs in the same request as the watchdog that reads the publisher's
 * heartbeat, so whichever of the two went first decided whether a dead
 * schedule was noticed at all.
 *
 * The errors below the secret are the Studio button's, so they are Russian;
 * the schedule never meets them.
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
      return NextResponse.json({ error: "Это может делать только Studio." }, { status: 403 });
    }
    const limited = rateLimit(`social-publish:${clientIp(req)}`, 10, 60 * 60 * 1000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Слишком много запросов — попробуйте через несколько минут." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
      );
    }
    // …and someone who edits this project, not merely a page claiming to be on this site
    const token = typeof body?.token === "string" ? body.token : "";
    if (!(await isProjectMember(token))) {
      return NextResponse.json(
        { error: "Не удалось проверить вашу сессию Studio. Выйдите из Studio, войдите снова и попробуйте ещё раз." },
        { status: 401 }
      );
    }
  }

  const result = id ? await publishPostById(id) : await publishDuePosts(authorised ? 5 : 1);
  return NextResponse.json(result);
}
