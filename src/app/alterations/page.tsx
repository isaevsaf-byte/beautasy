/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Ruler,
  Sparkles,
  MessageCircle,
  Send,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const pageTitle = "Clothing Alterations in Southampton | Beautasy";
const pageDescription =
  "Expert alterations and repairs in Southampton. From hems and resizing to dress adjustments, Beautasy helps your clothes fit beautifully.";
const pageUrl = "https://beautasy.co.uk/alterations";
const previewImageUrl = `${pageUrl}/opengraph-image`;

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: pageUrl,
    siteName: "Beautasy",
    type: "website",
    locale: "en_GB",
    images: [
      {
        url: previewImageUrl,
        width: 1200,
        height: 630,
        alt: "Beautasy alterations and repairs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
    images: [previewImageUrl],
  },
};

const shareText =
  "Beautasy Alterations in Southampton - expert clothing repairs and perfect-fit tailoring.";
const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(
  `${shareText} ${pageUrl}`
)}`;
const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(
  pageUrl
)}&text=${encodeURIComponent(shareText)}`;

const services = [
  {
    icon: CalendarCheck,
    title: "Quick Booking",
    description: "Book your fitting and bring your garment in for pinning.",
  },
  {
    icon: Ruler,
    title: "Perfect Fit",
    description: "Precise alterations for dresses, trousers, skirts, and more.",
  },
  {
    icon: Sparkles,
    title: "Clean Finish",
    description: "Neat, durable stitching with attention to every detail.",
  },
];

export default function AlterationsPage() {
  return (
    <>
      <Header />
      <main className="pt-24">
        <section className="py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4">
                Beautasy Alterations
              </p>
              <h1 className="font-serif text-4xl sm:text-5xl leading-tight mb-6">
                Make Every Piece
                <br />
                <span className="italic text-lavender">fit beautifully.</span>
              </h1>
              <p className="text-lg text-charcoal-light leading-relaxed mb-8 max-w-xl">
                We provide professional clothing alterations and repairs in
                Southampton. Bring your favorite pieces back to life with
                careful tailoring and a polished finish.
              </p>

              <div className="flex flex-wrap gap-3 mb-8">
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300"
                >
                  Book an Alteration
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/atelier"
                  className="inline-flex items-center gap-2 px-7 py-3.5 border border-charcoal/20 text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:border-lavender hover:bg-lavender/10 transition-all duration-300"
                >
                  Visit Full Atelier
                </Link>
              </div>

              <div className="flex flex-wrap gap-3">
                <a
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-100 text-emerald-900 rounded-full text-sm hover:bg-emerald-200 transition-colors"
                >
                  <MessageCircle size={15} />
                  Share on WhatsApp
                </a>
                <a
                  href={telegramShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-100 text-sky-900 rounded-full text-sm hover:bg-sky-200 transition-colors"
                >
                  <Send size={15} />
                  Share on Telegram
                </a>
              </div>
            </div>

            <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-lavender-soft/30">
              <img
                src="https://placehold.co/900x1100/DCD0FF/4A4A4A?text=Alterations+%26+Repairs"
                alt="Beautasy alterations and tailoring"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          </div>
        </section>

        <section className="py-16 md:py-20 bg-lavender-bg">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="font-serif text-3xl sm:text-4xl mb-10 text-center">
              Why Clients Share This Page
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {services.map((service) => (
                <div
                  key={service.title}
                  className="bg-white/80 rounded-2xl border border-lavender-soft/40 p-6"
                >
                  <div className="w-11 h-11 rounded-xl bg-lavender/20 flex items-center justify-center mb-4">
                    <service.icon size={20} className="text-charcoal" />
                  </div>
                  <h3 className="font-medium mb-2">{service.title}</h3>
                  <p className="text-sm text-charcoal-light leading-relaxed">
                    {service.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
