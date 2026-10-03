"use client";

import Script from "next/script";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { countsVisit } from "@/lib/visitCounts";
import {
  haveThirdPartyTagsStarted,
  listenForContactTaps,
  noteThirdPartyTagsStarted,
  thirdPartyTagsAllowed,
} from "@/lib/analytics";

/** Google Analytics 4, and the Google Ads account the site reports to. */
export const GA4_ID = "G-XSEN40QLSR";
export const GOOGLE_ADS_ID = "AW-18152477897";

/**
 * Vercel's visitor counter, with the Studio left out (see countsVisit). The
 * layout is a server component and cannot hand a function to this one, so
 * the filter is attached here.
 */
function dropStudio(event: BeforeSendEvent): BeforeSendEvent | null {
  return countsVisit(event.url) ? event : null;
}

/**
 * Google's tag, for Analytics and for Ads.
 *
 * `lazyOnload`: fetched once the page has loaded and the browser is idle.
 * With `afterInteractive` Next puts a high-priority preload for gtag.js in
 * the page's head, and two of those files are about 360 KB that no visitor
 * needs before they can see and tap the page. Events sent before it arrives
 * wait in dataLayer and go when it does.
 *
 * Consent is unchanged: the layout's consent-default script runs before
 * anything else and sets everything to denied (or to the visitor's stored
 * answer), exactly as it did when these lived in the layout. The ids are the
 * ones the layout used, so if both are on the page Next loads each once.
 */
function GoogleTags() {
  useEffect(() => noteThirdPartyTagsStarted(), []);
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`} strategy="lazyOnload" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA4_ID}');
          gtag('config', '${GOOGLE_ADS_ID}');
        `}
      </Script>
    </>
  );
}

/**
 * What the site measures, in one place: Vercel's counter, Google's tags, and
 * the taps on WhatsApp and the phone number.
 *
 * None of Google's or Meta's scripts run in the Studio (see
 * thirdPartyTagsAllowed), so they never see what its pages show. Decided from
 * the path while the page is still rendered on the server, so a Studio page
 * never has them in its HTML at all.
 *
 * 🚨 That does not put Kristina's Sanity login token out of their reach: it
 * lives in localStorage, which every page of www.beautasy.co.uk shares, and
 * gtag.js runs on every page but the Studio's. See thirdPartyTagsAllowed.
 */
export default function SiteAnalytics() {
  const pathname = usePathname();
  const tagsAllowed = thirdPartyTagsAllowed(pathname);

  useEffect(() => listenForContactTaps(document, () => window.location.pathname), []);

  // Scripts already running cannot be taken out of a page. Arriving in the
  // Studio without a fresh load after they started, the page is loaded again
  // and the new one starts clean (see noteThirdPartyTagsStarted).
  useEffect(() => {
    if (!tagsAllowed && haveThirdPartyTagsStarted()) window.location.reload();
  }, [tagsAllowed]);

  return (
    <>
      <Analytics beforeSend={dropStudio} />
      {tagsAllowed && <GoogleTags />}
    </>
  );
}
