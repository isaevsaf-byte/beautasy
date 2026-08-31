"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";
import {
  hasConsent,
  subscribeToConsent,
  noConsentOnServer,
} from "@/lib/consent";

export const META_PIXEL_ID = "1018486883937671";

/**
 * Meta Pixel, loaded only once the visitor has accepted advertising cookies.
 *
 * Unlike Google's tag there is no consent-denied mode to fall back on, so the
 * script simply isn't fetched until someone says yes — and it appears the
 * moment they do, without a page reload, via the consent event the banner fires.
 *
 * Consent is read straight from the store rather than mirrored into state: an
 * effect that immediately calls setState renders twice on every mount, and the
 * server snapshot of `false` is what keeps hydration in step. See @/lib/consent.
 */
export default function MetaPixel() {
  const allowed = useSyncExternalStore(
    subscribeToConsent,
    hasConsent,
    noConsentOnServer
  );

  if (!allowed) return null;

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window,document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${META_PIXEL_ID}');
        fbq('track', 'PageView');
      `}
    </Script>
  );
}
