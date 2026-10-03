import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { SOCIAL_CARD_IMAGES } from "@/lib/socialCard";

const siteUrl = SITE_URL;

export const metadata: Metadata = {
  title: "Contact Beautasy — Get in Touch",
  description:
    "Call, WhatsApp or email Kristina at the Beautasy atelier in Southampton: book a fitting, send a photo for a price, or ask about a custom piece.",
  // One address however the page was reached (?utm_source=…), as /atelier has
  alternates: { canonical: `${siteUrl}/contact` },
  openGraph: {
    title: "Contact Beautasy — Get in Touch",
    description:
      "Call, WhatsApp or email Kristina at the Beautasy atelier in Southampton.",
    url: `${siteUrl}/contact`,
    siteName: "Beautasy",
    locale: "en_GB",
    type: "website",
    // This named /beautasy-icon.png and declared it 1200x630. That file is
    // 1378x1179, so the tag was a lie and chat apps cropped the logo through
    // the middle. The generated card has to be named explicitly here, because
    // an openGraph block of our own replaces the root's rather than adding to
    // it — see src/lib/socialCard.ts.
    images: SOCIAL_CARD_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Beautasy — Get in Touch",
    description:
      "Call, WhatsApp or email Kristina at the Beautasy atelier in Southampton.",
    // No images: with the key absent Next copies the Open Graph ones here.
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
