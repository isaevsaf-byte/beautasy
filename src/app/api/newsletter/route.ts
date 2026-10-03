import { NextRequest, NextResponse } from "next/server";
import { sanityClient, sanityWriteClient } from "@/lib/sanity";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { createWelcomeCode } from "@/lib/discounts";
import { unsubscribeUrl, welcomeEmailHtml } from "@/lib/newsletter";
import { emailFingerprint, maskEmail, sealOptional } from "@/lib/pii";
import { secretsConfigured } from "@/lib/secrets";
import { sendEmail } from "@/lib/sendEmail";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

/* ─── POST /api/newsletter — subscribe and send the welcome code ─── */
export async function POST(req: NextRequest) {
  const limited = rateLimit(`newsletter:${clientIp(req)}`, 5, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many signups from here. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  try {
    const { email, source, company } = await req.json();

    // Honeypot: a hidden field only a bot fills in. Pretend everything is fine.
    if (typeof company === "string" && company.trim() !== "") {
      return NextResponse.json({ subscribed: true }, { status: 201 });
    }

    if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 });
    }
    const normalised = email.trim().toLowerCase();

    if (!process.env.SANITY_API_WRITE_TOKEN || !secretsConfigured()) {
      console.error("SANITY_API_WRITE_TOKEN or DATA_SECRET is not configured");
      return NextResponse.json(
        { error: "Sign-ups are temporarily unavailable" },
        { status: 503 }
      );
    }

    // Matched on a fingerprint: the address itself is not in the document
    const existing = await sanityClient.fetch<string | null>(
      `*[_type == "subscriber" && emailFingerprint == $fingerprint][0]._id`,
      { fingerprint: emailFingerprint(normalised) }
    );
    if (existing) {
      // Don't resend the code, and don't reveal that the address is on the list
      return NextResponse.json({ subscribed: true, alreadySubscribed: true });
    }

    const code = await createWelcomeCode(normalised);

    const subscriber = await sanityWriteClient.create({
      _type: "subscriber",
      emailHint: maskEmail(normalised),
      emailFingerprint: emailFingerprint(normalised),
      emailSealed: sealOptional(normalised),
      source: source === "checkout" ? "checkout" : "footer",
      ...(code ? { welcomeCodeSealed: sealOptional(code) } : {}),
      unsubscribed: false,
      createdAt: new Date().toISOString(),
    });

    if (process.env.RESEND_API_KEY) {
      try {
        await sendEmail({
          from: FROM_EMAIL,
          to: normalised,
          replyTo: KRISTINA_EMAIL,
          subject: code
            ? "Welcome to Beautasy — here's 10% off 💜"
            : "Welcome to Beautasy 💜",
          // Every email to a subscriber carries their own way out
          html: welcomeEmailHtml(code, unsubscribeUrl(subscriber._id)),
        });
      } catch (err) {
        // Subscriber is saved; the email can be resent by hand — and now the
        // log says why it has to be. Asking again does not help: the second
        // request matches on emailFingerprint and answers alreadySubscribed
        // without sending anything, so the discount code sits sealed on the
        // subscriber document until somebody goes and gets it. Nothing here
        // marks the welcome as sent, so there is no stamp to take back;
        // whether it went out is now only knowable from this line.
        console.error("Failed to send welcome email:", err);
      }
    }

    // The code is not in the answer. It is emailed, and that is the point: an
    // answer with the code in it made a 10% code for every address anybody
    // cared to type, read straight off the response without owning the inbox.
    return NextResponse.json({ subscribed: true }, { status: 201 });
  } catch (error) {
    console.error("Newsletter signup failed:", error);
    return NextResponse.json({ error: "Could not sign you up" }, { status: 500 });
  }
}
