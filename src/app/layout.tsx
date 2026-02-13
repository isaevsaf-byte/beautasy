import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BEAUTASY — Handmade Lingerie & Accessories | Southampton",
  icons: {
    icon: "/beautasy-logo.png",
    shortcut: "/beautasy-logo.png",
    apple: "/beautasy-logo.png",
  },
  description:
    "Handmade lingerie, kids' clothing, and accessories tailored with love in Southampton, UK. Made to feel, not just wear.",
  metadataBase: new URL("https://www.beautasy.co.uk"),
  openGraph: {
    title: "BEAUTASY — Handmade Lingerie & Accessories | Southampton",
    description:
      "Handmade lingerie, kids' clothing, and accessories tailored with love in Southampton, UK. Made to feel, not just wear.",
    url: "https://www.beautasy.co.uk",
    siteName: "Beautasy",
    locale: "en_GB",
    type: "website",
    images: [
      {
        url: "/alterations/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Beautasy logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BEAUTASY — Handmade Lingerie & Accessories | Southampton",
    description:
      "Handmade lingerie, kids' clothing, and accessories tailored with love in Southampton, UK. Made to feel, not just wear.",
    images: ["/alterations/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${playfair.variable} ${inter.variable} antialiased bg-[#FDFBF7] text-[#4A4A4A]`}
      >
        {children}
      </body>
    </html>
  );
}
