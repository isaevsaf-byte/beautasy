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
  hours: {
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    opens: "09:00",
    closes: "18:00",
    label: "Mon–Sat, 9am–6pm, by appointment",
  },
  /** Public profiles, canonical URLs — no tracking parameters */
  sameAs: [
    "https://www.instagram.com/beautasy_lingerie_uk/",
    "https://www.pinterest.co.uk/beautasy_studio/",
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
  return [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [...BUSINESS.hours.days],
      opens: BUSINESS.hours.opens,
      closes: BUSINESS.hours.closes,
    },
  ];
}

export function postalAddress() {
  return {
    "@type": "PostalAddress",
    addressLocality: BUSINESS.address.locality,
    addressRegion: BUSINESS.address.region,
    addressCountry: BUSINESS.address.country,
  };
}
