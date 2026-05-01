import { sanityClient } from "./sanity";

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
}

const SITE_SETTINGS_QUERY = `*[_type == "siteSettings"][0]{
  announcementBar,
  shipping,
  giftCardPlaceholder,
  socialLinks,
  paymentIcons
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

/* ── Defaults ── */
export const DEFAULT_UK_RATE = 300;           // £3.00
export const DEFAULT_INT_RATE = 1200;         // £12.00
export const DEFAULT_FREE_THRESHOLD = 5000;   // £50.00
