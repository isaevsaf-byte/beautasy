"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useIsClient } from "@/lib/useIsClient";

const STORAGE_KEY = "beautasy-cookie-consent";

type Choice = "granted" | "denied";

function readChoice(): Choice | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "granted" || stored === "denied" ? stored : null;
  } catch {
    return null;
  }
}

function applyChoice(choice: Choice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* private mode — the banner will simply ask again next visit */
  }
  window.gtag?.("consent", "update", {
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
    analytics_storage: choice,
  });
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
  const [choice, setChoice] = useState<Choice | null>(() =>
    typeof window === "undefined" ? null : readChoice()
  );

  const decide = (next: Choice) => {
    applyChoice(next);
    setChoice(next);
  };

  if (!isClient || choice !== null) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        role="dialog"
        aria-label="Cookie preferences"
        className="fixed bottom-0 left-0 right-0 z-[9997] md:bottom-4 md:left-4 md:right-auto md:max-w-sm"
      >
        <div className="m-3 md:m-0 rounded-2xl bg-[#FDFBF7] border border-lavender-soft/50 shadow-xl p-5">
          <p className="text-sm text-charcoal leading-relaxed mb-1 font-medium">
            Cookies
          </p>
          <p className="text-xs text-charcoal-light leading-relaxed mb-4">
            We use essential cookies to run the shop, and — only if you agree —
            analytics and advertising cookies to see what people look at.{" "}
            <Link
              href="/pages/privacy-policy"
              className="underline underline-offset-2 hover:text-charcoal transition-colors"
            >
              Privacy policy
            </Link>
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => decide("granted")}
              className="flex-1 px-4 py-2.5 rounded-full bg-lavender text-charcoal text-xs tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-colors"
            >
              Accept all
            </button>
            <button
              onClick={() => decide("denied")}
              className="flex-1 px-4 py-2.5 rounded-full border border-charcoal/20 text-charcoal text-xs tracking-wider uppercase font-medium hover:border-lavender hover:bg-lavender/10 transition-colors"
            >
              Essential only
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
