import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { ATELIER_CARD_IMAGES } from "@/lib/socialCard";

const siteUrl = SITE_URL;

export const metadata: Metadata = {
  // The work first and the name last, in the 60 characters Google shows
  // whole: the old title ran to 66, and the part cut off was "Southampton"
  title: "Alterations & Tailoring in Southampton | Beautasy Atelier",
  // One address for the page however it was reached — ?utm_source=google,
  // #book — so Google does not count the links as separate pages
  alternates: { canonical: `${siteUrl}/atelier` },
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
    // The atelier's card: Kristina's artwork on a sewn-on label beside
    // "Alterations & repairs in Southampton" and the lowest price, at the
    // 1200x630 chat apps crop from. Until 07.10.2026 this named the artwork
    // itself, 1200x1028, and the apps cut the ALTERATIONS banner off its top.
    images: ATELIER_CARD_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Beautasy Atelier | Alterations & Tailoring",
    description:
      "Expert clothing alterations, custom sewing, and repairs in Southampton. Book a fitting today.",
    images: ATELIER_CARD_IMAGES,
  },
};

export default function AtelierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
