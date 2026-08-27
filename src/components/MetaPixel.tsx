"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";

export const META_PIXEL_ID = "1018486883937671";
const CONSENT_KEY = "beautasy-cookie-consent";
export const CONSENT_EVENT = "beautasy-consent-changed";

function hasConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

/** On the server there is no localStorage, so consent is never assumed. */
const noConsentOnServer = () => false;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_EVENT, onChange);
}

/**
 * Meta Pixel, loaded only once the visitor has accepted advertising cookies.
 *
 * Unlike Google's tag there is no consent-denied mode to fall back on, so the
 * script simply isn't fetched until someone says yes — and it appears the
 * moment they do, without a page reload, via the consent event the banner fires.
 *
 * Consent lives in localStorage and is announced by an event, which makes it an
 * external store rather than component state: reading it with an effect that
 * immediately calls setState renders twice on every mount. The server snapshot
 * is `false` because consent cannot be known there, which is also what keeps
 * hydration in step.
 */
export default function MetaPixel() {
  const allowed = useSyncExternalStore(subscribe, hasConsent, noConsentOnServer);

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
