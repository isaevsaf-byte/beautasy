/**
 * Shortens text to at most `max` UTF-16 units — what String.length and
 * Stripe's metadata limit count — without cutting a character in half.
 *
 * `.slice(0, 300)` counts halves: an emoji at the boundary of a gift message
 * was split, and the card arrived ending in a broken "�". This stops before
 * any character that would not fit whole.
 */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = "";
  for (const ch of text) {
    if (out.length + ch.length > max) break;
    out += ch;
  }
  return out;
}
