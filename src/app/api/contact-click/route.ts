import { NextRequest, NextResponse } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { localDateOf } from "@/lib/slots";
import { contactClickFrom, contactClickMutations } from "@/lib/contactClicks";

export const dynamic = "force-dynamic";

/**
 * POST /api/contact-click — one tap on WhatsApp or the phone number, counted.
 *
 *   { method: "whatsapp" | "phone", page: "atelier" | "home" | … }
 *
 * Sent by the page with navigator.sendBeacon as the visitor leaves for
 * WhatsApp or the dialler (see SiteAnalytics), so nobody waits for it and
 * its answer is never read: 204 whether it counted or not, unless the request
 * itself is wrong. What is kept is a day's tally and nothing about who tapped
 * — see @/lib/contactClicks.
 *
 * Guarded only as far as a tally needs: a page on this site, a body of exactly
 * the expected shape, and thirty taps an hour from one address, which is more
 * than any person and fewer than a script would like.
 */

/** A real body is about forty characters; anything long is not from the page. */
const MAX_BODY = 200;

const nothing = (status: number) => new NextResponse(null, { status });

export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) return nothing(403);

  const limited = rateLimit(`contact-click:${clientIp(req)}`, 30, 60 * 60 * 1000);
  if (!limited.ok) return nothing(429);

  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY) return nothing(400);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return nothing(400);
  }
  const click = contactClickFrom(body);
  if (!click) return nothing(400);

  if (!process.env.SANITY_API_WRITE_TOKEN) return nothing(204);

  try {
    await sanityWriteClient.mutate(contactClickMutations(localDateOf(new Date()), click));
  } catch (error) {
    // A lost tap is a number one short on the Dashboard, not something to tell the visitor
    console.error("Could not count a contact tap:", error instanceof Error ? error.message : error);
  }
  return nothing(204);
}
