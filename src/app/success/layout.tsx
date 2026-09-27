import type { Metadata } from "next";

/**
 * The thank-you after paying is for the person who paid, not for search.
 * Search engines found it open and could list it; it now says not to.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
