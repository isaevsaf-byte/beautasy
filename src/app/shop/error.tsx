"use client";

export default function ShopError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="pt-28 min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-lavender/15 flex items-center justify-center mx-auto mb-6">
        <span className="text-2xl">✨</span>
      </div>
      <h2 className="font-serif text-2xl mb-3">Couldn&apos;t load products.</h2>
      <p className="text-charcoal-light mb-8">Please try again.</p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
      >
        Try Again
      </button>
    </main>
  );
}
