import { MetadataRoute } from "next";
import { sanityClient } from "@/lib/sanity";
import { SITE_URL } from "@/lib/site";
import { LOCAL_SERVICES } from "@/lib/localServices";
import { getShelves } from "@/lib/getShelves";
import { placeLink } from "@/lib/shelves";
import { getWork } from "@/lib/getWork";
import { LATEST_REVIEW_QUERY } from "@/lib/siteReviews";

const base = SITE_URL;

export const revalidate = 3600; // regenerate every hour

// Static pages change when their code does. Stamping them "modified now" on
// every regeneration teaches crawlers to ignore the date for the whole site.
const STATIC_PAGES_CHANGED = new Date("2026-09-03");

/** /pages/<slug> addresses that next.config.ts redirects: /pages/contact-us is /contact */
const REDIRECTED_LEGAL_PAGES = new Set(["contact-us"]);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: STATIC_PAGES_CHANGED, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/shop`, lastModified: STATIC_PAGES_CHANGED, changeFrequency: "daily", priority: 0.9 },
    // /shop/collections is left out: nothing on the site links to it, and the
    // collections themselves are listed below
    { url: `${base}/shop/lingerie`, lastModified: STATIC_PAGES_CHANGED, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/shop/kids`, lastModified: STATIC_PAGES_CHANGED, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/shop/accessories`, lastModified: STATIC_PAGES_CHANGED, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/shop/home`, lastModified: STATIC_PAGES_CHANGED, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/gift-boxes`, lastModified: STATIC_PAGES_CHANGED, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/gift-cards`, lastModified: STATIC_PAGES_CHANGED, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/refer`, lastModified: STATIC_PAGES_CHANGED, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/atelier`, lastModified: STATIC_PAGES_CHANGED, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/alterations`, lastModified: STATIC_PAGES_CHANGED, changeFrequency: "monthly", priority: 0.85 },
    // The local service pages are the ones competing for "alterations near me",
    // so they sit above the atelier overview in priority.
    ...LOCAL_SERVICES.map((s) => ({
      url: `${base}/alterations/${s.slug}`,
      lastModified: STATIC_PAGES_CHANGED,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${base}/contact`, lastModified: STATIC_PAGES_CHANGED, changeFrequency: "monthly", priority: 0.7 },
  ];

  // Dynamic product routes
  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    const products = await sanityClient.fetch<{ slug: string; updatedAt: string }[]>(
      `*[_type == "product" && defined(slug.current)]{
        "slug": slug.current,
        "updatedAt": _updatedAt
      }`
    );
    productRoutes = products.map((p) => ({
      url: `${base}/shop/${p.slug}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.75,
    }));
  } catch {
    // silently skip if Sanity is unavailable at build time
  }

  // Dynamic gift box routes
  let giftBoxRoutes: MetadataRoute.Sitemap = [];
  try {
    const giftBoxes = await sanityClient.fetch<{ slug: string; updatedAt: string }[]>(
      `*[_type == "giftBox" && defined(slug.current)]{
        "slug": slug.current,
        "updatedAt": _updatedAt
      }`
    );
    giftBoxRoutes = giftBoxes.map((g) => ({
      url: `${base}/gift-boxes/${g.slug}`,
      lastModified: new Date(g.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    // silently skip
  }

  // Dynamic legal/info pages
  let legalRoutes: MetadataRoute.Sitemap = [];
  try {
    const pages = await sanityClient.fetch<{ slug: string; updatedAt: string }[]>(
      `*[_type == "legalPage" && defined(slug.current)]{
        "slug": slug.current,
        "updatedAt": _updatedAt
      }`
    );
    // Pages next.config.ts sends elsewhere are not pages: listing a redirect
    // has Google crawl a hop for nothing. The Studio document stays.
    legalRoutes = pages.filter((p) => !REDIRECTED_LEGAL_PAGES.has(p.slug)).map((p) => ({
      url: `${base}/pages/${p.slug}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    }));
  } catch {
    // silently skip
  }

  // Dynamic collection routes
  let collectionRoutes: MetadataRoute.Sitemap = [];
  try {
    const collections = await sanityClient.fetch<{ slug: string; updatedAt: string }[]>(
      `*[_type == "collection" && defined(slug.current)]{
        "slug": slug.current,
        "updatedAt": _updatedAt
      }`
    );
    collectionRoutes = collections.map((c) => ({
      url: `${base}/shop/collection/${c.slug}`,
      lastModified: new Date(c.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    // silently skip
  }

  // A section with nothing in it is a "soft 404" to Google: listed again the
  // moment something is published for it — see @/lib/shelves
  const shelves = await getShelves();
  const stockedRoutes = staticRoutes.filter((route) => placeLink(route.url, shelves) !== null);

  // Our Work, by the same rule: listed once there is a piece in it, and as
  // changed when the newest piece was. When Sanity can't be read it stays
  // listed, as the shop's sections do: unknown is not empty.
  const { pieces, known } = await getWork();
  const newest = new Date(pieces[0]?.date ?? "");
  const workRoutes: MetadataRoute.Sitemap = pieces.length || !known
    ? [
        {
          url: `${base}/work`,
          lastModified: Number.isNaN(newest.getTime()) ? STATIC_PAGES_CHANGED : newest,
          changeFrequency: "weekly",
          priority: 0.8,
        },
      ]
    : [];

  // Reviews, by the same rule again: the page is a form and a link until the
  // first review is approved, and it tells search engines not to index it until
  // then (see src/app/reviews/page.tsx)
  let latestReview: string | null | undefined;
  try {
    latestReview = await sanityClient.fetch<string | null>(LATEST_REVIEW_QUERY);
  } catch {
    latestReview = undefined;
  }
  const reviewed = new Date(latestReview ?? "");
  const reviewRoutes: MetadataRoute.Sitemap = latestReview !== null
    ? [
        {
          url: `${base}/reviews`,
          lastModified: Number.isNaN(reviewed.getTime()) ? STATIC_PAGES_CHANGED : reviewed,
          changeFrequency: "weekly",
          priority: 0.6,
        },
      ]
    : [];

  return [...stockedRoutes, ...workRoutes, ...reviewRoutes, ...productRoutes, ...giftBoxRoutes, ...legalRoutes, ...collectionRoutes];
}
