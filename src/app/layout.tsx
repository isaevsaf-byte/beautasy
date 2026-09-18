import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ClerkProvider } from "@clerk/nextjs";
import { Playfair_Display, Inter } from "next/font/google";
import Script from "next/script";
import CookieConsent from "@/components/CookieConsent";
import MetaPixel from "@/components/MetaPixel";
import { CONSENT_KEY } from "@/lib/consent";
import { clerkEnabled } from "@/lib/clerk";
import "./globals.css";
import { SITE_URL } from "@/lib/site";
import { BUSINESS } from "@/lib/business";
import { domainVerificationTags } from "@/lib/domainVerification";

/**
 * The brand as one schema.org entity, on every page. The atelier's
 * LocalBusiness block on /alterations points here as its parent, so search
 * engines see one Beautasy rather than a shop and an unrelated tailor.
 */
const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": BUSINESS.organizationId,
  name: BUSINESS.name,
  url: SITE_URL,
  logo: `${SITE_URL}/beautasy-logo-gold.png`,
  email: BUSINESS.email,
  telephone: BUSINESS.telephone,
  sameAs: [...BUSINESS.sameAs],
};

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
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "BEAUTASY — Handmade Lingerie & Accessories | Southampton",
    description:
      "Handmade lingerie, kids' clothing, and accessories tailored with love in Southampton, UK. Made to feel, not just wear.",
    url: SITE_URL,
    siteName: "Beautasy",
    locale: "en_GB",
    type: "website",
    // No images key here on purpose. This block used to name the site icon,
    // which is nearly square and arrived in chat apps with its top and bottom
    // cropped off. Leaving the key out lets Next fill og:image from
    // opengraph-image.tsx, which renders the card at the 1200x630 those apps
    // actually crop from.
    //
    // This works because the file and this metadata export sit in the same
    // route segment, and that is as far as it goes. A page further down that
    // exports an openGraph block replaces this one whole, images included, so
    // it has to name the card again from src/lib/socialCard.ts.
  },
  // Proof to a platform that this domain is ours, so Pins made from the shop
  // carry the Beautasy name and its analytics come back to us, and so Meta
  // will let a product catalogue hang off the Instagram account.
  verification: {
    other: domainVerificationTags(),
  },
  twitter: {
    card: "summary_large_image",
    title: "BEAUTASY — Handmade Lingerie & Accessories | Southampton",
    description:
      "Handmade lingerie, kids' clothing, and accessories tailored with love in Southampton, UK. Made to feel, not just wear.",
    // Also no images key: Next copies the Open Graph ones onto the Twitter
    // card whenever it is absent, so the generated picture is used here too.
    // Naming a file here would silently opt back out of that.
  },
};

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
        />
        {/* Google Analytics 4 */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-XSEN40QLSR"
          strategy="afterInteractive"
        />
        {/* Consent Mode v2: analytics and ads start denied and only measure once
            the visitor accepts in the cookie banner. Required for UK/EEA. */}
        <Script id="google-consent-default" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('consent', 'default', {
              ad_storage: 'denied',
              ad_user_data: 'denied',
              ad_personalization: 'denied',
              analytics_storage: 'denied',
              functionality_storage: 'granted',
              security_storage: 'granted',
              wait_for_update: 500
            });
            try {
              var stored = localStorage.getItem('${CONSENT_KEY}');
              if (stored === 'granted' || stored === 'denied') {
                gtag('consent', 'update', {
                  ad_storage: stored,
                  ad_user_data: stored,
                  ad_personalization: stored,
                  analytics_storage: stored
                });
              }
            } catch (e) {}
          `}
        </Script>
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
        <MetaPixel />
        <CookieConsent />
        {/* Counts pages and where people came from. No cookies and no visitor
            id, so it sits outside the consent banner rather than behind it —
            which matters, because a banner nobody accepts measures nothing.
            The shop has taken no orders yet and there has been no way to tell
            whether that is nobody arriving or everybody leaving. */}
        <Analytics />
      </body>
    </html>
  );
}
