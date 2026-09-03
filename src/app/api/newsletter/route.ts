import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { sanityClient, sanityWriteClient } from "@/lib/sanity";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { escapeHtml } from "@/lib/escapeHtml";
import { createWelcomeCode, WELCOME_VALID_DAYS } from "@/lib/discounts";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  return new Resend(process.env.RESEND_API_KEY);
}

function welcomeEmail(code: string | null): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">
    <div style="background:#e8dff5;padding:36px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">Beautasy</p>
      <h1 style="margin:0;font-size:26px;font-weight:400;color:#2d2d2d;font-style:italic;">Welcome 💜</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#3d3d3d;line-height:1.7;margin-top:0;">
        Thank you for joining us. Everything we make is sewn by hand in our Southampton
        atelier — you'll hear from us when a new collection is ready, and not much else.
      </p>
      ${
        code
          ? `<div style="background:#f7f3ff;border-radius:12px;padding:22px;text-align:center;margin:26px 0;">
               <p style="margin:0 0 8px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;">10% off your first order</p>
               <p style="margin:0;font-size:26px;letter-spacing:4px;color:#2d2d2d;font-family:Georgia,serif;">${escapeHtml(code)}</p>
               <p style="margin:10px 0 0;font-size:12px;color:#777;">Enter it at checkout — yours alone, valid for ${WELCOME_VALID_DAYS} days</p>
             </div>`
          : ""
      }
      <p style="text-align:center;margin:28px 0 0;">
        <a href="${SITE_URL}/shop" style="display:inline-block;padding:13px 30px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Browse the shop</a>
      </p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">
        Made with 💜 in Southampton · to unsubscribe, reply to this email
      </p>
    </div>
  </div>
</body>
</html>`;
}

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

    if (!process.env.SANITY_API_WRITE_TOKEN) {
      console.error("SANITY_API_WRITE_TOKEN is not configured");
      return NextResponse.json(
        { error: "Sign-ups are temporarily unavailable" },
        { status: 503 }
      );
    }

    const existing = await sanityClient.fetch<string | null>(
      `*[_type == "subscriber" && email == $email][0]._id`,
      { email: normalised }
    );
    if (existing) {
      // Don't resend the code, and don't reveal that the address is on the list
      return NextResponse.json({ subscribed: true, alreadySubscribed: true });
    }

    const code = await createWelcomeCode(normalised);

    await sanityWriteClient.create({
      _type: "subscriber",
      email: normalised,
      source: source === "checkout" ? "checkout" : "footer",
      ...(code ? { welcomeCode: code } : {}),
      unsubscribed: false,
      createdAt: new Date().toISOString(),
    });

    if (process.env.RESEND_API_KEY) {
      try {
        await getResend().emails.send({
          from: FROM_EMAIL,
          to: normalised,
          replyTo: KRISTINA_EMAIL,
          subject: code
            ? "Welcome to Beautasy — here's 10% off 💜"
            : "Welcome to Beautasy 💜",
          html: welcomeEmail(code),
        });
      } catch (err) {
        // Subscriber is saved; the email can be resent by hand
        console.error("Failed to send welcome email:", err);
      }
    }

    return NextResponse.json({ subscribed: true, code }, { status: 201 });
  } catch (error) {
    console.error("Newsletter signup failed:", error);
    return NextResponse.json({ error: "Could not sign you up" }, { status: 500 });
  }
}
