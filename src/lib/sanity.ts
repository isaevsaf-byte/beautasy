import { createClient } from "next-sanity";
import { createImageUrlBuilder } from "@sanity/image-url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SanityImageSource = any;

const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
  process.env.SANITY_PROJECT_ID ||
  "5uun6fw6";

const dataset =
  process.env.NEXT_PUBLIC_SANITY_DATASET ||
  process.env.SANITY_DATASET ||
  "production";

export const sanityConfig = {
  projectId,
  dataset,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2026-02-13",
  useCdn: process.env.NODE_ENV === "production",
};

// Read token for a private dataset. Server-only on purpose (no NEXT_PUBLIC_):
// nothing in the browser talks to Sanity directly — components go through
// /api/* — so the dataset can be private without a public token. Bookings,
// stock alerts, orders and gift-card balances all live in this dataset, and a
// public dataset serves every one of them to anyone with the project id.
// The CDN honours the token, so cached reads keep working.
const readToken = process.env.SANITY_API_READ_TOKEN;

// Main client — use this in Server Components, API routes, etc.
export const sanityClient = createClient({
  ...sanityConfig,
  ...(readToken ? { token: readToken } : {}),
});

// Write client — server-side only, for creating reviews etc.
export const sanityWriteClient = createClient({
  ...sanityConfig,
  useCdn: false,
  token: process.env.SANITY_API_WRITE_TOKEN,
});

// Image URL builder
const builder = createImageUrlBuilder(sanityConfig);

/**
 * Generate optimised image URLs from Sanity image references.
 *
 * `auto("format")` lets Sanity's CDN serve WebP/AVIF to browsers that accept
 * it and fall back to JPEG for everything else — roughly half the bytes for
 * the same picture (measured: 39.9KB JPEG → 20.1KB WebP on a catalogue shot).
 *
 * Usage:
 *   urlFor(product.image).width(800).height(600).url()
 */
export function urlFor(source: SanityImageSource) {
  return builder.image(source).auto("format");
}
