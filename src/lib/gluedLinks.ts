/**
 * A link glued to the word after it.
 *
 * Paste "…beautasy.co.uk/atelier" and "Feel free to message me" without the
 * line break between them, and Facebook makes a link of both. In September six
 * people came from a Facebook post to /atelierFeel and one to /atelierПишите,
 * and all seven met "page not found". Every real address here is lower case,
 * so a capital letter, a non-English letter or an encoded character straight
 * after the name of a page can only be the next word — and the visitor wanted
 * the page.
 *
 * Decided in the middleware rather than in next.config.ts redirects: those
 * match without regard to case, which would send /workshops — or any page
 * added later whose name starts like one of these — to /work.
 */

/** The pages whose links get shared in posts and chats */
export const GLUED_PAGES = ["atelier", "alterations", "reviews", "work", "shop", "contact", "refer"] as const;

const GLUED = new RegExp(`^/(${GLUED_PAGES.join("|")})(?:[A-Z]|%[0-9A-Fa-f]{2}|[^\\x00-\\x7F])`);

/** Where a glued link meant to go ("/atelier"), or null for any other address */
export function gluedLinkTarget(pathname: string): string | null {
  const found = GLUED.exec(pathname);
  return found ? `/${found[1]}` : null;
}
