"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scissors,
  ArrowRight,
  MapPin,
  Clock,
  Phone,
  Mail,
  Info,
  CalendarCheck,
  Ruler,
  SparkleIcon,
} from "lucide-react";
import BeautasyLogo from "@/components/BeautasyLogo";
import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { fadeUp, fadeIn, stagger } from "@/components/animations";

/* ─────────────── Data ─────────────── */

interface PriceItem {
  name: string;
  price: string;
}

interface ServiceCategory {
  id: string;
  label: string;
  items: PriceItem[];
}

const pricingCategories: ServiceCategory[] = [
  {
    id: "denim",
    label: "Denim & Trousers",
    items: [
      { name: "Shorten Jeans (Standard)", price: "£15.50" },
      { name: "Shorten Jeans (Keep Original Hem)", price: "£17.00" },
      { name: "Waist Adjustment", price: "£22.00" },
      { name: "Replace Zip", price: "£18.00" },
    ],
  },
  {
    id: "dresses",
    label: "Dresses & Skirts",
    items: [
      { name: "Day Dress Shorten", price: "from £25.00" },
      { name: "Evening / Prom Dress Shorten", price: "from £30.00" },
      { name: "Take in Sides (Resize)", price: "from £28.00" },
      { name: "Strap Adjustments", price: "£20.00" },
    ],
  },
  {
    id: "coats",
    label: "Coats & Jackets",
    items: [
      { name: "Shorten Sleeves", price: "£36.00" },
      { name: "New Zip (Coat)", price: "from £45.00" },
      { name: "Relining", price: "from £80.00" },
    ],
  },
  {
    id: "home",
    label: "Home Textiles",
    items: [
      { name: "Curtain Hemming (per panel)", price: "from £20.00" },
      { name: "Cushion Cover (custom)", price: "from £25.00" },
      { name: "Table Runner / Napkins", price: "from £18.00" },
    ],
  },
];

const steps = [
  {
    icon: CalendarCheck,
    step: "01",
    title: "Book or Visit",
    subtitle: "Southampton",
    description:
      "Drop by our atelier or book an appointment online. We&apos;ll discuss your needs over a cup of tea.",
  },
  {
    icon: Ruler,
    step: "02",
    title: "Fitting & Pinning",
    description:
      "We take precise measurements and pin your garment to visualise the perfect result together.",
  },
  {
    icon: SparkleIcon,
    step: "03",
    title: "Collection",
    subtitle: "Perfect Fit",
    description:
      "Your beautifully altered piece is ready. Try it on, smile, and take it home.",
  },
];

/* ─────────────── Components ─────────────── */

function PriceLine({ item, index }: { item: PriceItem; index: number }) {
  return (
    <motion.div
      variants={fadeUp}
      custom={index}
      className="flex items-end gap-2 py-3 group"
    >
      <span className="text-[15px] text-charcoal whitespace-nowrap">
        {item.name}
      </span>
      <span className="flex-1 border-b border-dotted border-charcoal/15 mb-1.5 group-hover:border-lavender/50 transition-colors" />
      <span className="text-[15px] font-medium text-charcoal whitespace-nowrap">
        {item.price}
      </span>
    </motion.div>
  );
}

/* ═════════════════════════════════════════════════════
   PAGE
   ═════════════════════════════════════════════════════ */

export default function AtelierPage() {
  const [activeTab, setActiveTab] = useState("denim");
  const whatsappLink = "https://wa.me/447729741116";
  const emailLink = "mailto:safkirsti@gmail.com";

  const activeCategory = pricingCategories.find((c) => c.id === activeTab)!;

  return (
    <>
      <Header />
      <main className="pt-24">
        {/* ──── Hero ──── */}
        <section className="relative py-20 md:py-28 overflow-hidden">
          {/* Background (no placeholder text overlay) */}
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FDFBF7] via-[#F3ECFF] to-[#E8DEFF]" />
            <div className="absolute -top-28 -right-24 w-[420px] h-[420px] rounded-full bg-white/45 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-[340px] h-[340px] rounded-full bg-[#FFFFFF]/35 blur-3xl" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#FDFBF7]/96 via-[#FDFBF7]/84 to-[#FDFBF7]/30" />
          </div>

          <div className="relative z-10 max-w-6xl mx-auto px-6">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={stagger}
              className="max-w-xl"
            >
              <motion.p
                variants={fadeUp}
                custom={0}
                className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4"
              >
                The Atelier
              </motion.p>
              <motion.h1
                variants={fadeUp}
                custom={1}
                className="font-serif text-4xl sm:text-5xl lg:text-[3.5rem] leading-tight mb-6"
              >
                The Perfect Fit,
                <br />
                <span className="italic text-lavender">Tailored Just For You.</span>
              </motion.h1>
              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-lg text-charcoal-light leading-relaxed mb-8 max-w-md"
              >
                Expert alterations and repairs, crafted by hand in our
                Southampton atelier. Every stitch made with care, so your
                clothes feel as good as you do.
              </motion.p>

              <motion.div
                variants={fadeUp}
                custom={3}
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
                    Mon–Sat: 9am – 6pm
                  </span>
                </div>
                <a
                  href={emailLink}
                  className="inline-flex items-center gap-2.5 text-sm text-charcoal-light hover:text-charcoal transition-colors"
                >
                  <Mail size={16} className="text-lavender" />
                  safkirsti@gmail.com
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
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 text-sm text-charcoal-light hover:text-charcoal transition-colors"
                >
                  <Phone size={16} className="text-lavender" />
                  By appointment
                </a>
              </motion.div>
            </motion.div>
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
              <motion.p
                variants={fadeUp}
                custom={0}
                className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4"
              >
                Simple & Personal
              </motion.p>
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="font-serif text-3xl sm:text-4xl"
              >
                How It Works
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
                  key={s.step}
                  variants={fadeUp}
                  custom={i}
                  className="relative text-center bg-white/70 backdrop-blur-sm rounded-3xl px-8 py-10 border border-lavender-soft/30 hover:shadow-xl hover:shadow-lavender/10 transition-all duration-500"
                >
                  {/* Step number */}
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-lavender text-charcoal w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold tracking-wide">
                    {s.step}
                  </div>

                  <div className="w-14 h-14 rounded-2xl bg-lavender/15 flex items-center justify-center mx-auto mb-5">
                    <s.icon size={26} className="text-charcoal" />
                  </div>
                  <h3 className="font-serif text-xl mb-1">{s.title}</h3>
                  {s.subtitle && (
                    <p className="text-sm text-lavender font-medium mb-3">
                      {s.subtitle}
                    </p>
                  )}
                  <p className="text-sm text-charcoal-light leading-relaxed">
                    {s.description}
                  </p>

                  {/* Connector arrow (desktop only) */}
                  {i < steps.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 -right-4 -translate-y-1/2 text-lavender/30">
                      <ArrowRight size={20} />
                    </div>
                  )}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ──── Pricing with Tabs ──── */}
        <section className="py-20 md:py-28">
          <div className="max-w-3xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="text-center mb-12"
            >
              <motion.p
                variants={fadeUp}
                custom={0}
                className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4"
              >
                Services & Pricing
              </motion.p>
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="font-serif text-3xl sm:text-4xl"
              >
                Our Price Guide
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
                    onClick={() => setActiveTab(cat.id)}
                    className={`px-5 py-2.5 rounded-full text-sm tracking-wide transition-all duration-300 ${
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

            {/* Price List */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="bg-white/60 backdrop-blur-sm border border-lavender-soft/30 rounded-3xl px-8 sm:px-10 py-8"
              >
                {/* Category header */}
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-lavender-soft/30">
                  <div className="w-9 h-9 rounded-xl bg-lavender/20 flex items-center justify-center">
                    <Scissors size={18} className="text-charcoal" />
                  </div>
                  <h3 className="font-serif text-xl">{activeCategory.label}</h3>
                </div>

                {/* Items */}
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={stagger}
                  className="divide-y divide-transparent"
                >
                  {activeCategory.items.map((item, i) => (
                    <PriceLine key={item.name} item={item} index={i} />
                  ))}
                </motion.div>
              </motion.div>
            </AnimatePresence>

            {/* ──── Disclaimer ──── */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={0}
              className="mt-8 flex gap-3 items-start bg-cream-soft rounded-2xl px-6 py-5"
            >
              <Info
                size={18}
                className="text-charcoal/30 flex-shrink-0 mt-0.5"
              />
              <p className="text-[13px] italic text-charcoal/45 leading-relaxed">
                Please note: These prices are a guide for standard materials.
                The final quote will be provided upon inspection, as delicate
                fabrics (like silk, velvet, or leather) or complex construction
                may require additional time and care.
              </p>
            </motion.div>
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
              <motion.p
                variants={fadeUp}
                custom={0}
                className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4"
              >
                Beyond Alterations
              </motion.p>
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="font-serif text-3xl sm:text-4xl"
              >
                Full Atelier Services
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
                  title: "Custom Sewing",
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
                  className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 border border-lavender-soft/30 hover:shadow-xl hover:shadow-lavender/10 transition-all duration-500"
                >
                  <h4 className="font-serif text-xl mb-3">{service.title}</h4>
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

        {/* ──── CTA ──── */}
        <section className="py-20 md:py-28">
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="relative bg-lavender/10 rounded-[2rem] px-8 sm:px-16 py-14 text-center overflow-hidden"
            >
              {/* Decorative blobs */}
              <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-lavender/10 blur-3xl" />
              <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-[#FFF0F5]/40 blur-3xl" />

              <motion.div className="relative z-10" variants={fadeIn}>
                <motion.h2
                  variants={fadeUp}
                  custom={0}
                  className="font-serif text-3xl sm:text-4xl mb-4"
                >
                  Ready for the perfect fit?
                </motion.h2>
                <motion.p
                  variants={fadeUp}
                  custom={1}
                  className="text-charcoal-light max-w-md mx-auto mb-8 leading-relaxed"
                >
                  Book a fitting appointment at our Southampton atelier or get in
                  touch to discuss your project.
                </motion.p>
                <motion.div
                  variants={fadeUp}
                  custom={2}
                  className="flex flex-col sm:flex-row items-center justify-center gap-4"
                >
                  <Link
                    href="/contact"
                    className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
                  >
                    Book a Fitting Appointment
                    <ArrowRight
                      size={16}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </Link>
                  <Link
                    href="/shop"
                    className="inline-flex items-center gap-2 px-8 py-3.5 border border-charcoal/20 text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:border-lavender hover:bg-lavender/10 transition-all duration-300"
                  >
                    Browse Shop
                  </Link>
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
