import { NextRequest, NextResponse } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { signatureMatches, unsubscribePageHtml } from "@/lib/newsletter";

export const dynamic = "force-dynamic";

/**
 * The newsletter's way out: /api/newsletter/unsubscribe?id=<subscriber>&sig=<signature>
 *
 * Opening the link only asks; the button on that page (a POST) is what
 * unsubscribes. Mail scanners — Outlook's Safe Links, work filters — open
 * every link in an email to check it, and a link that unsubscribed on GET
 * would quietly take people off the list who never asked. A POST is also what
 * a mail app sends for one-click unsubscribe, and the welcome email's
 * List-Unsubscribe header names this same address (see unsubscribeHeaders).
 *
 * The signature is the whole of the check (see @/lib/newsletter): without it
 * an id alone does nothing.
 */

function page(html: string, status = 200): NextResponse {
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}

function limited(req: NextRequest): boolean {
  return !rateLimit(`newsletter-unsubscribe:${clientIp(req)}`, 30, 60 * 60 * 1000).ok;
}

export async function GET(req: NextRequest) {
  if (limited(req)) return page(unsubscribePageHtml("invalid"), 429);
  const id = req.nextUrl.searchParams.get("id");
  const sig = req.nextUrl.searchParams.get("sig");
  if (!signatureMatches(id, sig)) return page(unsubscribePageHtml("invalid"), 400);

  const action = `/api/newsletter/unsubscribe?id=${encodeURIComponent(id as string)}&sig=${encodeURIComponent(sig as string)}`;
  return page(unsubscribePageHtml("confirm", action));
}

export async function POST(req: NextRequest) {
  if (limited(req)) return page(unsubscribePageHtml("invalid"), 429);
  const id = req.nextUrl.searchParams.get("id");
  const sig = req.nextUrl.searchParams.get("sig");
  if (!signatureMatches(id, sig)) return page(unsubscribePageHtml("invalid"), 400);

  try {
    // Only a subscriber document is ever touched, whatever id was signed
    const subscriber = await sanityWriteClient.fetch<string | null>(
      `*[_type == "subscriber" && _id == $id][0]._id`,
      { id }
    );
    if (subscriber) {
      await sanityWriteClient.patch(subscriber).set({ unsubscribed: true }).commit();
    }
    // Gone already, or never there: either way they are not on the list
    return page(unsubscribePageHtml("done"));
  } catch (err) {
    console.error("Could not unsubscribe a subscriber:", err);
    return page(unsubscribePageHtml("error"), 500);
  }
}
