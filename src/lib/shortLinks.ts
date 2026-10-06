/**
 * Short links for posts in Facebook groups.
 *
 * A group post ended with the whole address and its tags —
 * …/alterations/prom-and-evening-dress-southampton?utm_source=facebook&utm_medium=group&utm_campaign=shop-local-southampton,
 * 140 characters of it in the middle of a friendly post. Now it ends with
 * www.beautasy.co.uk/g/prom/k3x: a word for the job and a three-character
 * code for the group. The middleware turns that into the long address, so
 * the page, the tags and the Facebook referrer all arrive as before.
 *
 * The code comes from the group's id in the Studio, never its name, so
 * renaming a group keeps its links — and nothing has to be stored or
 * numbered for it. It is a label, not a key: the word alone decides the
 * page, so two groups sharing a code would only share a tag.
 *
 * Pure, so the middleware bundle carries only these few lines.
 */

const SITE = "www.beautasy.co.uk";

/** A word for each service page, as short as it can be and still read */
export const SHORT_WORDS: Readonly<Record<string, string>> = {
  wedding: "wedding-dress-southampton",
  school: "school-uniform-southampton",
  prom: "prom-and-evening-dress-southampton",
  jeans: "jeans-and-trousers-southampton",
  zip: "zip-replacement-southampton",
  curtains: "curtains-and-home-southampton",
};

const WORD_FOR_SLUG: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SHORT_WORDS).map(([word, slug]) => [slug, word])
);

/** How long a group's code is: fixed, so whatever is glued after it is not part of it */
export const GROUP_CODE_LENGTH = 3;
const CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no 0/o, 1/l: read aloud or retyped, they get confused

/** A group's three-character code: the same for the same id, forever */
export function groupCode(id: string): string {
  // FNV-1a: small, stable, and spreads similar ids apart
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let code = "";
  for (let i = 0; i < GROUP_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[hash % CODE_ALPHABET.length];
    hash = Math.floor(hash / CODE_ALPHABET.length);
  }
  return code;
}

/** The short link for a service page and a group, or null for a page without a word */
export function groupShortLink(serviceSlug: string, groupId: string): { href: string; shown: string } | null {
  const word = WORD_FOR_SLUG[serviceSlug];
  if (!word) return null;
  const shown = `${SITE}/g/${word}/${groupCode(groupId)}`;
  return { href: `https://${shown}`, shown };
}

const CODE_START = new RegExp(`^[${CODE_ALPHABET}]{${GROUP_CODE_LENGTH}}`);

/**
 * Where a short link goes: "/alterations/…?utm_…", or null for any other
 * address. Never a dead end — an unknown word lands on the alterations page,
 * a missing or broken code on the service page without the group's tag. The
 * address is built only from the list above and the code's own letters, so
 * nobody can make it send a visitor anywhere else. Every other parameter on
 * the link (Facebook's fbclid) comes along; incoming utm tags are replaced.
 */
export function shortLinkTarget(pathname: string, search = ""): string | null {
  if (pathname !== "/g" && !pathname.startsWith("/g/")) return null;
  const [rawWord = "", rawCode = ""] = pathname.slice(3).split("/");

  // A word glued to the next one ("promFeel") is still the word
  const word = /^[a-z]+/.exec(rawWord)?.[0] ?? /^[a-z]+/.exec(rawWord.toLowerCase())?.[0] ?? "";
  // Own keys only: "constructor" is not a word on the list
  const slug =
    (Object.hasOwn(SHORT_WORDS, word) ? SHORT_WORDS[word] : undefined) ??
    Object.entries(SHORT_WORDS).find(([w]) => word.startsWith(w))?.[1];
  const code = CODE_START.exec(rawCode)?.[0] ?? null;

  const params = new URLSearchParams(search);
  for (const key of [...params.keys()]) if (key.startsWith("utm_")) params.delete(key);
  params.set("utm_source", "facebook");
  params.set("utm_medium", "group");
  if (code) params.set("utm_campaign", `fb-${code}`);

  return `${slug ? `/alterations/${slug}` : "/alterations"}?${params}`;
}
