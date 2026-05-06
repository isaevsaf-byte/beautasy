export default function ShopLoading() {
  return (
    <div className="pt-28">
      {/* Hero */}
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <div className="h-3 w-24 bg-lavender-soft/60 rounded-full mx-auto mb-5 animate-pulse" />
          <div className="h-10 w-64 bg-lavender-soft/60 rounded-full mx-auto mb-4 animate-pulse" />
          <div className="h-4 w-80 bg-lavender-soft/40 rounded-full mx-auto animate-pulse" />
        </div>
      </section>

      {/* Product grid skeleton */}
      <section className="py-12 md:py-16 bg-lavender-bg">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[4/5] rounded-2xl bg-lavender-soft/50 mb-4" />
                <div className="h-5 w-3/4 bg-lavender-soft/50 rounded-full mb-2" />
                <div className="h-4 w-1/3 bg-lavender-soft/40 rounded-full mb-4" />
                <div className="h-10 w-full bg-lavender-soft/40 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
