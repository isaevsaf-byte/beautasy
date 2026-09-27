/**
 * Which shelves of the shop have anything on them.
 *
 * The menu, the footer, the shop's own chips, the service pages and the
 * sitemap were all written for the shop Beautasy means to have: 22 sections.
 * Sixteen products fill six of them. So 14 of 21 menu items opened "Coming
 * Soon", "Gifts" was empty three months before Christmas, a bride sent from
 * the wedding-dress page for garters found an empty shelf, and Google counts
 * pages like that as soft 404s.
 *
 * Everything that links to a section now asks here first, by the link itself:
 * `/shop/lingerie?category=garters` is kept while a lingerie product is filed
 * under garters, and left out while none is. A section comes back the moment
 * Kristina publishes something for it — nobody has to remember to add a link.
 *
 * Pure, so the Studio-free client bundle can use it; the server read is in
 * @/lib/getShelves.
 */

export interface Shelves {
  /** Every category, and every category/subcategory, holding a product: "Lingerie", "Lingerie/bras" */
  stocked: string[];
  /** Whether there is at least one gift box to show */
  giftBoxes: boolean;
}

/** A product's category as the shop's URLs spell it */
export const CATEGORY_SLUGS: Record<string, string> = {
  Lingerie: "lingerie",
  Kids: "kids",
  Accessories: "accessories",
  Home: "home",
};

/** And back: `/shop/mini` is the kids' shelf under another name */
const SLUG_CATEGORIES: Record<string, string> = {
  lingerie: "Lingerie",
  kids: "Kids",
  mini: "Kids",
  accessories: "Accessories",
  home: "Home",
};

export const SHELVES_QUERY = `{
  "products": *[_type == "product" && defined(category)]{ category, subcategory },
  "giftBoxes": count(*[_type == "giftBox" && defined(slug.current)])
}`;

interface RawShelves {
  products?: { category?: unknown; subcategory?: unknown }[] | null;
  giftBoxes?: unknown;
}

export function shelvesFrom(raw: RawShelves | null | undefined): Shelves {
  const stocked = new Set<string>();
  for (const product of raw?.products ?? []) {
    if (typeof product?.category !== "string" || !product.category) continue;
    stocked.add(product.category);
    if (typeof product.subcategory === "string" && product.subcategory) {
      stocked.add(`${product.category}/${product.subcategory}`);
    }
  }
  return {
    stocked: [...stocked].sort(),
    giftBoxes: typeof raw?.giftBoxes === "number" && raw.giftBoxes > 0,
  };
}

type Need = { category: string; subcategory?: string } | "giftBoxes";

/** What a link needs on the shelves to lead anywhere; null for a link that is not to a shop section. */
function needOf(href: string): Need | null {
  let url: URL;
  try {
    url = new URL(href, "https://www.beautasy.co.uk");
  } catch {
    return null;
  }
  if (url.pathname === "/gift-boxes") return "giftBoxes";
  const section = url.pathname.match(/^\/shop\/([a-z-]+)$/);
  const category = section ? SLUG_CATEGORIES[section[1]] : undefined;
  if (!category) return null;
  const subcategory = url.searchParams.get("category") || undefined;
  return { category, subcategory };
}

/**
 * Where a link should go now. The same place, if it has something on it. The
 * shelf the products were actually filed under, if the link looks for them in
 * another — the sleeping mask is in Accessories, and the menu looks for it
 * under Lingerie. Or nowhere: null, and the link is left out.
 *
 * Links that are not to a shop section pass untouched, and so does every link
 * while the shelves are unknown (not read yet, or Sanity could not be read):
 * better the old menu than an empty one.
 */
export function placeLink(href: string, shelves: Shelves | null | undefined): string | null {
  if (!shelves) return href;
  const need = needOf(href);
  if (!need) return href;
  if (need === "giftBoxes") return shelves.giftBoxes ? href : null;

  const stocked = new Set(shelves.stocked);
  if (!need.subcategory) return stocked.has(need.category) ? href : null;
  if (stocked.has(`${need.category}/${need.subcategory}`)) return href;

  const elsewhere = shelves.stocked.find((key) => key.split("/")[1] === need.subcategory);
  const category = elsewhere?.split("/")[0];
  if (!category || !CATEGORY_SLUGS[category]) return null;
  return `/shop/${CATEGORY_SLUGS[category]}?category=${encodeURIComponent(need.subcategory)}`;
}

/** The links that lead somewhere, each pointed where its products are. */
export function stockedLinks<T extends { href: string }>(links: readonly T[], shelves: Shelves | null | undefined): T[] {
  return links.flatMap((link) => {
    const href = placeLink(link.href, shelves);
    return href ? [{ ...link, href }] : [];
  });
}

/** "Gifts": the gift boxes once there are any, and until then the gift cards, which are never empty. */
export function giftsHref(shelves: Shelves | null | undefined): string {
  return shelves?.giftBoxes ? "/gift-boxes" : "/gift-cards";
}
