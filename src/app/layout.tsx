import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Playfair_Display, Geist } from "next/font/google";
import Script from "next/script";
import CookieConsent from "@/components/CookieConsent";
import MetaPixel from "@/components/MetaPixel";
import SiteAnalytics from "@/components/SiteAnalytics";
import SkipLink from "@/components/SkipLink";
import MotionPrefs from "@/components/MotionPrefs";
import { CONSENT_KEY } from "@/lib/consent";
import { clerkEnabled } from "@/lib/clerk";
import "./globals.css";
import { SITE_URL } from "@/lib/site";
import { jsonLdScript } from "@/lib/jsonLd";
import { BUSINESS } from "@/lib/business";
import { domainVerificationTags } from "@/lib/domainVerification";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/siteCopy";

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

// The words between the headings. Geist, the face the link previews are drawn
// in (src/app/cards), so a page and its card in a Facebook feed read as one
// hand. Until 10.10 this was Inter, downloaded on every visit and never shown:
// the body asked for a variable the theme did not define, and each phone fell
// back to its own system font.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

/**
 * The page may run edge to edge on an iPhone, under the home bar and beside
 * the notch, so that env(safe-area-inset-*) means something: without
 * viewport-fit=cover every inset is 0, and the phone's "Choose a time" bar sat
 * on the home indicator. Each bar fixed to an edge pads itself by its inset;
 * the body pads its sides for a phone turned on its side. No maximum-scale:
 * pinch-zoom stays allowed (styles.test.ts).
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * What every page says about the site unless it says something of its own.
 * The words are in @/lib/siteCopy: the atelier first, because it is what pays.
 *
 * No `icons` key: the favicon and the home-screen icon are the files
 * ./icon.png and ./apple-icon.png, which Next links with a hash so browsers
 * may keep them. Naming a file here would silently override both — the
 * 138 KB picture it used to name was downloaded again on every first visit.
 */
export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // No url here. Every page without an openGraph block of its own inherits
    // this one, and with the home page's address in it a friend's link, a
    // salon's card and the privacy policy all told Facebook they were the
    // home page. The home page names its own address (./page.tsx).
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
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
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
      <MotionPrefs>{children}</MotionPrefs>
    </ClerkProvider>
  ) : (
    <MotionPrefs>{children}</MotionPrefs>
  );

  return (
    <html lang="en" className="scroll-smooth motion-reduce:scroll-auto">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationLd) }}
        />
        {/* Consent Mode v2: analytics and ads start denied and only measure once
            the visitor accepts in the cookie banner. Required for UK/EEA. The
            tags themselves load from SiteAnalytics, which keeps them out of
            the Studio. */}
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
      </head>
      <body
        className={`${playfair.variable} ${geist.variable} antialiased bg-[#FDFBF7] text-[#4A4A4A]`}
      >
        <SkipLink />
        {content}
        <MetaPixel />
        <CookieConsent />
        {/* Counts pages and where people came from. No cookies and no visitor
            id, so it sits outside the consent banner rather than behind it —
            which matters, because a banner nobody accepts measures nothing.
            The shop has taken no orders yet and there has been no way to tell
            whether that is nobody arriving or everybody leaving. The Studio is
            left out: Kristina opening it every day is not a visitor. */}
        <SiteAnalytics />
      </body>
    </html>
  );
}
