/**
 * A search-result description from a Studio page's own words.
 *
 * The /pages/* documents (About Us, Delivery & Returns, Privacy Policy) were
 * described to Google as just their title — "Privacy Policy — Beautasy" —
 * so a result said nothing about what was on the page. This takes the text of
 * the first paragraphs instead, and stops at a word before Google would cut
 * it off mid-sentence.
 */

interface Span {
  text?: unknown;
}

interface Block {
  _type?: unknown;
  style?: unknown;
  children?: Span[] | unknown;
}

/** Google shows about this much of a description before it trims it */
export const DESCRIPTION_LIMIT = 155;

/**
 * The plain text of the page's paragraphs, headings left out (they repeat the
 * title more often than not), cut at a word boundary to `limit` characters
 * with an ellipsis. Null when the page has no paragraph text at all.
 */
export function summaryFromBlocks(body: unknown, limit = DESCRIPTION_LIMIT): string | null {
  if (!Array.isArray(body)) return null;
  const paragraphs: string[] = [];
  for (const block of body as Block[]) {
    if (block?._type !== "block") continue;
    if (typeof block.style === "string" && /^h\d$/.test(block.style)) continue;
    if (!Array.isArray(block.children)) continue;
    const text = (block.children as Span[])
      .map((span) => (typeof span?.text === "string" ? span.text : ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (text) paragraphs.push(text);
    if (paragraphs.join(" ").length > limit) break;
  }
  const whole = paragraphs.join(" ");
  if (!whole) return null;
  if (whole.length <= limit) return whole;
  const cut = whole.slice(0, limit - 1);
  const atWord = cut.slice(0, Math.max(cut.lastIndexOf(" "), Math.floor(limit / 2)));
  return `${atWord.replace(/[\s,;:.–—-]+$/, "")}…`;
}
