import type { Metadata } from "next";
import HomeContent from "./HomeContent";

/**
 * The home page's own metadata. Only a canonical address: the title,
 * description and card come from the root layout. It lives here and not in
 * the layout because every page without an address of its own would inherit
 * it there, and tell Google it is a copy of the home page.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return <HomeContent />;
}
