import { LOCAL_SERVICES, type PriceLine } from "./localServices";

/**
 * What the site says it is, spelled once: the home page's title and
 * description, the root layout's (which every page without its own inherits),
 * and the words on the link card.
 *
 * The atelier comes first because it is what pays: alterations bring the
 * money in, and the shop has taken no orders yet. A search result or a
 * forwarded link that read "Handmade Lingerie & Accessories" sent the person
 * looking for a hem somewhere else before they ever saw a price.
 *
 * Read on the server only. It pulls in the service pages' full copy for their
 * price lists, so a client component is handed the answer (see ./page.tsx)
 * rather than importing this and shipping every FAQ to the phone.
 */

/**
 * The cheapest job on any service page, as the page prints it: "£8", or
 * "£15.50" if that were the lowest. Taken from the price lists themselves, so
 * the home page cannot go on promising a price the service pages dropped.
 * Null when no line has a price in it, and the sentence is left out.
 */
export function lowestPrice(
  lines: readonly PriceLine[] = LOCAL_SERVICES.flatMap((service) => service.prices),
): string | null {
  let lowest: number | null = null;
  for (const line of lines) {
    const found = /£\s?(\d+(?:\.\d{1,2})?)/.exec(line.price);
    if (!found) continue;
    const pounds = Number(found[1]);
    if (lowest === null || pounds < lowest) lowest = pounds;
  }
  if (lowest === null) return null;
  return Number.isInteger(lowest) ? `£${lowest}` : `£${lowest.toFixed(2)}`;
}

const FROM = lowestPrice();

/** Under 60 characters, so Google shows it whole: alterations first, the shop second */
export const SITE_TITLE = "Beautasy — Alterations & Handmade Lingerie, Southampton";

/** Under 160 characters, Google's cut-off for a description */
export const SITE_DESCRIPTION =
  `Alterations and repairs by appointment in Southampton${FROM ? `, from ${FROM}` : ""}: ` +
  "hems, zips, wedding and prom dresses, curtains. Plus a small shop of handmade lingerie.";
