import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock, MapPin, Phone, Mail, Tag } from "lucide-react";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";
import AtelierBookingForm from "@/components/AtelierBookingForm";
import MeetKristina from "@/components/MeetKristina";
import PriceFirst from "@/components/PriceFirst";
import StickyBookBar from "@/components/StickyBookBar";
import { stitchSouthampton } from "@/components/stitch/Stitched";
import ClosedShears from "@/components/stitch/ClosedShears";
import { LOCAL_SERVICES, CAMPAIGN_HOOK, getLocalService, seasonalNote } from "@/lib/localServices";
import { SITE_URL } from "@/lib/site";
import { getShelves } from "@/lib/getShelves";
import { stockedLinks } from "@/lib/shelves";
import { jsonLdScript } from "@/lib/jsonLd";
import { BUSINESS, BY_APPOINTMENT, openingHoursSpecification, postalAddress, whatsappLink } from "@/lib/business";
import WorkStrip from "@/components/work/WorkStrip";
import ReviewStrip from "@/components/reviews/ReviewStrip";
import { getWork } from "@/lib/getWork";
import { getReviews } from "@/lib/getReviews";
import { collectionSettings, meetKristina, nextdoorPageUrl } from "@/lib/siteSettings";
import { collectionOffer } from "@/lib/collection";
import { reviewsForTopics } from "@/lib/siteReviews";
import { piecesForService } from "@/lib/work";
import { showPiece } from "@/lib/workMedia";
import { lowestPrice } from "@/lib/siteCopy";
import { sewnCardImages } from "@/lib/socialCard";

export const revalidate = 86400;

/** The hero's "Choose a time", which the phone's booking bar waits to see scroll away */
const HERO_BOOK_ID = "service-hero-book";

export function generateStaticParams() {
  return LOCAL_SERVICES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = getLocalService(slug);
  if (!service) return { title: "Page Not Found | Beautasy" };

  const url = `${SITE_URL}/alterations/${service.slug}`;
  return {
    title: service.metaTitle,
    description: service.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: service.metaTitle,
      description: service.metaDescription,
      url,
      siteName: "Beautasy",
      locale: "en_GB",
      type: "website",
      // This page's own card: its heading, sewn, and the price its hero shows
      // (src/lib/sewnCard.tsx). Until 07.10.2026 every alteration page sent
      // Kristina's artwork, 1200x1028, and chat apps cut its top off.
      images: sewnCardImages(service.slug),
    },
    twitter: {
      card: "summary_large_image",
      title: service.metaTitle,
      description: service.metaDescription,
      images: sewnCardImages(service.slug),
    },
  };
}

export default async function LocalServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = getLocalService(slug);
  if (!service) notFound();
  // Asked alongside the rest, not after it
  const collectionAsSet = collectionSettings();
  const kristinaAsSet = meetKristina();
  const [shelves, work, reviews, nextdoorUrl] = await Promise.all([
    getShelves(),
    getWork(),
    getReviews(),
    nextdoorPageUrl(),
  ]);
  const collection = collectionOffer(await collectionAsSet);
  const kristina = await kristinaAsSet;
  // Only the shelves with something on them: a bride sent here for garters
  // used to find "Coming Soon" — see @/lib/shelves
  const fromTheShop = stockedLinks(service.shop, shelves);
  // The jobs Kristina filed under this service in Our Work: the proof beside the price
  const doneHere = piecesForService(work.pieces, service.slug).slice(0, 4).map(showPiece);
  // And what clients said: about this kind of job first, then the atelier's others
  const kindWords = reviewsForTopics(reviews, service.reviewTopics, 3);

  const url = `${SITE_URL}/alterations/${service.slug}`;

  // Three separate blocks rather than one @graph: Google reads them
  // independently, and a mistake in one doesn't invalidate the others.
  const serviceLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.serviceName,
    serviceType: service.serviceName,
    description: service.intro[0],
    url,
    areaServed: [
      { "@type": "City", name: "Southampton" },
      { "@type": "AdministrativeArea", name: "Hampshire" },
    ],
    // Points at the one business entity declared on /alterations rather than
    // describing a fresh one per page, so search engines see six services of
    // one atelier — not seven unrelated businesses.
    provider: {
      "@type": "ClothingStore",
      "@id": BUSINESS.atelierId,
      name: BUSINESS.atelierName,
      url: `${SITE_URL}/alterations`,
      telephone: BUSINESS.telephone,
      email: BUSINESS.email,
      address: postalAddress(),
      openingHoursSpecification: openingHoursSpecification(),
      sameAs: [...BUSINESS.sameAs],
    },
    // "from £18" is a floor, not a price. Publishing it as a fixed price
    // contradicts the text on the page, which is the kind of mismatch Google
    // flags — so an open-ended price becomes a minPrice specification instead.
    offers: service.prices.map((p) => {
      const amount = Number(p.price.replace(/[^0-9.]/g, ""));
      const isFrom = /from/i.test(p.price);
      return {
        "@type": "Offer",
        name: p.name,
        priceCurrency: "GBP",
        availability: "https://schema.org/InStock",
        ...(isFrom
          ? {
              priceSpecification: {
                "@type": "PriceSpecification",
                minPrice: amount,
                priceCurrency: "GBP",
              },
            }
          : { price: amount }),
      };
    }),
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: service.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Alterations", item: `${SITE_URL}/alterations` },
      { "@type": "ListItem", position: 3, name: service.h1, item: url },
    ],
  };

  const related = service.related
    .map((s) => getLocalService(s))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const seasonal = seasonalNote(service);
  // The cheapest line on this page's own price list, so the hero can't
  // promise a price the list below doesn't have
  const priceFrom = lowestPrice(service.prices);
  const whatsapp = whatsappLink(
    `Hi Kristina, I'd like a quote for ${service.serviceName.toLowerCase()} — here's the garment, and the label inside:`
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(serviceLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }}
      />

      <HeaderWrapper />

      {/* Clipped sideways at the screen's edges for the needle in the heading,
          and pt-28 as every other page's <main> (both: see the home page's
          hero) — at pt-24 the breadcrumb slipped under the fixed header
          whenever the announcement bar was showing */}
      <main id="main" className="pt-28 pb-24 overflow-x-clip">
        {/* The page in three bands, so it reads as three steps rather than
            eleven sections at one spacing: deciding (what it is, what it
            costs), proof (jobs like it, what clients said) on a full-width
            lavender band, then booking (how it goes, questions, Kristina, the
            form). Between bands mt-16/md:mt-20 or the band's own padding of
            the same; inside a band mt-14, so what belongs together sits closer. */}

        {/* ═══ Decide ═══ */}
        {/* ──── Breadcrumb ──── */}
        <nav aria-label="Breadcrumb" className="max-w-4xl mx-auto px-6 mb-8">
          <ol className="flex flex-wrap items-center gap-2 text-xs text-charcoal-light">
            <li><Link href="/" className="hover:text-lavender-ink transition-colors">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href="/alterations" className="hover:text-lavender-ink transition-colors">Alterations</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-charcoal">{service.eyebrow}</li>
          </ol>
        </nav>

        {/* ──── Hero ──── */}
        <section className="max-w-4xl mx-auto px-6">
          <p className="text-xs tracking-eyebrow uppercase text-charcoal-light mb-5">
            {service.eyebrow} · Southampton
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl leading-tight mb-5 text-balance">
            {stitchSouthampton(service.h1)}
          </h1>

          {/* What it costs and how to start, straight under the heading: on a
              phone the button used to sit below two paragraphs and the
              campaign box, a full screen down from where Google lands you */}
          {priceFrom && (
            <p className="flex items-center gap-2 mb-6 text-[15px] text-charcoal">
              <Tag size={15} aria-hidden="true" className="shrink-0 text-lavender-ink" />
              <span>
                From <span className="font-medium tabular-nums">{priceFrom}</span> ·{" "}
                <a href="#prices" className="underline underline-offset-4 decoration-charcoal/30 hover:decoration-charcoal transition-colors">
                  see every price
                </a>
              </span>
            </p>
          )}

          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <a
              id={HERO_BOOK_ID}
              href="#book"
              className="topstitch group inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover transition-colors duration-300"
            >
              Choose a time
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
            </a>
            <a
              href={BUSINESS.telephoneHref}
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 border border-charcoal/20 rounded-full text-sm tracking-wider uppercase font-medium hover:border-lavender hover:bg-lavender/10 transition-colors duration-300"
            >
              <Phone size={15} aria-hidden="true" />
              Call the atelier
            </a>
          </div>
          <PriceFirst whatsapp={whatsapp} className="mt-4 mb-9" />

          {seasonal && (
            <p className="inline-flex items-start gap-2 mb-7 px-4 py-2.5 rounded-2xl bg-lavender-bg border border-lavender-soft/60 text-sm text-charcoal">
              <Clock size={15} className="mt-0.5 shrink-0 text-lavender" aria-hidden="true" />
              {seasonal}
            </p>
          )}

          <div className="space-y-4 max-w-2xl">
            {service.intro.map((para) => (
              <p key={para.slice(0, 40)} className="text-charcoal-light leading-relaxed">
                {para}
              </p>
            ))}
          </div>

          {/* The campaign's promise, on the page people actually land on */}
          <div className="mt-8 max-w-2xl bg-lavender-bg rounded-2xl px-5 py-4 border border-lavender-soft/50">
            <p className="font-serif text-xl italic text-charcoal mb-1">{CAMPAIGN_HOOK.title}</p>
            <p className="text-sm text-charcoal-light leading-relaxed">{CAMPAIGN_HOOK.body}</p>
          </div>

          <ul className="mt-6 space-y-2 text-sm text-charcoal-light">
            <li className="flex items-center gap-2">
              <Clock size={14} aria-hidden="true" className="shrink-0" />
              {BUSINESS.hours.label}
            </li>
            <li className="flex items-start gap-2">
              <MapPin size={14} aria-hidden="true" className="shrink-0 mt-0.5" />
              {BY_APPOINTMENT}
            </li>
          </ul>
        </section>

        {/* ──── Prices ──── */}
        <section id="prices" className="max-w-4xl mx-auto px-6 mt-14 scroll-mt-24">
          <h2 className="font-serif text-2xl sm:text-3xl mb-2">Prices</h2>
          <p className="text-sm text-charcoal-light mb-7 flex items-center gap-2">
            <Clock size={14} aria-hidden="true" />
            {service.turnaround}
          </p>

          <ul className="bg-white rounded-2xl border border-lavender-soft/40 px-6 py-3">
            {service.prices.map((p) => (
              <li
                key={p.name}
                className="flex items-end gap-2 py-3.5 border-b border-charcoal/[0.07] last:border-b-0"
              >
                {/* As on /atelier: the name wraps, the price never does, and
                    the stitch keeps at least 1.5rem between them. Without
                    min-w-0 and min-w-6 a long name squeezed the stitch to
                    nothing and ran straight into its price. */}
                <span className="min-w-0 text-[15px] text-charcoal">{p.name}</span>
                <span className="leader-stitch flex-1 min-w-6 mb-1.5" aria-hidden="true" />
                <span className="text-[15px] font-medium text-charcoal whitespace-nowrap tabular-nums">
                  {p.price}
                </span>
              </li>
            ))}
          </ul>

          {/* What the price means, with the service's own word on its prices */}
          <ClosedShears pinned={service.pricedPinned} note={service.priceNote} className="mt-5" />
        </section>

        {/* ═══ Proof ═══ */}
        {/* Only when there is something to show: each strip is nothing when
            empty, and an empty band would be a lavender gap */}
        {(doneHere.length > 0 || kindWords.length > 0) && (
          <div className="mt-16 md:mt-20 bg-lavender-bg py-16 md:py-20">
            {/* ──── Done here ──── */}
            <WorkStrip
              pieces={doneHere}
              eyebrow="From our workroom"
              heading="Recent jobs like this"
              className="max-w-4xl mx-auto px-6"
            />

            {/* ──── What clients said ──── */}
            {/* Shown, never marked up: the Service and LocalBusiness blocks above
                carry no reviews — see ReviewStrip */}
            <ReviewStrip reviews={kindWords} nextdoorUrl={nextdoorUrl}
              className={`max-w-4xl mx-auto px-6 ${doneHere.length > 0 ? "mt-14" : ""}`}
            />
          </div>
        )}

        {/* ═══ Book ═══ */}

        {/* ──── How it works ──── */}
        <section className="max-w-4xl mx-auto px-6 mt-16 md:mt-20">
          <h2 className="font-serif text-2xl sm:text-3xl mb-8">How it works</h2>
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {service.steps.map((step, i) => (
              <li key={step.title} className="bg-white rounded-2xl border border-lavender-soft/40 p-6">
                <span className="block text-xs tracking-eyebrow uppercase text-lavender mb-3 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-serif text-lg mb-2">{step.title}</h3>
                <p className="text-sm text-charcoal-light leading-relaxed">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ──── FAQ ──── */}
        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="font-serif text-2xl sm:text-3xl mb-8">Questions people ask</h2>
          <div className="max-w-2xl">
            {service.faqs.map((faq) => (
              <details
                key={faq.q}
                className="group border-b border-charcoal/[0.09] py-4"
              >
                <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-[15px] font-medium marker:content-none">
                  {faq.q}
                  <span
                    aria-hidden="true"
                    className="text-lavender shrink-0 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="text-sm text-charcoal-light leading-relaxed mt-3 pr-8">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ──── Meet Kristina ──── */}
        {/* Who they will meet, just before they choose a time with her */}
        <MeetKristina content={kristina} bookHref="#book" narrow className="max-w-4xl mx-auto px-6 mt-14" />

        {/* ──── Booking ──── */}
        <section id="book" className="max-w-4xl mx-auto px-6 mt-14 scroll-mt-24">
          <div className="bg-lavender-bg rounded-3xl p-7 sm:p-10">
            <h2 className="font-serif text-2xl sm:text-3xl mb-2">Book a fitting</h2>
            <p className="text-sm text-charcoal-light mb-8 max-w-lg">
              Tell us what needs doing and when suits you. We reply by email or WhatsApp,
              usually the same day.
            </p>
            <AtelierBookingForm defaultService={service.serviceName} collection={collection} />

            <div className="flex flex-wrap gap-x-8 gap-y-3 mt-9 pt-7 border-t border-charcoal/10 text-sm text-charcoal-light">
              <span className="inline-flex items-center gap-2">
                <MapPin size={14} aria-hidden="true" /> Southampton, UK
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock size={14} aria-hidden="true" /> {BUSINESS.hours.label}
              </span>
              <a href={BUSINESS.telephoneHref} className="inline-flex items-center gap-2 hover:text-lavender-ink transition-colors">
                <Phone size={14} aria-hidden="true" /> {BUSINESS.telephone}
              </a>
              <a href={`mailto:${BUSINESS.email}`} className="inline-flex items-center gap-2 hover:text-lavender-ink transition-colors">
                <Mail size={14} aria-hidden="true" /> {BUSINESS.email}
              </a>
            </div>
          </div>
        </section>

        {/* ──── From the shop ──── */}
        {/* The atelier brings people in; the handmade pieces are what they
            should leave knowing about. Nothing here is a sale pitch — each link
            says why the piece belongs next to this job. */}
        {fromTheShop.length > 0 && (
        <section className="max-w-4xl mx-auto px-6 mt-14">
          <p className="text-xs tracking-eyebrow uppercase text-charcoal-light mb-2">Made in the same room</p>
          <h2 className="font-serif text-2xl mb-6">While you&apos;re here</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {fromTheShop.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group bg-white rounded-2xl border border-lavender-soft/40 p-5 hover:border-lavender transition-colors"
              >
                <span className="font-serif text-lg leading-snug block mb-1.5 group-hover:text-lavender-ink transition-colors">
                  {item.label}
                </span>
                <span className="text-sm text-charcoal-light leading-relaxed block">{item.note}</span>
              </Link>
            ))}
          </div>
        </section>
        )}

        {/* ──── Related ──── */}
        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="font-serif text-2xl mb-6">Also done here</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/alterations/${r.slug}`}
                className="group bg-white rounded-2xl border border-lavender-soft/40 p-5 hover:border-lavender transition-colors"
              >
                <span className="block text-xs tracking-eyebrow uppercase text-charcoal-light mb-2">
                  {r.eyebrow}
                </span>
                <span className="font-serif text-lg leading-snug block group-hover:text-lavender-ink transition-colors">
                  {r.h1.replace(" in Southampton", "")}
                </span>
              </Link>
            ))}
            <Link
              href="/atelier"
              className="group bg-white rounded-2xl border border-lavender-soft/40 p-5 hover:border-lavender transition-colors"
            >
              <span className="block text-xs tracking-eyebrow uppercase text-charcoal-light mb-2">
                Everything
              </span>
              <span className="font-serif text-lg leading-snug block group-hover:text-lavender-ink transition-colors">
                Full atelier services &amp; price list
              </span>
            </Link>
          </div>
        </section>
      </main>

      <StickyBookBar heroId={HERO_BOOK_ID} whatsapp={whatsapp} />
      <FooterWrapper />
    </>
  );
}
