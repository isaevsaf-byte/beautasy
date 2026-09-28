import { sanityClient } from "./sanity";
import { SITE_SETTINGS } from "./siteSettingsDocument";
import { BUSINESS } from "./business";
import { isNextdoorUrl } from "./siteReviews";
import type { ReferralSettings } from "@/lib/referralRules";

export interface SiteSettings {
  announcementBar?: {
    enabled: boolean;
    text?: string;
    link?: string;
    bgColor?: "lavender" | "charcoal" | "cream";
  };
  shipping?: {
    ukRate: number;
    internationalRate: number;
    freeShippingThreshold: number;
  };
  giftCardPlaceholder?: string;
  /** Where a happy customer is sent to leave a Google review */
  googleReviewUrl?: string;
  socialLinks?: {
    instagram?: string;
    tiktok?: string;
    pinterest?: string;
  };
  paymentIcons?: {
    showVisa: boolean;
    showMastercard: boolean;
    showPaypal: boolean;
    showApplePay: boolean;
    showGooglePay: boolean;
    showAmex: boolean;
  };
  /** Beautasy Friends — read through referralSettingsFrom() so missing fields keep their defaults */
  referral?: Partial<ReferralSettings>;
}

const SITE_SETTINGS_QUERY = `(${SITE_SETTINGS}){
  announcementBar,
  shipping,
  giftCardPlaceholder,
  googleReviewUrl,
  socialLinks,
  paymentIcons,
  referral
}`;

// Cached at the module level for the lifetime of a server render (ISR-safe)
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const settings = await sanityClient.fetch<SiteSettings>(
      SITE_SETTINGS_QUERY,
      {},
      { next: { revalidate: 300 } } // re-fetch every 5 min
    );
    return settings ?? {};
  } catch {
    return {};
  }
}

/**
 * The review link, wherever it happens to live.
 *
 * It began as an environment variable, which put a piece of ordinary shop
 * copy behind a redeploy and a developer — so it moved into the Studio where
 * Kristina can paste it herself. The variable is still read, because it costs
 * one line and silently dropping a value someone already set would be worse
 * than the small untidiness of two places.
 *
 * Reads fresh rather than through the cached settings: this is asked once per
 * email, and a link pasted five minutes ago should work.
 *
 * Last comes the link copied from the Google Business Profile into
 * business.ts, which the shop's order emails already use. Without it the
 * Studio field sat empty and every completed fitting went out without a
 * review ask — the cheapest local marketing there is, switched off because
 * nobody had pasted a link the code already knew.
 */
export async function googleReviewUrl({ forPage = false }: { forPage?: boolean } = {}): Promise<string | null> {
  try {
    const fromStudio = await sanityClient.fetch<string | null>(
      `${SITE_SETTINGS}.googleReviewUrl`,
      {},
      // An email reads it fresh. A page reads it with the page, every five
      // minutes: uncached, it would make the page render on every visit.
      forPage ? { next: { revalidate: 300 } } : { cache: "no-store" }
    );
    if (fromStudio) return fromStudio;
  } catch {
    // Falling through to the variable is the right answer, not an error
  }
  return process.env.GOOGLE_REVIEW_URL || BUSINESS.googleReviewUrl || null;
}

/**
 * Beautasy's page on Nextdoor: the one in the Studio when it has been put
 * there, otherwise the one the site knows. Only ever a Nextdoor address,
 * whatever was typed: the button that uses it says "Nextdoor". Read with the
 * page, every five minutes, like googleReviewUrl.
 */
export async function nextdoorPageUrl(): Promise<string | null> {
  try {
    const url = await sanityClient.fetch<string | null>(
      `${SITE_SETTINGS}.nextdoorUrl`,
      {},
      { next: { revalidate: 300 } }
    );
    if (isNextdoorUrl(url)) return url;
  } catch {
    // The page the site knows is the right answer here, not an error
  }
  return isNextdoorUrl(BUSINESS.nextdoorUrl) ? BUSINESS.nextdoorUrl : null;
}

/* ── Defaults ── */
export const DEFAULT_UK_RATE = 300;           // £3.00
export const DEFAULT_INT_RATE = 1200;         // £12.00
export const DEFAULT_FREE_THRESHOLD = 5000;   // £50.00
