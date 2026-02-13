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

// Main client — use this in Server Components, API routes, etc.
export const sanityClient = createClient(sanityConfig);

// Image URL builder
const builder = createImageUrlBuilder(sanityConfig);

/**
 * Generate optimised image URLs from Sanity image references.
 *
 * Usage:
 *   urlFor(product.image).width(800).height(600).url()
 */
export function urlFor(source: SanityImageSource) {
  return builder.image(source);
}
