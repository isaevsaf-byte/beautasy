"use client";

import { motion } from "framer-motion";
import {
  Scissors,
  Package,
  MapPin,
  Globe,
  Heart,
  Sparkles,
  ArrowRight,
  Menu,
  X,
} from "lucide-react";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";

/* ─────────────── Animation Variants ─────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.7, ease: "easeOut" as const },
  }),
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.8, ease: "easeOut" as const },
  },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.15 } },
};

/* ─────────────── Data ─────────────── */

const navLinks = [
  { label: "Shop", href: "#shop" },
  { label: "Mini", href: "#mini" },
  { label: "Atelier", href: "#atelier" },
  { label: "Contact", href: "#contact" },
];

const categories = [
  {
    title: "Lingerie",
    image: "https://placehold.co/600x700/E6E6FA/4A4A4A?text=Lingerie",
    description: "Delicate pieces crafted with love",
  },
  {
    title: "Mini Beautasy",
    subtitle: "Kids",
    image: "https://placehold.co/600x700/FFF0F5/4A4A4A?text=Kids",
    description: "Gentle comfort for little ones",
  },
  {
    title: "Accessories & Bags",
    image: "https://placehold.co/600x700/F5F0FF/4A4A4A?text=Accessories",
    description: "Handmade finishing touches",
  },
  {
    title: "Home Decor",
    image: "https://placehold.co/600x700/FDFBF7/4A4A4A?text=Home+Decor",
    description: "Beauty for your space",
  },
];

const services = [
  {
    icon: Scissors,
    title: "Custom Sewing",
    description: "Bespoke pieces tailored exactly to your measurements and desires.",
  },
  {
    icon: Heart,
    title: "Repairs",
    description: "Breathe new life into your favourite garments with careful repair.",
  },
  {
    icon: Sparkles,
    title: "Alterations",
    description: "Perfect fit adjustments for ready-to-wear and cherished pieces.",
  },
];

/* ═════════════════════════════════════════════════════
   HEADER
   ═════════════════════════════════════════════════════ */

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[#FDFBF7]/80 border-b border-[#E6E6FA]/40"
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-charcoal p-1"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        {/* Nav left (desktop) */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.slice(0, 2).map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm tracking-widest uppercase text-charcoal/70 hover:text-charcoal transition-colors duration-300"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Logo center */}
        <a href="#" className="absolute left-1/2 -translate-x-1/2">
          <h1 className="font-serif text-2xl md:text-3xl tracking-[0.3em] text-charcoal">
            BEAUTASY
          </h1>
        </a>

        {/* Nav right (desktop) */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.slice(2).map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm tracking-widest uppercase text-charcoal/70 hover:text-charcoal transition-colors duration-300"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Spacer for mobile */}
        <div className="md:hidden w-6" />
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <motion.nav
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="md:hidden bg-cream border-t border-lavender-soft/40 px-6 pb-6"
        >
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block py-3 text-sm tracking-widest uppercase text-charcoal/70 hover:text-charcoal transition-colors"
            >
              {link.label}
            </a>
          ))}
        </motion.nav>
      )}
    </motion.header>
  );
}

/* ═════════════════════════════════════════════════════
   HERO
   ═════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section className="relative min-h-[100dvh] flex items-center pt-20">
      <div className="max-w-6xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        {/* Text */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="order-2 lg:order-1 text-center lg:text-left"
        >
          <motion.p
            variants={fadeUp}
            custom={0}
            className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-6"
          >
            Handmade in Southampton
          </motion.p>

          <motion.h2
            variants={fadeUp}
            custom={1}
            className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-tight mb-6"
          >
            Made to feel,
            <br />
            <span className="italic text-lavender">not just wear.</span>
          </motion.h2>

          <motion.p
            variants={fadeUp}
            custom={2}
            className="text-lg text-charcoal-light max-w-md mx-auto lg:mx-0 mb-10 leading-relaxed"
          >
            Handmade lingerie &amp; accessories tailored in Southampton. Every piece tells a story of craft, comfort, and care.
          </motion.p>

          <motion.div
            variants={fadeUp}
            custom={3}
            className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
          >
            <a
              href="#shop"
              className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
            >
              Shop Collection
              <ArrowRight
                size={16}
                className="group-hover:translate-x-1 transition-transform"
              />
            </a>
            <a
              href="#atelier"
              className="inline-flex items-center gap-2 px-8 py-3.5 border border-charcoal/20 text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:border-lavender hover:bg-lavender/10 transition-all duration-300"
            >
              Book Alterations
            </a>
          </motion.div>
        </motion.div>

        {/* Image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
          className="order-1 lg:order-2 relative"
        >
          <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-lavender-soft/30">
            <img
              src="https://placehold.co/800x1000/E6E6FA/4A4A4A?text=BEAUTASY"
              alt="Beautasy — Handmade lingerie"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          {/* Decorative floating badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1 }}
            className="absolute -bottom-4 -left-4 bg-white/90 backdrop-blur-sm rounded-2xl px-5 py-3 shadow-lg shadow-lavender/10 border border-lavender-soft/50"
          >
            <p className="text-xs tracking-wider uppercase text-charcoal-light">
              ✨ 100% Handmade
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════
   CATEGORY GRID ("The Shelves")
   ═════════════════════════════════════════════════════ */

function CategoryGrid() {
  return (
    <section id="shop" className="py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section heading */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.p
            variants={fadeUp}
            custom={0}
            className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4"
          >
            Our Collections
          </motion.p>
          <motion.h3
            variants={fadeUp}
            custom={1}
            className="font-serif text-3xl sm:text-4xl"
          >
            Browse the Shelves
          </motion.h3>
        </motion.div>

        {/* Grid */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {categories.map((cat, i) => (
            <motion.a
              key={cat.title}
              href="#"
              variants={fadeUp}
              custom={i}
              whileHover={{ y: -8 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="group block"
            >
              <div className="relative aspect-[6/7] rounded-2xl overflow-hidden mb-4 bg-cream-soft">
                <img
                  src={cat.image}
                  alt={cat.title}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-500" />
              </div>
              <h4 className="font-serif text-lg mb-1">
                {cat.title}
                {cat.subtitle && (
                  <span className="text-sm font-sans text-charcoal-light ml-2">
                    ({cat.subtitle})
                  </span>
                )}
              </h4>
              <p className="text-sm text-charcoal-light">{cat.description}</p>
            </motion.a>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════
   ATELIER / SERVICES SECTION
   ═════════════════════════════════════════════════════ */

function AtelierSection() {
  return (
    <section id="atelier" className="py-24 md:py-32 bg-lavender-bg">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
          className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"
        >
          {/* Left — text */}
          <div>
            <motion.p
              variants={fadeUp}
              custom={0}
              className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4"
            >
              The Atelier
            </motion.p>
            <motion.h3
              variants={fadeUp}
              custom={1}
              className="font-serif text-3xl sm:text-4xl mb-6"
            >
              Local Services
              <br />
              in Southampton
            </motion.h3>
            <motion.p
              variants={fadeUp}
              custom={2}
              className="text-charcoal-light leading-relaxed mb-10 max-w-md"
            >
              From custom sewing to careful repairs and perfect-fit alterations — our atelier is
              your go-to place for garments that feel truly yours.
            </motion.p>

            {/* Services list */}
            <div className="space-y-6 mb-10">
              {services.map((service, i) => (
                <motion.div
                  key={service.title}
                  variants={fadeUp}
                  custom={i + 3}
                  className="flex items-start gap-4"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-lavender/30 flex items-center justify-center">
                    <service.icon size={18} className="text-charcoal" />
                  </div>
                  <div>
                    <h5 className="font-medium mb-1">{service.title}</h5>
                    <p className="text-sm text-charcoal-light leading-relaxed">
                      {service.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.a
              variants={fadeUp}
              custom={6}
              href="#contact"
              className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
            >
              Visit Our Atelier
              <ArrowRight
                size={16}
                className="group-hover:translate-x-1 transition-transform"
              />
            </motion.a>
          </div>

          {/* Right — image */}
          <motion.div
            variants={fadeIn}
            className="relative"
          >
            <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-lavender-soft/40">
              <img
                src="https://placehold.co/800x1000/DCD0FF/4A4A4A?text=Atelier"
                alt="Beautasy Atelier — Custom Sewing"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
            {/* Decorative badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="absolute -bottom-4 -right-4 bg-white/90 backdrop-blur-sm rounded-2xl px-5 py-3 shadow-lg shadow-lavender/10 border border-lavender-soft/50"
            >
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-lavender" />
                <p className="text-xs tracking-wider uppercase text-charcoal-light">
                  Southampton, UK
                </p>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════
   FOOTER
   ═════════════════════════════════════════════════════ */

function Footer() {
  return (
    <footer id="contact" className="py-16 md:py-20 border-t border-lavender-soft/40">
      <div className="max-w-6xl mx-auto px-6">
        {/* Top row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
          {/* Brand */}
          <div>
            <h4 className="font-serif text-2xl tracking-[0.2em] mb-4">BEAUTASY</h4>
            <p className="text-sm text-charcoal-light leading-relaxed max-w-xs">
              Handmade lingerie, kids&apos; clothing, and accessories crafted with love in
              Southampton, UK.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h5 className="text-sm tracking-[0.2em] uppercase font-medium mb-4">
              Quick Links
            </h5>
            <ul className="space-y-3">
              {navLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-charcoal-light hover:text-charcoal transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Shipping Info */}
          <div>
            <h5 className="text-sm tracking-[0.2em] uppercase font-medium mb-4">
              Delivery
            </h5>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Globe size={16} className="text-lavender flex-shrink-0" />
                <p className="text-sm text-charcoal-light">Worldwide Shipping</p>
              </div>
              <div className="flex items-center gap-3">
                <MapPin size={16} className="text-lavender flex-shrink-0" />
                <p className="text-sm text-charcoal-light">Local Pickup Available</p>
              </div>
              <div className="flex items-center gap-3">
                <Package size={16} className="text-lavender flex-shrink-0" />
                <p className="text-sm text-charcoal-light">Careful Gift Packaging</p>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-lavender-soft/30 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-charcoal-light">
            © {new Date().getFullYear()} Beautasy. All rights reserved.
          </p>
          <p className="text-xs text-charcoal-light flex items-center gap-1">
            Made with <Heart size={12} className="text-lavender fill-lavender" /> in
            Southampton
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ═════════════════════════════════════════════════════
   MAIN PAGE
   ═════════════════════════════════════════════════════ */

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <CategoryGrid />
        <AtelierSection />
      </main>
      <Footer />
    </>
  );
}
