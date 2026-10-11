/**
 * Where a piece of work lives in the address bar: /work/<piece>.
 *
 * It is the address with the piece's own preview in a chat
 * (src/app/work/[piece]/page.tsx), so it is the one the gallery shows while a
 * piece is open — the browser's own Share, or a copied address, sends what
 * "Send this to a friend" sends. Until 11.10.2026 an open piece was
 * /work#<piece>, and a chat app never sends what follows the #: every piece
 * previewed as the gallery. Those older links still open their piece.
 */

/** The piece an address opens: /work/<piece>, or an older /work#<piece> */
export function pieceIn(pathname: string, hash: string): string {
  const raw = /^\/work\/([^/]+)\/?$/.exec(pathname)?.[1] ?? (pathname.replace(/\/$/, "") === "/work" ? hash.replace(/^#/, "") : "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

/** The address of a piece, or of the gallery with none open */
export function addressOf(anchor: string | null): string {
  return anchor ? `/work/${encodeURIComponent(anchor)}` : "/work";
}

/** The tab's title for the gallery, as /work's metadata sets it */
export const GALLERY_TITLE = "Made & Mended — Our Work | Beautasy Atelier, Southampton";

/** The tab's title with a piece open, as /work/<piece>'s metadata sets it */
export function pieceTitle(title: string): string {
  return `${title} — Made & Mended | Beautasy Atelier, Southampton`;
}
