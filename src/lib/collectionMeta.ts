/**
 * What a collection page says about itself to search engines.
 *
 * The description was a template — "Shop the {name} collection" — and the
 * names Kristina gives collections already say both: "The Essence
 * Collection" came out as "Shop the The Essence Collection collection". The
 * name is used as written now, and the template only adds what it lacks.
 *
 * "Lacks" is read loosely, because a name is typed by hand: a stray space or
 * full stop, "Collections", "the collection of linen", or a season that
 * already says "Collection" all count as having said it.
 */
const SAYS_COLLECTION = /\bcollections?\b/i;

/** A name as it should read inside a sentence: one space between words, no full stop at the end */
function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[\s.,;:!]+$/, "");
}

export function collectionDescription(name: string, season?: string | null): string {
  const clean = tidy(name);
  const when = season ? tidy(season) : "";
  const hasThe = /^the\b/i.test(clean);
  const hasCollection = SAYS_COLLECTION.test(clean) || SAYS_COLLECTION.test(when);
  const title = [hasThe ? "" : "the", clean, hasCollection ? "" : "collection"].filter(Boolean).join(" ");
  return `Shop ${title}${when ? ` (${when})` : ""} — handmade pieces crafted with love in Southampton.`;
}
