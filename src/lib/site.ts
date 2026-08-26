/**
 * The one canonical origin for the shop.
 *
 * beautasy.co.uk 307-redirects to the www host, so www is what visitors and
 * crawlers actually land on. Sitemap entries, canonicals, JSON-LD and Open
 * Graph images used the apex, which meant every URL we published pointed at a
 * redirect and the product feed disagreed with the sitemap. Import this instead
 * of hardcoding a host.
 */
export const SITE_URL = "https://www.beautasy.co.uk";
