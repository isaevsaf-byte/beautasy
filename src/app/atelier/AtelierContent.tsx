"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  MapPin,
  Clock,
  Phone,
  Mail,
  CalendarCheck,
  Ruler,
  SparkleIcon,
} from "lucide-react";
import BeautasyLogo from "@/components/BeautasyLogo";
import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AtelierBookingForm from "@/components/AtelierBookingForm";
import StickyBookBar from "@/components/StickyBookBar";
import PriceFirst from "@/components/PriceFirst";
import ClosedShears from "@/components/stitch/ClosedShears";
import { fadeUp, stagger } from "@/components/animations";
import { LOCAL_SERVICES } from "@/lib/localServices";
import { pricingCategories, type PriceItem } from "@/lib/atelierPrices";
import { BUSINESS, BY_APPOINTMENT, whatsappLink as whatsappWith } from "@/lib/business";
import type { CollectionOffer } from "@/lib/collection";

/* ─────────────── Data ─────────────── */

// The price guide lives in @/lib/atelierPrices: the home page shows a few of
// its lines too

/** In order: the page shows the order by where each stands, joined by a stitch */
const steps = [
  {
    icon: CalendarCheck,
    title: "Choose a time",
    subtitle: "Southampton",
    // The workroom is in Kristina's home: there is no door to drop by, and
    // the address goes to each customer once a time is agreed
    description: `${BY_APPOINTMENT}. We'll talk through what you need over a cup of tea.`,
  },
  {
    icon: Ruler,
    title: "Fitting & pinning",
    description:
      "We take precise measurements and pin your garment to visualise the perfect result together.",
  },
  {
    icon: SparkleIcon,
    title: "Collection",
    subtitle: "Perfect fit",
    description:
      "Your beautifully altered piece is ready. Try it on, smile, and take it home.",
  },
];

/** The hero's "Choose a time", which the phone's booking bar waits to see scroll away */
const HERO_BOOK_ID = "atelier-hero-book";

/* ─────────────── Components ─────────────── */

/** One line of the price list. No entrance of its own: the lines arriving one
 *  by one made every tab switch a wait (see the price list below). */
function PriceLine({ item }: { item: PriceItem }) {
  return (
    <div className="flex items-end gap-2 py-3 group">
      {/* The name wraps and the price never does: "Shorten Jeans (Keep
          Original Hem)" on one line made the whole page wider than a 320px
          phone, which then showed it zoomed out and sliding sideways */}
      <span className="min-w-0 text-[15px] text-charcoal">
        {item.name}
      </span>
      <span
        className="leader-stitch flex-1 min-w-6 mb-1.5"
        aria-hidden="true"
      />
      <span className="text-[15px] font-medium text-charcoal whitespace-nowrap tabular-nums">
        {item.price}
      </span>
    </div>
  );
}

/* ═════════════════════════════════════════════════════
   PAGE
   ═════════════════════════════════════════════════════ */

/**
 * The atelier page as the browser runs it. `recentWork` is the row of finished
 * jobs from Our Work, read on the server by ./page.tsx and passed in whole, as
 * is `meetKristina`, her photo and a few words once the Studio has a photo.
 */
export default function AtelierContent({
  recentWork,
  reviews,
  collection = null,
  meetKristina,
}: {
  recentWork?: React.ReactNode;
  reviews?: React.ReactNode;
  /** Collect & return as the Studio has it, or null when it is switched off */
  collection?: CollectionOffer | null;
  meetKristina?: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState("denim");
  const whatsappLink = "https://wa.me/447729741116";
  const photoLink = whatsappWith("Hi Kristina, I'd like a quote. Here's the garment, and the label inside:");
  const emailLink = "mailto:hello@beautasy.co.uk";

  return (
    <>
      <Header />
      <main id="main" className="pt-28">
        {/* ──── Hero ──── */}
        <section className="relative py-20 md:py-28 overflow-hidden">
          {/* Background (no placeholder text overlay) */}
          {/* No z-index on either layer: they paint in their order anyway,
              and a z-index would make the text and logo a group of their own,
              which the logo's multiply could not see through to the wash */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FDFBF7] via-[#F3ECFF] to-[#E8DEFF]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#FDFBF7]/96 via-[#FDFBF7]/84 to-[#FDFBF7]/30" />
          </div>

          <div className="relative max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Left — Text. Painted as it is, not faded in: at opacity 0 the
                  heading waits for every script to load, and it is what a
                  visitor from Google came to read. */}
              <motion.div
                initial={false}
                animate="visible"
                variants={stagger}
                className="max-w-xl"
              >
                <motion.p
                  variants={fadeUp}
                  custom={0}
                  className="text-sm tracking-eyebrow uppercase text-charcoal-light mb-4"
                >
                  The Atelier
                </motion.p>
                <motion.h1
                  variants={fadeUp}
                  custom={1}
                  className="font-serif text-4xl sm:text-5xl lg:text-[3.5rem] leading-tight mb-6"
                >
                  {/* Two lines on a laptop, the break hidden on a phone. The
                      second line is a block of its own (inline-block): the
                      browser does not balance the words after a <br>, and on a
                      1024px screen "you." was left alone under "tailored just
                      for"; inside the block they balance, and the line never
                      starts halfway through "The perfect fit," either. */}
                  The perfect fit,{" "}
                  <br className="hidden md:inline" />
                  <span className="inline-block italic text-lavender">tailored just for you.</span>
                </motion.h1>
                <motion.p
                  variants={fadeUp}
                  custom={2}
                  className="text-lg text-charcoal-light leading-relaxed mb-8 max-w-md"
                >
                  Expert alterations and repairs by Kristina, a seamstress
                  working by hand in her Southampton atelier. Every stitch made
                  with care, so your clothes feel as good as you do.
                </motion.p>

                {/* Booking first; for the person who wants a price before a
                    time, the photo on WhatsApp right under it */}
                <motion.div variants={fadeUp} custom={3} className="mb-8">
                  <a
                    id={HERO_BOOK_ID}
                    href="#book"
                    className="topstitch group flex w-full sm:inline-flex sm:w-auto items-center justify-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover transition-[background-color,box-shadow] duration-300 hover:shadow-lg hover:shadow-lavender/30"
                  >
                    Choose a time
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </a>
                  <PriceFirst whatsapp={photoLink} className="mt-4" />
                </motion.div>

                <motion.div
                  variants={fadeUp}
                  custom={4}
                  className="flex flex-wrap gap-5"
                >
                  <div className="flex items-center gap-2.5">
                    <MapPin size={16} className="text-lavender" />
                    <span className="text-sm text-charcoal-light">
                      Southampton, UK
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Clock size={16} className="text-lavender" />
                    <span className="text-sm text-charcoal-light">
                      {BUSINESS.hours.label}
                    </span>
                  </div>
                  <a
                    href={emailLink}
                    className="inline-flex items-center gap-2.5 text-sm text-charcoal-light hover:text-charcoal transition-colors"
                  >
                    <Mail size={16} className="text-lavender" />
                    hello@beautasy.co.uk
                  </a>
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2.5 text-sm text-charcoal-light hover:text-charcoal transition-colors"
                  >
                    <BeautasyLogo size={18} />
                    WhatsApp: +44 7729 741116
                  </a>
                  <a
                    href={BUSINESS.telephoneHref}
                    className="inline-flex items-center gap-2.5 text-sm text-charcoal-light hover:text-charcoal transition-colors"
                  >
                    <Phone size={16} className="text-lavender" />
                    Call {BUSINESS.telephone}
                  </a>
                </motion.div>
              </motion.div>

              {/* Right — Atelier Logo. Painted where it stands: on a laptop it
                  is the largest thing in view, the moment Google times as
                  "loaded", and it used to wait at opacity 0 for every script
                  and then spend a second growing from 95% on the main thread
                  while the page was waking up. */}
              <div className="hidden lg:flex items-center justify-center">
                <Image
                  src="/beautasy-atelier-logo.png"
                  alt="Beautasy Alterations — Scissors, needle and measuring tape"
                  width={800}
                  height={686}
                  // Multiplied into the wash behind it: the logo is drawn on a
                  // near-white square, and its drop shadow shadowed the square.
                  // 5% brighter first: the square is not quite white.
                  className="w-[340px] xl:w-[400px] h-auto object-contain brightness-105 mix-blend-multiply"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        {/* ──── How It Works ──── */}
        <section className="py-20 md:py-28 bg-lavender-bg">
          <div className="max-w-5xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="text-center mb-14"
            >
              {/* The page keeps two of the small uppercase lines over its
                  headings: the hero's, and the gallery's name in the row of
                  work. "Simple & Personal", "Services & Pricing", "Most asked
                  for", "Beyond Alterations" and "Book an Appointment" each
                  said again what the heading under it says. */}
              <motion.h2
                variants={fadeUp}
                custom={0}
                className="font-serif text-3xl sm:text-4xl"
              >
                How it works
              </motion.h2>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={stagger}
              className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6"
            >
              {steps.map((s, i) => (
                <motion.div
                  key={s.title}
                  variants={fadeUp}
                  custom={i}
                  // Only the shadow eases on hover: transition-all also caught the
                  // opacity and transform framer moves on the entrance, and the
                  // two fought every frame. No backdrop blur — the section
                  // behind is one flat colour, so it blurred nothing at a cost.
                  // Each card is drawn over the next, so the stitch leaving it
                  // lies on top of the card it runs into (see .step-stitch-*).
                  style={{ zIndex: steps.length - i }}
                  className="relative text-center bg-white/70 rounded-3xl px-8 py-10 border border-lavender-soft/30 hover:shadow-xl hover:shadow-plum/10 transition-[box-shadow,background-color] duration-300"
                >
                  <div className="w-14 h-14 rounded-2xl bg-lavender/15 flex items-center justify-center mx-auto mb-5">
                    <s.icon size={26} className="text-charcoal" />
                  </div>
                  <h3 className="relative font-serif text-xl mb-1">
                    {s.title}
                    {/* To the next title, on a laptop */}
                    {i < steps.length - 1 && <span className="step-stitch-across" aria-hidden="true" />}
                  </h3>
                  {s.subtitle && (
                    <p className="text-sm text-lavender font-medium mb-3">
                      {s.subtitle}
                    </p>
                  )}
                  <p className="text-sm text-charcoal-light leading-relaxed">
                    {s.description}
                  </p>

                  {/* Down into the next card, on a phone */}
                  {i < steps.length - 1 && <span className="step-stitch-down" aria-hidden="true" />}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ──── Meet Kristina ──── */}
        {/* Who you will meet at the fitting, straight after how it goes */}
        {meetKristina && (
          <div className="max-w-6xl mx-auto px-6 pt-20 md:pt-24">{meetKristina}</div>
        )}

        {/* ──── Recent work ──── */}
        {/* Proof before prices: someone deciding whether to trust a stranger
            with their clothes wants to see what she has already done */}
        {recentWork && (
          <section className="pt-20 md:pt-24">
            <div className="max-w-6xl mx-auto px-6">{recentWork}</div>
          </section>
        )}

        {/* ──── What clients said ──── */}
        {reviews && (
          <section className="pt-20 md:pt-24">
            <div className="max-w-6xl mx-auto px-6">{reviews}</div>
          </section>
        )}

        {/* ──── Pricing with Tabs ──── */}
        {/* #prices is where the home page's "See all prices" lands, as the
            service pages' "see every price" lands on theirs */}
        <section id="prices" className="py-20 md:py-28 scroll-mt-24">
          <div className="max-w-3xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="text-center mb-12"
            >
              <motion.h2
                variants={fadeUp}
                custom={0}
                className="font-serif text-3xl sm:text-4xl"
              >
                Our price guide
              </motion.h2>
            </motion.div>

            {/* Tabs */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={0}
              className="mb-10"
            >
              <div className="flex flex-wrap justify-center gap-2">
                {pricingCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={activeTab === cat.id}
                    onClick={() => setActiveTab(cat.id)}
                    className={`px-5 py-2.5 rounded-chip text-sm tracking-wide transition-[background-color,color,box-shadow] duration-200 ${
                      activeTab === cat.id
                        ? "bg-lavender text-charcoal font-medium shadow-md shadow-lavender/20"
                        : "bg-cream-soft text-charcoal-light hover:bg-lavender/15 hover:text-charcoal"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Price List. Every category is on the page at once, stacked in
                the card's one grid cell with only the chosen one showing: the
                card is as tall as the longest list whichever tab is open, so
                nothing below it jumps, and a switch is one 150ms crossfade.
                It used to wait for the old list to leave, fade the new one in
                and then bring the lines in one by one — about two and a half
                seconds a tab — and the prices were served at opacity 0 until
                every script had loaded. */}
            <div className="grid bg-white/60 border border-lavender-soft/30 rounded-3xl px-8 sm:px-10 py-8">
              {pricingCategories.map((cat) => (
                <div
                  key={cat.id}
                  className={`[grid-area:1/1] transition-[opacity,visibility] duration-150 ease-out ${
                    activeTab === cat.id ? "visible opacity-100" : "invisible opacity-0"
                  }`}
                >
                  {/* Category header */}
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-lavender-soft/30">
                    {/* A gold stitch, not open scissors: nothing over the prices
                        says "cut" — the shears below stay closed */}
                    <div className="w-9 h-9 rounded-xl bg-lavender/20 flex items-center justify-center">
                      <span className="price-stitch" aria-hidden="true" />
                    </div>
                    <h3 className="font-serif text-xl">{cat.label}</h3>
                  </div>

                  {/* Items */}
                  <div className="divide-y divide-transparent">
                    {cat.items.map((item) => (
                      <PriceLine key={item.name} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* ──── What the price means ──── */}
            <ClosedShears className="mt-8" />
          </div>
        </section>

        {/* ──── Popular jobs ──── */}
        {/* Each of these has its own page answering one search. Linking to them
            from here is what lets Google find them at all. */}
        <section className="py-20 md:py-24">
          <div className="max-w-5xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="mb-10"
            >
              <motion.h2 variants={fadeUp} custom={0} className="font-serif text-3xl sm:text-4xl">
                Popular jobs, with prices
              </motion.h2>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {LOCAL_SERVICES.map((s) => (
                <Link
                  key={s.slug}
                  href={`/alterations/${s.slug}`}
                  className="group bg-white rounded-2xl border border-lavender-soft/40 p-6 hover:border-lavender transition-colors"
                >
                  <span className="block text-xs tracking-eyebrow uppercase text-charcoal-light mb-2">
                    {s.eyebrow}
                  </span>
                  <span className="font-serif text-lg leading-snug block mb-3 group-hover:text-lavender-ink transition-colors">
                    {s.h1.replace(" in Southampton", "")}
                  </span>
                  <span className="text-sm font-medium text-charcoal">{s.prices[0].price}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ──── Service Cards ──── */}
        <section className="py-20 md:py-28 bg-lavender-bg">
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="text-center mb-14"
            >
              <motion.h2
                variants={fadeUp}
                custom={0}
                className="font-serif text-3xl sm:text-4xl"
              >
                Full atelier services
              </motion.h2>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={stagger}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              {[
                {
                  title: "Custom sewing",
                  description:
                    "Bespoke pieces tailored exactly to your measurements and desires. From lingerie to dresses, we bring your vision to life.",
                  details: [
                    "Made-to-measure fitting",
                    "Fabric consultation",
                    "Design collaboration",
                    "2–4 week turnaround",
                  ],
                },
                {
                  title: "Repairs",
                  description:
                    "Breathe new life into your favourite garments with careful, invisible repair work.",
                  details: [
                    "Seam repairs",
                    "Zipper replacement",
                    "Patching & mending",
                    "1–2 week turnaround",
                  ],
                },
                {
                  title: "Alterations",
                  description:
                    "Perfect fit adjustments for ready-to-wear and cherished pieces. Because every body is different.",
                  details: [
                    "Taking in / letting out",
                    "Hemming",
                    "Bodice adjustments",
                    "1–2 week turnaround",
                  ],
                },
              ].map((service, i) => (
                <motion.div
                  key={service.title}
                  variants={fadeUp}
                  custom={i}
                  // As the step cards above: only the shadow eases, and no blur
                  // over a flat background
                  className="bg-white/70 rounded-3xl p-8 border border-lavender-soft/30 hover:shadow-xl hover:shadow-plum/10 transition-[box-shadow,background-color] duration-300"
                >
                  <h3 className="font-serif text-xl mb-3">{service.title}</h3>
                  <p className="text-sm text-charcoal-light leading-relaxed mb-6">
                    {service.description}
                  </p>
                  <ul className="space-y-2.5">
                    {service.details.map((detail) => (
                      <li
                        key={detail}
                        className="flex items-center gap-2.5 text-sm text-charcoal-light"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-lavender flex-shrink-0" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ──── Booking Form ──── */}
        <section id="book" className="py-20 md:py-28 bg-lavender-bg scroll-mt-24">
          <div className="max-w-2xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="text-center mb-12"
            >
              <motion.h2
                variants={fadeUp}
                custom={0}
                className="font-serif text-3xl sm:text-4xl"
              >
                Request a fitting
              </motion.h2>
              {collection && (
                <motion.p variants={fadeUp} custom={1} className="text-sm text-charcoal-light mt-4">
                  Can&apos;t bring it in? {collection.headline} — choose Collect &amp; return below.
                </motion.p>
              )}
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={2}
              className="bg-white/70 backdrop-blur-sm border border-lavender-soft/30 rounded-3xl p-6 sm:p-10"
            >
              <AtelierBookingForm collection={collection} />
            </motion.div>
          </div>
        </section>

        {/* No call to action after the form. The closing "perfect fit" box
            sat right under it with a "Choose a time" that led back up to the
            form the visitor had just passed, and a second shop button the
            menu already has: the page ends on the form. */}
      </main>

      {/* Google sends people who search for the atelier here, and the booking
          form is seven screens down on a phone. Once the hero's button has
          scrolled away, a bar keeps it in reach until the form is on screen. */}
      <StickyBookBar heroId={HERO_BOOK_ID} whatsapp={photoLink} />
      <Footer />
    </>
  );
}
