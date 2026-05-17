import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Playfair_Display, Inter } from "next/font/google";
import Script from "next/script";
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
    icon: "/beautasy-icon.png",
    shortcut: "/beautasy-icon.png",
    apple: "/beautasy-icon.png",
  },
  description:
    "Handmade lingerie, kids' clothing, and accessories tailored with love in Southampton, UK. Made to feel, not just wear.",
  metadataBase: new URL("https://beautasy.co.uk"),
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
        url: "/beautasy-icon.png",
        width: 1378,
        height: 1179,
        alt: "Beautasy — Handmade Lingerie & Accessories",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BEAUTASY — Handmade Lingerie & Accessories | Southampton",
    description:
      "Handmade lingerie, kids' clothing, and accessories tailored with love in Southampton, UK. Made to feel, not just wear.",
    images: ["/beautasy-icon.png"],
  },
};

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = clerkEnabled ? (
    <ClerkProvider
      appearance={{
        variables: { colorPrimary: "#DCD0FF" },
      }}
    >
      {children}
    </ClerkProvider>
  ) : (
    children
  );

  return (
    <html lang="en" className="scroll-smooth">
      <head>
        {/* Google Analytics 4 */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-XSEN40QLSR"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-XSEN40QLSR');
            gtag('config', 'AW-18152477897');
          `}
        </Script>
      </head>
      <body
        className={`${playfair.variable} ${inter.variable} antialiased bg-[#FDFBF7] text-[#4A4A4A]`}
      >
        {content}
      </body>
    </html>
  );
}
