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
  description:
    "Handmade lingerie, kids' clothing, and accessories tailored with love in Southampton, UK. Made to feel, not just wear.",
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
