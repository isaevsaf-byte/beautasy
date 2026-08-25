import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

const siteUrl = SITE_URL;

export const metadata: Metadata = {
  title: "Contact Beautasy — Get in Touch",
  description:
    "Reach out via Email, WhatsApp, or Telegram. Book an atelier appointment or discuss a custom order. Southampton, UK.",
  openGraph: {
    title: "Contact Beautasy — Get in Touch",
    description:
      "Reach out via Email, WhatsApp, or Telegram. Southampton, UK.",
    url: `${siteUrl}/contact`,
    siteName: "Beautasy",
    locale: "en_GB",
    type: "website",
    images: [
      {
        url: `${siteUrl}/beautasy-icon.png`,
        width: 1200,
        height: 630,
        alt: "Contact Beautasy",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Beautasy — Get in Touch",
    description:
      "Reach out via Email, WhatsApp, or Telegram. Southampton, UK.",
    images: [`${siteUrl}/beautasy-icon.png`],
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
