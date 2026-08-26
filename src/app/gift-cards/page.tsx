import type { Metadata } from "next";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";
import GiftCardPurchase from "./GiftCardPurchase";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Gift Cards | Beautasy",
  description:
    "Give handmade. A Beautasy gift card arrives by email, keeps its remaining balance for next time, and is valid for a year.",
  alternates: { canonical: `${SITE_URL}/gift-cards` },
  openGraph: {
    title: "Beautasy Gift Cards",
    description:
      "Give handmade. Arrives by email, spendable across several orders, valid for a year.",
    url: `${SITE_URL}/gift-cards`,
    siteName: "Beautasy",
    locale: "en_GB",
    type: "website",
  },
};

export default function GiftCardsPage() {
  return (
    <>
      <HeaderWrapper />
      <main className="pt-28">
        <section className="py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-14">
              <p className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4">
                For when you can&apos;t choose the size
              </p>
              <h1 className="font-serif text-4xl sm:text-5xl mb-6">Gift Cards</h1>
              <p className="text-lg text-charcoal-light max-w-lg mx-auto leading-relaxed">
                Let them pick the piece and the fit. The card arrives by email on the day you
                choose, and whatever isn&apos;t spent stays on it for next time.
              </p>
            </div>

            <GiftCardPurchase />

            <div className="max-w-lg mx-auto mt-16 grid sm:grid-cols-3 gap-6 text-center">
              {[
                { title: "Arrives by email", body: "Instantly, or on the morning you choose." },
                { title: "Spend it in parts", body: "The balance carries over between orders." },
                { title: "A year to use it", body: "No rush — pieces are made to order anyway." },
              ].map((item) => (
                <div key={item.title}>
                  <p className="text-sm font-medium text-charcoal mb-1">{item.title}</p>
                  <p className="text-xs text-charcoal-light leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <FooterWrapper />
    </>
  );
}
