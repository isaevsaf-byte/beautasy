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

// 🚨 This dataset is public, and on this plan it cannot be anything else:
// Sanity's free tier has no private datasets (see @/lib/secrets). Anyone with
// the project id — it is in the page source — can read every document in it
// without a token. A reviewer did exactly that and got the shop's order counts
// back with no credentials at all.
//
// So the read token below is not what protects a customer. Nothing here does.
// The protection is that every name, email, phone number and address is
// encrypted before it is written, and the key never leaves the server: see
// @/lib/pii. Anything new that holds a person must be sealed the same way
// before it is stored, and no reasoning that starts "the dataset is private"
// is available to anybody reading this file.
//
// What the token is still for: it is a read token with no NEXT_PUBLIC_ on it,
// so it stays on the server, and it lets server code read drafts and survive
// the day the dataset is closed. The CDN honours it, so cached reads keep
// working.
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
