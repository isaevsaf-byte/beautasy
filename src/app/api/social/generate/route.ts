import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { isProjectMember } from "@/lib/studioMember";
import { draftPostsForNewProducts } from "@/lib/socialQueue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/social/generate — write draft posts for products nobody has
 * posted about yet.
 *
 *   { token }                         → from the Studio
 *   Authorization: Bearer CRON_SECRET → from a schedule, or Safar with curl
 *
 * Everything this creates is a draft inside the Studio that only Kristina can
 * approve, but drafting costs Anthropic tokens, so only someone who edits
 * this project gets to spend them. Being a page on this site used to be the
 * only check, and an Origin header is one line of curl — so the Studio's own
 * session token is asked about, as /api/studio/diary does (see
 * @/lib/studioMember).
 */
export async function POST(req: NextRequest) {
  const byMachine =
    !!process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

  if (!byMachine) {
    if (!fromThisSite(req)) {
      return NextResponse.json({ error: "Это может делать только Studio." }, { status: 403 });
    }

    const limited = rateLimit(`social-generate:${clientIp(req)}`, 10, 60 * 60 * 1000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Слишком много запросов — попробуйте через несколько минут." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
      );
    }

    const body = (await req.json().catch(() => ({}))) as { token?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token : "";
    if (!(await isProjectMember(token))) {
      return NextResponse.json(
        { error: "Не удалось проверить вашу сессию Studio. Выйдите из Studio, войдите снова и попробуйте ещё раз." },
        { status: 401 }
      );
    }
  }

  const result = await draftPostsForNewProducts(3);
  return NextResponse.json(result);
}
