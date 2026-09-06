import { NextRequest, NextResponse } from "next/server";
import { sanityWriteClient, sanityConfig } from "@/lib/sanity";
import { open } from "@/lib/pii";
import { revealCode } from "@/lib/giftCards";
import { revealReferralCode } from "@/lib/referrals";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio/reveal — the contact details behind a sealed document.
 *
 * Customer details are sealed in Sanity because the dataset is readable by
 * anyone (see @/lib/pii), which means the Studio cannot show them: only the
 * server has the key. This is the one door back, and it opens for members of
 * this Sanity project and nobody else.
 *
 * Proving membership: the caller sends the session token their Studio is
 * already using, and it is spent immediately on one request to Sanity's
 * management API, which answers 200 only for a member of this project. The
 * token is never stored, never logged, and never used for anything else. It is
 * the same check Sanity itself makes when Kristina opens the Studio.
 */

const MANAGEMENT_API = "https://api.sanity.io/v2021-06-07/projects";

/** Which sealed fields each document type has, and what to call them. */
const SEALED_FIELDS: Record<string, { field: string; label: string }[]> = {
  atelierBooking: [
    { field: "nameSealed", label: "Name" },
    { field: "emailSealed", label: "Email" },
    { field: "phoneSealed", label: "Phone" },
    { field: "notesSealed", label: "Notes" },
  ],
  order: [
    { field: "customerNameSealed", label: "Name" },
    { field: "customerEmailSealed", label: "Email" },
    { field: "shippingAddressSealed", label: "Delivery address" },
  ],
  giftCard: [
    { field: "recipientNameSealed", label: "Recipient name" },
    { field: "recipientEmailSealed", label: "Recipient email" },
    { field: "messageSealed", label: "Gift message" },
    { field: "purchaserEmailSealed", label: "Bought by" },
  ],
  subscriber: [{ field: "emailSealed", label: "Email" }],
  stockAlert: [{ field: "emailSealed", label: "Email" }],
  abandonedCart: [{ field: "emailSealed", label: "Email" }],
  referrer: [{ field: "emailSealed", label: "Email" }],
};

async function isProjectMember(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${MANAGEMENT_API}/${sanityConfig.projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) {
    return NextResponse.json({ error: "Only the Studio can call this" }, { status: 403 });
  }

  const limited = rateLimit(`studio-reveal:${clientIp(req)}`, 120, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : null;
  const token = typeof body?.token === "string" ? body.token : null;

  if (!id || !token) {
    return NextResponse.json(
      { error: "Sign in to the Studio and try again." },
      { status: 400 }
    );
  }

  if (!(await isProjectMember(token))) {
    return NextResponse.json(
      { error: "That Studio session is not a member of this project." },
      { status: 403 }
    );
  }

  // Drafts carry a prefix; either version of the document will do
  const doc = await sanityWriteClient.fetch<Record<string, unknown> | null>(
    `*[_id == $id || _id == "drafts." + $id][0]`,
    { id: id.replace(/^drafts\./, "") }
  );

  if (!doc) {
    return NextResponse.json({ error: "That document no longer exists." }, { status: 404 });
  }

  const shape = SEALED_FIELDS[String(doc._type)];
  if (!shape) {
    return NextResponse.json({ error: "Nothing is sealed on this document." }, { status: 400 });
  }

  const fields = shape
    .map(({ field, label }) => ({ label, value: open(doc[field] as string | undefined) }))
    .filter((f): f is { label: string; value: string } => !!f.value);

  // A gift card's code is sealed the same way, and this is the only place it
  // can be read back — worth having when a recipient says it never arrived.
  if (doc._type === "giftCard") {
    const code = revealCode(doc as { codeSealed?: string });
    if (code) fields.unshift({ label: "Code", value: code });
  }

  // A Friends link code is sealed the same way — for when someone asks
  // Kristina "what was my link again?"
  if (doc._type === "referrer") {
    const code = revealReferralCode(doc as { codeSealed?: string });
    if (code) fields.unshift({ label: "Link code", value: code });
  }

  if (fields.length === 0) {
    return NextResponse.json(
      { error: "Nothing readable here — this document predates sealing, or DATA_SECRET has changed." },
      { status: 404 }
    );
  }

  return NextResponse.json({ fields });
}
