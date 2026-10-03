import type { Mutation } from "next-sanity";
import { BUSINESS } from "./business";

/**
 * Taps on WhatsApp and on the phone number, counted by the day.
 *
 * The atelier's money comes through those two links, not through the
 * booking form: "Send a photo on WhatsApp" is the main thing every atelier
 * page asks for. Until now nothing counted them — Google sees a WhatsApp tap
 * only from visitors who accepted cookies, a phone tap not at all, and the
 * Dashboard Kristina actually reads saw neither. So the site counts them
 * itself: one document per day, two numbers and which kind of page the tap
 * came from. No address, no visitor id, no full page path, nothing that says
 * who — a tally, like a clicker at the door.
 *
 * Everything here is pure and safe in the browser: the page listens for the
 * taps with it, and /api/contact-click checks what it is sent with it.
 */

export type ContactMethod = "whatsapp" | "phone";

export const CONTACT_METHODS: readonly ContactMethod[] = ["whatsapp", "phone"];

/** The document type. Not in the Studio's schema: the Dashboard reads it for her. */
export const CONTACT_CLICKS_TYPE = "contactClicks";

/**
 * Which kind of page a tap came from — a short fixed list rather than the
 * path itself, so the document stays small and says nothing about anyone's
 * way through the site.
 */
export const PAGE_BUCKETS = ["home", "atelier", "alterations", "contact", "work", "partner", "shop", "other"] as const;

export type PageBucket = (typeof PAGE_BUCKETS)[number];

/** The first part of the path → its bucket. Anything not here is "other". */
const BUCKET_OF_SEGMENT: Record<string, PageBucket> = {
  "": "home",
  atelier: "atelier",
  alterations: "alterations",
  contact: "contact",
  work: "work",
  // A salon's own page, /p/the-hair-lounge
  p: "partner",
  shop: "shop",
};

export function pageBucketOf(path: string | null | undefined): PageBucket {
  const first = (path ?? "").split(/[?#]/)[0].split("/").filter(Boolean)[0] ?? "";
  return Object.hasOwn(BUCKET_OF_SEGMENT, first) ? BUCKET_OF_SEGMENT[first] : "other";
}

/** "+44 7729 741116", "07729 741116" → "447729741116". */
function ukDigits(number: string): string {
  const digits = number.replace(/\D/g, "");
  return digits.startsWith("0") ? `44${digits.slice(1)}` : digits;
}

const SHOP_PHONE = ukDigits(BUSINESS.telephoneHref.replace(/^tel:/, ""));

/**
 * Whether a link is one of the two being counted: WhatsApp to the atelier's
 * own number, or a call to it. A friend sharing their link on WhatsApp
 * (wa.me/?text=…) is not a client getting in touch, and neither is a salon's
 * number in the Studio, so both are left out.
 */
export function contactMethodOf(href: string | null | undefined): ContactMethod | null {
  const link = (href ?? "").trim();
  if (!link) return null;
  if (/^tel:/i.test(link)) return ukDigits(link.slice(4)) === SHOP_PHONE ? "phone" : null;

  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "wa.me" || host === "www.wa.me") {
    return url.pathname.replace(/\/+$/, "") === `/${BUSINESS.whatsappNumber}` ? "whatsapp" : null;
  }
  if (host === "api.whatsapp.com" || host === "web.whatsapp.com") {
    return ukDigits(url.searchParams.get("phone") ?? "") === BUSINESS.whatsappNumber ? "whatsapp" : null;
  }
  return null;
}

export interface ContactClick {
  method: ContactMethod;
  page: PageBucket;
}

/** What /api/contact-click accepts: exactly a method and a bucket, or nothing at all. */
export function contactClickFrom(body: unknown): ContactClick | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { method, page } = body as Record<string, unknown>;
  if (typeof method !== "string" || !(CONTACT_METHODS as readonly string[]).includes(method)) return null;
  if (typeof page !== "string" || !(PAGE_BUCKETS as readonly string[]).includes(page)) return null;
  return { method: method as ContactMethod, page: page as PageBucket };
}

/** One document per day on Southampton's calendar: "contactClicks-2026-10-03". */
export function contactClicksId(day: string): string {
  return `${CONTACT_CLICKS_TYPE}-${day}`;
}

type Tally = Record<ContactMethod, number>;

function zero(): Tally {
  return { whatsapp: 0, phone: 0 };
}

/**
 * The day's document made if it is not there yet, and the tap added to it —
 * as one transaction of Sanity mutations, so two taps at once both count:
 * `inc` adds on the server, it does not read and write back.
 */
export function contactClickMutations(day: string, click: ContactClick): Mutation[] {
  const _id = contactClicksId(day);
  const pages = Object.fromEntries(PAGE_BUCKETS.map((bucket) => [bucket, zero()]));
  const onPage = `pages.${click.page}.${click.method}`;
  return [
    { createIfNotExists: { _id, _type: CONTACT_CLICKS_TYPE, date: day, ...zero(), pages } },
    // setIfMissing first: a day begun before a bucket was added still counts on it
    { patch: { id: _id, setIfMissing: { [onPage]: 0 }, inc: { [click.method]: 1, [onPage]: 1 } } },
  ];
}

/** A day's document as the Dashboard reads it. */
export interface ContactClickDay {
  whatsapp?: number | null;
  phone?: number | null;
  pages?: Partial<Record<string, Partial<Tally> | null>> | null;
}

function countOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Several days added up: the two totals, and the pages the taps came from, most first. */
export function sumContactClicks(days: ContactClickDay[] | null | undefined): {
  whatsapp: number;
  phone: number;
  pages: { page: PageBucket; taps: number }[];
} {
  const total = zero();
  const byPage = new Map<PageBucket, number>();
  for (const day of days ?? []) {
    if (!day) continue;
    total.whatsapp += countOf(day.whatsapp);
    total.phone += countOf(day.phone);
    for (const bucket of PAGE_BUCKETS) {
      const tally = day.pages?.[bucket];
      const taps = countOf(tally?.whatsapp) + countOf(tally?.phone);
      if (taps > 0) byPage.set(bucket, (byPage.get(bucket) ?? 0) + taps);
    }
  }
  const pages = [...byPage]
    .map(([page, taps]) => ({ page, taps }))
    .sort((a, b) => b.taps - a.taps || PAGE_BUCKETS.indexOf(a.page) - PAGE_BUCKETS.indexOf(b.page));
  return { ...total, pages };
}
