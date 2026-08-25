import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

const siteUrl = SITE_URL;

export const metadata: Metadata = {
  title: "Beautasy Atelier | Clothing Alterations & Tailoring in Southampton",
  description:
    "Expert clothing alterations, custom sewing, and repairs at our Southampton atelier. Dresses, trousers, coats & home textiles — book a fitting today.",
  openGraph: {
    title: "Beautasy Atelier | Alterations & Tailoring",
    description:
      "Expert clothing alterations, custom sewing, and repairs in Southampton. From hems to full resizing — every stitch made with care. Book a fitting today.",
    url: `${siteUrl}/atelier`,
    siteName: "Beautasy",
    locale: "en_GB",
    type: "website",
    images: [
      {
        url: `${siteUrl}/beautasy-atelier-og.jpg`,
        width: 1200,
        height: 1029,
        alt: "Beautasy Alterations — Scissors, needle, thread and measuring tape with gold Beautasy logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Beautasy Atelier | Alterations & Tailoring",
    description:
      "Expert clothing alterations, custom sewing, and repairs in Southampton. Book a fitting today.",
    images: [`${siteUrl}/beautasy-atelier-og.jpg`],
  },
};

export default function AtelierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
