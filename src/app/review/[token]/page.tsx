import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { findOrderByReviewToken } from "@/lib/reviewToken";
import ReviewByTokenForm from "./ReviewByTokenForm";

export const dynamic = "force-dynamic";

// A private link — keep it out of search results
export const metadata: Metadata = {
  title: "Leave a review | Beautasy",
  robots: { index: false, follow: false },
};

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await findOrderByReviewToken(token);

  const reviewable = (order?.items ?? []).filter((item) => item.productId);
  const firstName = order?.customerName?.split(" ")[0];

  return (
    <>
      <Header />
      <main className="pt-28 min-h-[60vh]">
        <div className="max-w-2xl mx-auto px-6 py-10">
          {!order || reviewable.length === 0 ? (
            <div className="text-center py-16">
              <h1 className="font-serif text-3xl mb-4">This link has expired</h1>
              <p className="text-charcoal-light leading-relaxed mb-8">
                We couldn&apos;t find an order for this review link. If you&apos;d still like to
                share your thoughts, we&apos;d love to hear them.
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300"
              >
                Get in touch
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-3">
                Your order
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl mb-4">
                {firstName ? `${firstName}, how did we do?` : "How did we do?"}
              </h1>
              <p className="text-charcoal-light leading-relaxed mb-10">
                A few words help the next person choose their size and fabric — and they mean a
                great deal to a two-person atelier. Photos welcome.
              </p>

              <div className="space-y-10">
                {reviewable.map((item) => (
                  <section key={item.productId}>
                    <h2 className="font-serif text-xl mb-4">{item.name}</h2>
                    <ReviewByTokenForm
                      token={token}
                      productId={item.productId as string}
                      productName={item.name}
                      defaultName={firstName}
                    />
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
