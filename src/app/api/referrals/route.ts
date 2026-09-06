import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import {
  ensureReferrer,
  findReferrerByCode,
  referralSettings,
  referralsConfigured,
  sendReferralLinkEmail,
} from "@/lib/referrals";
import { normaliseReferralCode, referralLink } from "@/lib/friendsLink";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ─── GET /api/referrals?code=… — is this a live friend link, and whose ─── */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";

  // Same allowance as gift card checks: enough for typos, not for guessing
  const limited = rateLimit(`friend-code-check:${clientIp(req)}`, 20, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const settings = await referralSettings();
  if (!settings.enabled) {
    return NextResponse.json({ valid: false, error: "Friend links are paused at the moment." }, { status: 404 });
  }

  const referrer = await findReferrerByCode(code).catch(() => null);
  if (!referrer || referrer.active === false) {
    // Deliberately vague: don't help anyone guess at codes
    return NextResponse.json({ valid: false, error: "That code isn't valid" }, { status: 404 });
  }

  return NextResponse.json({
    valid: true,
    code: normaliseReferralCode(code),
    firstName: referrer.displayName ?? null,
    shopDiscount: settings.friendShopDiscount,
    minBasket: settings.friendMinBasket,
    atelierDiscount: settings.friendAtelierDiscount,
  });
}

/* ─── POST /api/referrals — make (or find) someone's link and email it ─── */
export async function POST(req: NextRequest) {
  // Each request can send an email to an address the caller typed in
  const limited = rateLimit(`friend-link:${clientIp(req)}`, 5, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests from here. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  try {
    const body = await req.json();
    const { firstName, email, company } = body ?? {};

    // Honeypot: a hidden field only a bot fills in. Pretend everything is fine.
    if (typeof company === "string" && company.trim() !== "") {
      return NextResponse.json({ ok: true }, { status: 201 });
    }
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 });
    }
    const name = typeof firstName === "string" ? firstName.trim().slice(0, 40) : "";

    if (!referralsConfigured()) {
      console.error("SANITY_API_WRITE_TOKEN or DATA_SECRET is not configured — cannot mint a Friends link");
      return NextResponse.json({ error: "Friend links are temporarily unavailable" }, { status: 503 });
    }
    const settings = await referralSettings();
    if (!settings.enabled) {
      return NextResponse.json({ error: "Beautasy Friends is paused at the moment" }, { status: 503 });
    }

    const { referrer, code } = await ensureReferrer({ firstName: name, email, source: "page" });
    if (!code) {
      console.error(`Referrer ${referrer._id} has no readable code — DATA_SECRET may have changed`);
      return NextResponse.json({ error: "Could not make your link. Please email us and we'll sort it." }, { status: 500 });
    }

    const emailed = await sendReferralLinkEmail(email.trim().toLowerCase(), referrer.displayName, code, settings);

    return NextResponse.json({ ok: true, code, link: referralLink(code), emailed }, { status: 201 });
  } catch (error) {
    console.error("Could not make a Friends link:", error);
    return NextResponse.json({ error: "Could not make your link. Please try again." }, { status: 500 });
  }
}
