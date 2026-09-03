import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { draftPostsForNewProducts } from "@/lib/socialQueue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/social/generate — write draft posts for products nobody has
 * posted about yet.
 *
 * No secret, for the same reason /api/notify has none: everything this creates
 * is a draft inside the Studio that only Kristina can approve. The worst an
 * outsider can do is give her a few more suggestions to read.
 */
export async function POST(req: NextRequest) {
  // Drafting costs Anthropic tokens; only the Studio gets to spend them
  if (!fromThisSite(req)) {
    return NextResponse.json({ error: "Only the Studio can call this" }, { status: 403 });
  }

  const limited = rateLimit(`social-generate:${clientIp(req)}`, 10, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const result = await draftPostsForNewProducts(3);
  return NextResponse.json(result);
}
