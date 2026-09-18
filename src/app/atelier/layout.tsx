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
    // The atelier keeps a picture of its own: it sells a different service to
    // a different person, and the shop's card says nothing about alterations.
    //
    // The height was declared as 1029. `file public/beautasy-atelier-og.jpg`
    // says 1200x1028 — one pixel out, and wrong is wrong when a scraper trusts
    // the number to reserve the space. It is still the wrong shape for a chat
    // card (1.17:1 against the 1.91:1 the apps crop to, which takes the
    // ALTERATIONS banner off the top), so this artwork wants re-exporting onto
    // a 1200x630 canvas. That is Kristina's picture to redraw, not ours.
    images: [
      {
        url: `${siteUrl}/beautasy-atelier-og.jpg`,
        width: 1200,
        height: 1028,
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
