import type { Metadata } from "next";

/**
 * A visitor's own wishlist is for them, not for search. Search engines found
 * it open and could list it; it now says not to.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
