"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useIsClient } from "@/lib/useIsClient";
import { EASE_OUT } from "@/components/animations";
import {
  CONSENT_REOPEN_EVENT,
  clearTrackingCookies,
  readConsent,
  writeConsent,
  type ConsentChoice,
} from "@/lib/consent";

function applyChoice(choice: ConsentChoice): void {
  window.gtag?.("consent", "update", {
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
    analytics_storage: choice,
  });
  // Storing the choice also announces it. The Meta Pixel has no consent-denied
  // mode, so it listens for that and loads (or stays away) accordingly.
  writeConsent(choice);
}

/**
 * Cookie banner wired to Google Consent Mode v2.
 *
 * GA4 and the Ads tag used to start measuring the moment the page loaded. For a
 * UK shop that's the wrong default — analytics and advertising cookies need
 * consent first — and Consent Mode v2 is also what Google now expects from
 * advertisers targeting the UK/EEA. The tags load either way; until someone
 * chooses, they run in the consent-denied mode that stores nothing.
 */
export default function CookieConsent() {
  const isClient = useIsClient();
  const [choice, setChoice] = useState<ConsentChoice | null>(() =>
    typeof window === "undefined" ? null : readConsent()
  );

  // "Cookie settings" in the footer asks for the banner again
  useEffect(() => {
    const reopen = () => setChoice(null);
    window.addEventListener(CONSENT_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, reopen);
  }, []);

  const decide = (next: ConsentChoice) => {
    const before = readConsent();
    applyChoice(next);
    setChoice(next);
    // A yes taken back: Google's tags switch to denied by themselves, but the
    // Meta Pixel has no such mode and a script can't be taken out of a page.
    // Clear what they stored and start the page again without them.
    if (before === "granted" && next === "denied") {
      clearTrackingCookies();
      window.location.reload();
    }
  };

  // AnimatePresence stays on the page and the banner comes and goes inside
  // it: returning null before it, as this did, took AnimatePresence away
  // too, so the banner vanished at once and its exit never played.
  // The bottom padding is the iPhone's home bar, now that the page runs
  // under it (viewport-fit=cover).
  return (
    <AnimatePresence>
      {isClient && choice === null && (
      <motion.div
        key="consent"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24, transition: { duration: 0.2, ease: EASE_OUT } }}
        transition={{ duration: 0.25, ease: EASE_OUT }}
        role="dialog"
        aria-label="Cookie preferences"
        className="fixed bottom-0 left-0 right-0 z-[9997] pb-[env(safe-area-inset-bottom,0px)] md:pb-0 md:bottom-4 md:left-4 md:right-auto md:max-w-sm"
      >
        {/* Short on a phone: it used to stand 249px tall over a 812px screen,
            on top of the page's heading. Both choices stay the same size. */}
        <div className="m-3 md:m-0 rounded-2xl bg-[#FDFBF7] border border-lavender-soft/50 shadow-xl p-4 md:p-5">
          <p className="text-xs text-charcoal-light leading-relaxed mb-3 md:mb-4">
            <span className="font-medium text-charcoal">Cookies.</span> We use
            essential cookies to run the shop, and — only if you agree —
            analytics and advertising cookies to see what people look at.{" "}
            <Link
              href="/pages/privacy-policy"
              className="underline underline-offset-2 hover:text-charcoal transition-colors"
            >
              Privacy policy
            </Link>
          </p>
          {/* 44px tall each, and the same press, so neither choice is the
              easier one to hit */}
          <div className="flex gap-2">
            <button
              onClick={() => decide("granted")}
              className="press flex-1 min-h-11 px-3 py-2.5 rounded-full bg-lavender text-charcoal text-xs tracking-wider uppercase font-medium hover:bg-[#CFC0F0]"
            >
              Accept all
            </button>
            <button
              onClick={() => decide("denied")}
              className="press flex-1 min-h-11 px-3 py-2.5 rounded-full border border-charcoal/20 text-charcoal text-xs tracking-wider uppercase font-medium hover:border-lavender hover:bg-lavender/10"
            >
              Essential only
            </button>
          </div>
        </div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
