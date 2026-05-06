import type { Metadata } from "next";

const siteUrl = "https://beautasy.co.uk";

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
    images: [
      {
        url: `${siteUrl}/beautasy-icon.png`,
        width: 1200,
        height: 630,
        alt: "Mini Beautasy — Kids Collection",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mini Beautasy — Handmade Kids' Clothing",
    description:
      "Gentle, handmade clothing for little ones. Made with love in Southampton.",
    images: [`${siteUrl}/beautasy-icon.png`],
  },
};

export default function MiniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
