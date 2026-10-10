"use client";

import { Sparkles } from "lucide-react";

export default function ShopError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="pt-28 min-h-svh flex flex-col items-center justify-center px-6 text-center">
      {/* A drawn sparkle in the brand's colour, as on the empty shop, not an
          emoji the phone's own font would draw its own way */}
      <div className="w-16 h-16 rounded-full bg-lavender/15 flex items-center justify-center mx-auto mb-6">
        <Sparkles size={26} aria-hidden="true" className="text-lavender-ink" />
      </div>
      <h2 className="font-serif text-2xl mb-3">Couldn&apos;t load products.</h2>
      <p className="text-charcoal-light mb-8">Please try again.</p>
      <button
        type="button"
        onClick={reset}
        className="press inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover hover:shadow-lg hover:shadow-lavender/30"
      >
        Try Again
      </button>
    </main>
  );
}
