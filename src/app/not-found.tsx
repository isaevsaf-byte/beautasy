import type { Metadata } from "next";
import { ArrowRight, MessageCircle, Search } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { whatsappLink } from "@/lib/business";

/**
 * A page that isn't there. Old links from the Shopify days (/products/…,
 * /collections/…) are sent on in next.config.ts; anything else lands here.
 *
 * It used to be a bare card with no menu, offering only the shop and the
 * home page, under the home page's title — a dead end for the person who
 * came about an alteration, which is most people. Now it keeps the header and
 * footer, and the first two ways out are the atelier's.
 */
export const metadata: Metadata = {
  title: "Page not found | Beautasy",
  // Next marks a 404 noindex itself; said here too so it holds if this page
  // is ever rendered with another status
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main" className="pt-28">
        <section className="min-h-[70vh] flex items-center justify-center px-6 py-16">
          <div className="max-w-lg w-full text-center">
            <div className="w-20 h-20 rounded-full bg-lavender-bg flex items-center justify-center mx-auto mb-6">
              <Search size={32} aria-hidden="true" className="text-lavender" />
            </div>

            <p className="text-sm tracking-eyebrow uppercase text-charcoal-light mb-3">
              404 — Not Found
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl mb-4 text-charcoal">
              Page not found
            </h1>
            <p className="text-charcoal-light leading-relaxed mb-8">
              The page you&apos;re looking for doesn&apos;t exist or may have moved. If you came
              about an alteration, Kristina can help from here.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/atelier#book"
                className="topstitch group inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover transition-[background-color,border-color,box-shadow,color] duration-300 hover:shadow-lg hover:shadow-lavender/30"
              >
                Choose a time
                <ArrowRight size={16} aria-hidden="true" className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href={whatsappLink("Hi Kristina! I'd love to ask about an alteration.")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 border border-charcoal/20 text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:border-lavender hover:bg-lavender/10 transition-[background-color,border-color,box-shadow,color] duration-300"
              >
                <MessageCircle size={16} aria-hidden="true" />
                WhatsApp Kristina
              </a>
            </div>

            <p className="mt-8 text-sm text-charcoal-light">
              Or{" "}
              <Link href="/shop" className="text-charcoal underline underline-offset-4 decoration-charcoal/30 hover:decoration-charcoal">
                browse the shop
              </Link>
              {" · "}
              <Link href="/" className="text-charcoal underline underline-offset-4 decoration-charcoal/30 hover:decoration-charcoal">
                back home
              </Link>
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
