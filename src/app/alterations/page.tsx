import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, MapPin, Phone } from "lucide-react";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";
import { LOCAL_SERVICES, CAMPAIGN_HOOK } from "@/lib/localServices";
import { SITE_URL } from "@/lib/site";
import {
  BUSINESS,
  GOOGLE_SERVICES,
  googleServiceCatalog,
  openingHoursSpecification,
  postalAddress,
} from "@/lib/business";

export const revalidate = 86400;

const TITLE = "Clothing Alterations in Southampton | Beautasy Atelier";
const DESCRIPTION =
  "Clothing alterations in Southampton: wedding dresses, school uniform, jeans, zips and curtains. Fixed prices from £8, most work back within a week.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/alterations` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/alterations`,
    siteName: "Beautasy",
    locale: "en_GB",
    type: "website",
    images: [
      {
        url: `${SITE_URL}/beautasy-atelier-og.jpg`,
        width: 1200,
        height: 1029,
        alt: "Beautasy alterations in Southampton",
      },
    ],
  },
};

export default function AlterationsHub() {
  const localBusinessLd = {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    "@id": BUSINESS.atelierId,
    name: BUSINESS.atelierName,
    description: DESCRIPTION,
    url: `${SITE_URL}/alterations`,
    image: `${SITE_URL}/beautasy-logo-gold.png`,
    telephone: BUSINESS.telephone,
    email: BUSINESS.email,
    priceRange: "££",
    address: postalAddress(),
    openingHoursSpecification: openingHoursSpecification(),
    sameAs: [...BUSINESS.sameAs],
    parentOrganization: { "@id": BUSINESS.organizationId },
    areaServed: [
      { "@type": "City", name: "Southampton" },
      { "@type": "AdministrativeArea", name: "Hampshire" },
    ],
    // The same twelve services the Business Profile lists, so the listing and
    // the site describe one business rather than two similar ones.
    hasOfferCatalog: googleServiceCatalog(SITE_URL),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd) }}
      />

      <HeaderWrapper />

      <main className="pt-24 pb-24">
        <section className="max-w-4xl mx-auto px-6">
          <p className="text-xs tracking-[0.25em] uppercase text-charcoal-light mb-5">
            Alterations · Southampton
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl leading-tight mb-7 text-balance">
            {CAMPAIGN_HOOK.title}
          </h1>
          <div className="space-y-4 max-w-2xl">
            <p className="text-charcoal-light leading-relaxed">
              Everyone has three or four of them: the dress that was a size out, the
              jeans two inches too long, the coat with the broken zip that has hung in
              the hall for two winters. They don&apos;t get thrown away and they don&apos;t get
              worn.
            </p>
            <p className="text-charcoal-light leading-relaxed">
              Beautasy is a one-woman atelier in Southampton. Everything below is
              altered by the same pair of hands, quoted before any work starts, and
              usually back with you inside a week.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-9">
            <Link
              href="/atelier#book"
              className="group inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300"
            >
              Book a fitting
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
            </Link>
            <a
              href={BUSINESS.telephoneHref}
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 border border-charcoal/20 rounded-full text-sm tracking-wider uppercase font-medium hover:border-lavender hover:bg-lavender/10 transition-all duration-300"
            >
              <Phone size={15} aria-hidden="true" />
              {BUSINESS.telephone}
            </a>
          </div>

          <p className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-7 text-sm text-charcoal-light">
            <span className="inline-flex items-center gap-2"><MapPin size={14} aria-hidden="true" /> Southampton and across Hampshire</span>
            <span className="inline-flex items-center gap-2"><Clock size={14} aria-hidden="true" /> {BUSINESS.hours.label}</span>
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-20">
          <h2 className="font-serif text-2xl sm:text-3xl mb-8">What we alter</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {LOCAL_SERVICES.map((s) => (
              <Link
                key={s.slug}
                href={`/alterations/${s.slug}`}
                className="group bg-white rounded-2xl border border-lavender-soft/40 p-6 hover:border-lavender transition-colors"
              >
                <span className="block text-xs tracking-[0.18em] uppercase text-charcoal-light mb-2">
                  {s.eyebrow}
                </span>
                <h3 className="font-serif text-xl leading-snug mb-2 group-hover:text-lavender transition-colors">
                  {s.h1.replace(" in Southampton", "")}
                </h3>
                <p className="text-sm text-charcoal-light leading-relaxed mb-4">
                  {s.intro[0].split(". ")[0]}.
                </p>
                <span className="inline-flex items-center gap-3 text-xs text-charcoal-light">
                  <span className="tabular-nums font-medium text-charcoal">
                    {s.prices[0].price}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={12} aria-hidden="true" />
                    {s.turnaround.split(".")[0]}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ──── Everything we do ──── */}
        {/* The same list, in the same words, as the Google Business Profile —
            someone who arrived from Maps should recognise what they clicked. */}
        <section className="max-w-4xl mx-auto px-6 mt-16">
          <h2 className="font-serif text-2xl sm:text-3xl mb-3">Everything we alter and tailor</h2>
          <p className="text-sm text-charcoal-light mb-7 max-w-xl leading-relaxed">
            If what you need isn&apos;t on the list, bring it in anyway — most things
            can be taken in, let out, shortened or mended.
          </p>
          <ul className="flex flex-wrap gap-2.5 list-none p-0">
            {GOOGLE_SERVICES.map((service) => (
              <li key={service.name}>
                <Link
                  href={service.path}
                  className="inline-block px-4 py-2 rounded-full border border-lavender-soft/60 bg-white text-sm text-charcoal hover:border-lavender hover:bg-lavender/10 transition-colors"
                >
                  {service.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>


        <section className="max-w-4xl mx-auto px-6 mt-16">
          <div className="bg-lavender-bg rounded-3xl p-7 sm:p-10">
            <h2 className="font-serif text-2xl mb-3">Not sure it can be saved?</h2>
            <p className="text-sm text-charcoal-light max-w-lg mb-7 leading-relaxed">
              {CAMPAIGN_HOOK.body}
            </p>
            <Link
              href="/atelier#book"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300"
            >
              Book a free fitting
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <FooterWrapper />
    </>
  );
}
