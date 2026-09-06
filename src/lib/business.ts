import { SITE_URL } from "@/lib/site";

/**
 * The shop's name, contact details, hours and profiles — spelled once.
 *
 * Local search matches a business across the web by comparing exactly these
 * facts (name, address, phone: "NAP"), and a digit that differs between the
 * footer, a landing page and Google Business Profile reads as two businesses.
 * Every page and every schema.org block takes them from here.
 *
 * There is deliberately no street address yet: whether to publish one for a
 * home atelier is Kristina's call. When she does, add `streetAddress` and
 * `postalCode` here and they flow into every LocalBusiness block.
 */
export const BUSINESS = {
  name: "Beautasy",
  atelierName: "Beautasy Atelier",
  telephone: "+44 7729 741116",
  telephoneHref: "tel:+447729741116",
  /** International format without "+", as wa.me wants it */
  whatsappNumber: "447729741116",
  email: "hello@beautasy.co.uk",
  address: {
    locality: "Southampton",
    region: "Hampshire",
    country: "GB",
  },
  /**
   * Copied from Google Business Profile, which is where Kristina keeps them
   * and what a customer sees in Maps. They differ per day, so this is a list
   * of blocks rather than one range — the site used to claim Mon–Sat 9–6,
   * which was wrong on all seven days and read to Google as a second business.
   */
  hours: {
    blocks: [
      {
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "09:00",
        closes: "19:00",
      },
      { days: ["Saturday"], opens: "11:00", closes: "17:00" },
      { days: ["Sunday"], opens: "11:00", closes: "16:00" },
    ],
    label: "Mon–Fri 9am–7pm · Sat 11am–5pm · Sun 11am–4pm",
  },
  /**
   * The Google Business Profile listing. `googleMapsUrl` is the stable cid
   * form, which survives the listing being renamed; `googleReviewUrl` opens
   * the review box directly, with no hunting for the button.
   */
  googleMapsUrl: "https://maps.google.com/?cid=5155324499486741351",
  googleReviewUrl: "https://g.page/r/CWeTxnVRZItHEBM/review",

  /** Public profiles, canonical URLs — no tracking parameters */
  sameAs: [
    "https://www.instagram.com/beautasy_lingerie_uk/",
    "https://www.pinterest.co.uk/beautasy_studio/",
    "https://maps.google.com/?cid=5155324499486741351",
  ],
  /** Stable ids so every page points at the same two entities */
  organizationId: `${SITE_URL}#organization`,
  atelierId: `${SITE_URL}/alterations#business`,
} as const;

/** A WhatsApp link that opens with the message already typed. */
export function whatsappLink(text: string): string {
  return `https://wa.me/${BUSINESS.whatsappNumber}?text=${encodeURIComponent(text)}`;
}

/** schema.org opening hours, from the same facts the page prints. */
export function openingHoursSpecification() {
  return BUSINESS.hours.blocks.map((block) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: [...block.days],
    opens: block.opens,
    closes: block.closes,
  }));
}

export function postalAddress() {
  return {
    "@type": "PostalAddress",
    addressLocality: BUSINESS.address.locality,
    addressRegion: BUSINESS.address.region,
    addressCountry: BUSINESS.address.country,
  };
}
