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

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
      },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
