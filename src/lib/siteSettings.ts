import { sanityClient } from "./sanity";
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

const SITE_SETTINGS_QUERY = `*[_type == "siteSettings"][0]{
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
 */
export async function googleReviewUrl(): Promise<string | null> {
  try {
    const fromStudio = await sanityClient.fetch<string | null>(
      `*[_type == "siteSettings"][0].googleReviewUrl`,
      {},
      { cache: "no-store" }
    );
    if (fromStudio) return fromStudio;
  } catch {
    // Falling through to the variable is the right answer, not an error
  }
  return process.env.GOOGLE_REVIEW_URL || null;
}

/* ── Defaults ── */
export const DEFAULT_UK_RATE = 300;           // £3.00
export const DEFAULT_INT_RATE = 1200;         // £12.00
export const DEFAULT_FREE_THRESHOLD = 5000;   // £50.00
