/**
 * What a collection page says about itself to search engines.
 *
 * The description was a template — "Shop the {name} collection" — and the
 * names Kristina gives collections already say both: "The Essence
 * Collection" came out as "Shop the The Essence Collection collection". The
 * name is used as written now, and the template only adds what it lacks.
 */
export function collectionDescription(name: string, season?: string | null): string {
  const clean = name.trim();
  const hasThe = /^the\s/i.test(clean);
  const hasCollection = /\bcollection$/i.test(clean);
  const title = `${hasThe ? "" : "the "}${clean}${hasCollection ? "" : " collection"}`;
  return `Shop ${title}${season ? ` (${season})` : ""} — handmade pieces crafted with love in Southampton.`;
}
