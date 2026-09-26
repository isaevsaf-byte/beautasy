/**
 * Structured data for a `<script type="application/ld+json">` tag, safe to
 * put in HTML.
 *
 * `JSON.stringify` escapes quotes and backslashes and nothing else, which is
 * right for JSON and wrong for HTML: the browser ends a script tag at the
 * first `</script` it meets, whatever the JSON around it says. So a review
 * that reads "Beautiful fit! </script><script>…" closed the product page's
 * structured data early, and everything after it ran as a script of its own,
 * on every visit, for as long as the review stayed approved. Review text and
 * names are the one thing in these blocks a stranger writes — anyone with an
 * account can leave one — and approving a kind review is exactly what
 * Kristina would do.
 *
 * `<` is `<` to every JSON parser, Google's included, and is not `<` to
 * the HTML parser, so the data reads the same and the tag cannot be broken
 * out of. Every structured-data block goes through here, including the ones
 * built only from our own text, so the next block to take outside text does
 * not have to remember; a test fails if one is written without it.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
