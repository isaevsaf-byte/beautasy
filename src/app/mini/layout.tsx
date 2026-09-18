import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { SOCIAL_CARD_IMAGES } from "@/lib/socialCard";

const siteUrl = SITE_URL;

export const metadata: Metadata = {
  title: "Mini Beautasy — Handmade Kids' Clothing",
  description:
    "Gentle, handmade clothing for little ones. Cotton dresses, rompers, pyjamas, and accessories made with love in Southampton.",
  openGraph: {
    title: "Mini Beautasy — Handmade Kids' Clothing",
    description:
      "Gentle, handmade clothing for little ones. Made with love in Southampton.",
    url: `${siteUrl}/mini`,
    siteName: "Beautasy",
    locale: "en_GB",
    type: "website",
    // Was the site icon declared as 1200x630 when the file is 1378x1179. The
    // generated card is named here rather than inherited, because this page's
    // own openGraph block replaces the root's — see src/lib/socialCard.ts.
    images: SOCIAL_CARD_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Mini Beautasy — Handmade Kids' Clothing",
    description:
      "Gentle, handmade clothing for little ones. Made with love in Southampton.",
    // No images: with the key absent Next copies the Open Graph ones here.
  },
};

export default function MiniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
