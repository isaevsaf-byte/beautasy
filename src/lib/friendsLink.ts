import { SITE_URL } from "@/lib/site";

/**
 * The client-safe half of Beautasy Friends ("Give £5, get £5").
 *
 * Everything here runs in the browser as well as on the server: the cookie a
 * friend's link leaves behind, the shape of a link code, and the share text.
 * Anything that touches Sanity, Stripe or the sealing key lives in
 * @/lib/referrals instead, so a client component can never pull those in.
 */

/**
 * Where the bag and the booking form remember which friend sent someone.
 *
 * Set by the landing page (/r/CODE) in the browser, read back by the bag and
 * the booking form and sent to the server with the checkout or booking. It
 * carries no secret — a link code is meant to be passed around — and it is
 * functional rather than tracking: it exists to give the discount the visitor
 * clicked a link for, so it needs no consent banner.
 */
export const REFERRAL_COOKIE = "beautasy-ref";
export const REFERRAL_COOKIE_DAYS = 30;

/** "ANNA-K7P2": a first name and four characters from the gift card alphabet. */
export const CODE_SHAPE = /^[A-Z]{2,12}-[A-Z2-9]{4}$/;

export function normaliseReferralCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function looksLikeReferralCode(code: string): boolean {
  return CODE_SHAPE.test(normaliseReferralCode(code));
}

export function referralLink(code: string): string {
  return `${SITE_URL}/r/${normaliseReferralCode(code)}`;
}

/** "£5", or "£5.50" when the pence matter. */
export function pounds(pence: number): string {
  const whole = pence % 100 === 0;
  return `£${(pence / 100).toFixed(whole ? 0 : 2)}`;
}

/** The message a "Share on WhatsApp" button opens with. */
export function whatsappShareText(code: string): string {
  return `I get my clothes altered at Beautasy in Southampton, and they make lingerie by hand too. Here's £5 off your first order or fitting: ${referralLink(code)}`;
}

export function whatsappShareUrl(code: string): string {
  return `https://wa.me/?text=${encodeURIComponent(whatsappShareText(code))}`;
}

/* ─── The cookie, browser side ─── */

export function readReferralCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${REFERRAL_COOKIE}=`));
  if (!match) return null;
  const value = normaliseReferralCode(decodeURIComponent(match.slice(REFERRAL_COOKIE.length + 1)));
  return CODE_SHAPE.test(value) ? value : null;
}

export function writeReferralCookie(code: string): void {
  if (typeof document === "undefined") return;
  const value = normaliseReferralCode(code);
  if (!CODE_SHAPE.test(value)) return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(value)}; Max-Age=${REFERRAL_COOKIE_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`;
}

export function clearReferralCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${REFERRAL_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}
