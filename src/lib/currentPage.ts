/**
 * Whether a menu link is for the page being shown: that page, or one inside
 * it (/shop, and a piece in the shop). A screen reader says "current page"
 * for it, which is how someone who cannot see the bold text knows where they
 * are. The part after # is ignored: /atelier#book is still /atelier.
 *
 * Pure, so the header (a client component) and its tests share it.
 */
export function isCurrentPage(href: string, pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = href.split("#")[0].split("?")[0];
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}
