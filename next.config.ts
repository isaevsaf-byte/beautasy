import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * The site shipped with none of these. They cost nothing and close the easy
 * stuff: a competitor framing the shop to harvest clicks, a browser guessing a
 * content type it shouldn't, full URLs leaking to third parties in the referer.
 *
 * The CSP here is deliberately partial: it locks down framing, plugins and
 * <base>, but does not restrict script sources yet. A script-src policy has to
 * cover Clerk, Stripe, Google Tag Manager and Sanity Studio, and getting it
 * wrong takes the shop down, so that belongs in its own change with the
 * report-only pass first.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    // The shop asks for none of these; payment stays enabled for Apple Pay
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** The Sanity project whose pictures the site shows — the same default as src/lib/sanity.ts */
const SANITY_PROJECT_ID =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_PROJECT_ID || "5uun6fw6";

const nextConfig: NextConfig = {
  images: {
    // Which pictures /_next/image will fetch and resize. With a whole host
    // allowed, anyone could have the site resize any project's images on
    // cdn.sanity.io at our expense; now only this project's.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        pathname: `/images/${SANITY_PROJECT_ID}/**`,
      },
      // The shop's stand-in for a product with no photo yet (ShopContent,
      // the category and collection pages draw 400x500 ones). No product is
      // without a photo today; the shape is pinned so nothing else is fetched.
      {
        protocol: "https",
        hostname: "placehold.co",
        pathname: "/400x500/**",
      },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // beautasy.vercel.app is Vercel's own address for the same site, and search
  // engines found a whole second copy of it there. Its pages now send people
  // to the real address for good (308). /api is left alone: a webhook still
  // pointed at the old address keeps arriving, where a redirected POST would
  // be a failed delivery.
  async redirects() {
    return [
      // The short address for asking: WhatsApp, the card in the bag, the email
      // after a finished job. It opens the review form with Google beside it.
      // Temporary (307), so it can point somewhere else later without every
      // browser having remembered the old place. /review/<token> — the
      // buyers' emailed links — is a different path and is not touched.
      { source: "/review", destination: "/reviews#write", permanent: false },
      {
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: "beautasy.vercel.app" }],
        destination: "https://www.beautasy.co.uk/:path",
        permanent: true,
      },
      // Addresses that once meant something and now lead nowhere, sent on for
      // good (308) so a bookmark, an old search result or a link in a chat
      // still arrives somewhere useful. After the vercel.app rule, so that
      // address is moved to the real one first, in one hop.
      //
      // /mini was a kids' page of placeholder pictures for pieces that were
      // never stocked; the kids' shelf is the real one.
      { source: "/mini", destination: "/shop/kids", permanent: true },
      // A thin contact page with an old email address on it
      { source: "/pages/contact-us", destination: "/contact", permanent: true },
      // The Shopify shop's addresses, which still turn up in old links
      { source: "/products/:slug", destination: "/shop/:slug", permanent: true },
      { source: "/collections/:path*", destination: "/shop", permanent: true },
      { source: "/cart", destination: "/shop", permanent: true },
      // Three visits to /sanity in a month: someone looking for the Studio.
      // (Links glued to the next word, /atelierFeel, are sent on in the
      // middleware: matching here ignores case, see @/lib/gluedLinks.)
      { source: "/sanity", destination: "/studio", permanent: false },
    ];
  },
};

export default nextConfig;
