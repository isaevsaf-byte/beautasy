/**
 * What a product page tells search engines and link previews about itself.
 *
 * It used to be a template — "Silk Slip — Handmade lingerie from Beautasy.
 * £38.00" — the same sentence on every product with the noun swapped, and
 * "Handmade kids from Beautasy" on the children's things. Kristina writes a
 * description for each piece; the start of it is what a person searching
 * should read.
 */

interface Block {
  _type?: string;
  children?: { text?: unknown }[];
}

/** The words of a Portable Text description, paragraphs joined by spaces. */
export function plainText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((block: Block) => block?._type === "block" && Array.isArray(block.children))
    .map((block: Block) => block.children!.map((span) => (typeof span?.text === "string" ? span.text : "")).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Short enough for a search result: cut at a word, with an ellipsis if anything was cut. */
export function snippet(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const atWord = cut.slice(0, Math.max(cut.lastIndexOf(" "), 0)) || cut;
  return `${atWord.replace(/[\s,;:.–—-]+$/, "")}…`;
}

/** Kristina's own words where she wrote some; the old sentence only where she has not. */
export function productDescription(product: { name?: string; category?: string; price?: number; description?: unknown }): string {
  const own = snippet(plainText(product.description));
  if (own) return own;
  const kind = product.category ? `${product.category.toLowerCase()} piece` : "piece";
  const price = typeof product.price === "number" ? ` £${(product.price / 100).toFixed(2)}` : "";
  return `${product.name ?? "A handmade piece"} — a handmade ${kind} from Beautasy, Southampton.${price}`;
}
