/**
 * A smaller copy of a product photo, for the places that show it small.
 *
 * The shop builds every photo URL at 800×1000 for the main picture, and the
 * 56px thumbnails under each card used the same file: on /shop that was 77
 * full-size photos, about 2.3 MB of a 3.7 MB page, for pictures the size of a
 * fingernail. Worse, React turns every eager <img> in the server HTML into an
 * early download in <head> — 75 of them, some ahead of the stylesheet — so
 * they held up the first paint as well as the data plan.
 *
 * Sanity's CDN resizes on request, so the fix is to ask it for the size shown:
 * the w and h on the URL are replaced and everything else (crop, format) is
 * kept as it is. Anything that is not a Sanity image — a placeholder — comes
 * back unchanged. next/image is deliberately not used for these: it would
 * spend the Vercel plan's image-optimisation quota on what Sanity does free.
 */

const SANITY_IMAGES = "https://cdn.sanity.io/images/";

/** About 2.5× a 56–64px thumbnail, so it stays sharp on a phone screen. */
export const THUMB = { width: 160, height: 200 } as const;
/** A 4:5 card about 170–300px wide, as in "You might also like". */
export const CARD = { width: 400, height: 500 } as const;

export function sizedImageUrl(url: string, size: { width: number; height: number }): string {
  if (typeof url !== "string" || !url.startsWith(SANITY_IMAGES)) return url;
  const [base, query = ""] = url.split("?", 2);
  // Edited as text, not through URLSearchParams, which would re-encode the
  // crop's commas and hand Sanity a different-looking URL to cache
  const kept = query.split("&").filter((part) => part && !/^(w|h)=/.test(part));
  return `${base}?${[...kept, `w=${size.width}`, `h=${size.height}`].join("&")}`;
}
