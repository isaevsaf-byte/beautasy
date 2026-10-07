"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Stitched from "@/components/stitch/Stitched";
import { fadeUp, fadeIn, stagger } from "@/components/animations";
import { placeLink } from "@/lib/shelves";
import { useShelves } from "@/lib/useShelves";
import { BUSINESS, whatsappLink } from "@/lib/business";
import { Scissors, Heart, Sparkles, MapPin, Clock, Tag, MessageCircle } from "lucide-react";

/* ─────────────── Data ─────────────── */

const categories = [
  {
    title: "Lingerie",
    image: "/beautasy-logo-gold.png",
    bgClass: "bg-gradient-to-br from-[#F3ECFF] via-[#E8DEFF] to-[#DCD0FF]",
    description: "Delicate pieces crafted with love",
    href: "/shop/lingerie",
  },
  {
    title: "Mini Beautasy",
    subtitle: "Kids",
    image: "/beautasy-kids-logo.png",
    bgClass: "bg-gradient-to-br from-[#FFF5F8] via-[#FFF0F5] to-[#FFE8EF]",
    description: "Gentle comfort for little ones",
    href: "/shop/kids",
  },
  {
    title: "Accessories & Bags",
    image: "/beautasy-accessories-logo.png",
    bgClass: "bg-gradient-to-br from-[#F5F0FF] via-[#EDE5FF] to-[#E5DBFF]",
    description: "Handmade finishing touches",
    href: "/shop/accessories",
  },
  {
    title: "Home Decor",
    image: "/beautasy-home-logo.png",
    bgClass: "bg-gradient-to-br from-[#FDFBF7] via-[#F8F3ED] to-[#F3ECDF]",
    description: "Beauty for your space",
    href: "/shop/home",
  },
];

/** A row as wide as the categories it holds, so a missing one leaves no hole */
const WIDE_COLUMNS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

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
   HERO
   ═════════════════════════════════════════════════════ */

/** The first line of the chat, typed for them: the photo is what they came to send */
const WHATSAPP_PHOTO = "Hi Kristina, here's a photo of something that needs altering:";

/**
 * The atelier first. The money comes from alterations, and the page used to
 * open as a lingerie shop: "Shop Collection" filled, booking outlined, the
 * shelves before the services, and no price, phone or hours anywhere on it.
 * A person who came about a hem now sees what it costs, when Kristina works
 * and the two ways to start, before anything else; the shop is a line below.
 */
function Hero({ priceFrom }: { priceFrom?: string | null }) {
  return (
    // pt-28, as every other page's <main>: at pt-20 the first line sat under
    // the fixed header whenever the announcement bar was showing. Clipped
    // sideways at the screen's edges: the needle left in the heading's cloth
    // reaches into the margin, and on a 320px phone its box would otherwise
    // make the page a little wider than the screen
    <section className="relative min-h-[100dvh] flex items-center pt-28 pb-12 overflow-x-clip">
      <div className="max-w-6xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        {/* Text — first on a phone, and painted as it is rather than faded
            in: at opacity 0 the heading and both buttons waited for every
            script to load, and a phone showed only the logo until then. */}
        <motion.div
          variants={stagger}
          initial={false}
          animate="visible"
          className="order-1 text-center lg:text-left"
        >
          <motion.p
            variants={fadeUp}
            custom={0}
            className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-6"
          >
            Made to feel, not just wear.
          </motion.p>

          <motion.h1
            variants={fadeUp}
            custom={1}
            className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-tight mb-6"
          >
            Alterations &amp; repairs
            <br />
            <span className="italic text-lavender-ink">
              <Stitched>in Southampton</Stitched>
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={2}
            className="text-lg text-charcoal-light max-w-md mx-auto lg:mx-0 mb-6 leading-relaxed"
          >
            Hems, zips, wedding and prom dresses, curtains — altered by hand in Kristina&apos;s
            Southampton workroom. Book a fitting, or send a photo first.
          </motion.p>

          {/* The three facts a person deciding where to take a hem wants:
              what it costs, when, and where. Hours from @/lib/business, the
              price from the service pages' own lists (see ./page.tsx). */}
          <motion.ul
            variants={fadeUp}
            custom={3}
            className="space-y-2 text-sm text-charcoal mb-10 max-w-md mx-auto lg:mx-0 text-left"
          >
            {priceFrom && (
              <li className="flex items-start gap-3">
                <Tag size={16} aria-hidden="true" className="text-lavender-ink shrink-0 mt-0.5" />
                <span>Alterations from {priceFrom} · a fixed price before any work starts</span>
              </li>
            )}
            <li className="flex items-start gap-3">
              <Clock size={16} aria-hidden="true" className="text-lavender-ink shrink-0 mt-0.5" />
              <span>{BUSINESS.hours.label}</span>
            </li>
            <li className="flex items-start gap-3">
              <MapPin size={16} aria-hidden="true" className="text-lavender-ink shrink-0 mt-0.5" />
              <span>Southampton · by appointment</span>
            </li>
          </motion.ul>

          <motion.div
            variants={fadeUp}
            custom={4}
            className="flex flex-col sm:flex-row sm:flex-wrap items-center gap-4 justify-center lg:justify-start"
          >
            {/* Each button on one line from a small tablet up, and the pair
                wraps rather than squeezing beside the logo on a laptop. On a
                320px phone the long one may take two lines rather than run
                off the screen. */}
            <Link
              href="/atelier#book"
              className="topstitch group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium sm:whitespace-nowrap hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
            >
              Choose a time
              <ArrowRight
                size={16}
                className="group-hover:translate-x-1 transition-transform"
              />
            </Link>
            <a
              href={whatsappLink(WHATSAPP_PHOTO)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center justify-center gap-2 px-8 py-3.5 border border-charcoal/20 text-charcoal rounded-full text-sm text-center tracking-wider uppercase font-medium sm:whitespace-nowrap hover:border-lavender hover:bg-lavender/10 transition-all duration-300"
            >
              <MessageCircle size={16} aria-hidden="true" className="shrink-0" />
              Send a photo on WhatsApp
            </a>
          </motion.div>

          <motion.p variants={fadeUp} custom={5} className="mt-8 text-sm text-charcoal-light">
            Or{" "}
            <Link
              href="/shop"
              className="text-charcoal underline underline-offset-4 decoration-charcoal/30 hover:decoration-charcoal transition-colors"
            >
              shop handmade lingerie &amp; gifts
            </Link>
          </motion.p>
        </motion.div>

        {/* Logo Image */}
        {/* Settles into place rather than fading in: at opacity 0 the logo is
            invisible until scripts load, and it is the largest thing on the
            page — the moment Google times as "loaded". */}
        <motion.div
          initial={{ opacity: 1, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.1, ease: "easeOut" }}
          className="order-2 relative"
        >
          <div className="relative aspect-[5/4] sm:aspect-[4/5] rounded-3xl overflow-hidden bg-gradient-to-br from-[#F3ECFF] via-[#E8DEFF] to-[#DCD0FF] flex items-center justify-center">
            <Image
              src="/beautasy-logo-gold.png"
              alt="Beautasy - Handmade Lingerie & Alterations Logo"
              width={600}
              height={600}
              className="w-[250px] sm:w-[280px] lg:w-[300px] h-auto object-contain drop-shadow-lg"
              preload
              fetchPriority="high"
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
  // Only the sections with something in them — see @/lib/shelves. Until the
  // shelves are read, all four show, as they always did.
  const shelves = useShelves();
  const shownCategories = categories.filter((cat) => placeLink(cat.href, shelves) !== null);
  return (
    <section className="py-24 md:py-32">
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
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="font-serif text-3xl sm:text-4xl"
          >
            Browse the Shelves
          </motion.h2>
        </motion.div>

        {/* Grid */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className={`grid grid-cols-1 sm:grid-cols-2 ${WIDE_COLUMNS[shownCategories.length] ?? "lg:grid-cols-4"} gap-6`}
        >
          {shownCategories.map((cat, i) => (
            <motion.div
              key={cat.title}
              variants={fadeUp}
              custom={i}
              whileHover={{ y: -8 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="group block"
            >
              <Link href={cat.href || "/shop"}>
                <div className={`relative aspect-[6/7] rounded-2xl overflow-hidden mb-4 flex items-center justify-center ${cat.bgClass || "bg-cream-soft"}`}>
                  <Image
                    src={cat.image}
                    alt={cat.title}
                    width={600}
                    height={600}
                    className="w-[65%] h-auto object-contain drop-shadow-md group-hover:scale-105 transition-transform duration-700 ease-out"
                  />
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-500" />
                </div>
                <h3 className="font-serif text-lg mb-1">
                  {cat.title}
                  {cat.subtitle && (
                    <span className="text-sm font-sans text-charcoal-light ml-2">
                      ({cat.subtitle})
                    </span>
                  )}
                </h3>
                <p className="text-sm text-charcoal-light">{cat.description}</p>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* View All link */}
        <div className="text-center mt-12">
          <Link
            href="/shop"
            className="group inline-flex items-center gap-2 text-sm tracking-wider uppercase text-charcoal-light hover:text-charcoal transition-colors"
          >
            View All Collections
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════
   ATELIER / SERVICES SECTION
   ═════════════════════════════════════════════════════ */

function AtelierSection() {
  return (
    <section className="py-24 md:py-32 bg-lavender-bg">
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
            <motion.h2
              variants={fadeUp}
              custom={1}
              className="font-serif text-3xl sm:text-4xl mb-6"
            >
              Local Services
              <br />
              in Southampton
            </motion.h2>
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
                    <h3 className="font-medium mb-1">{service.title}</h3>
                    <p className="text-sm text-charcoal-light leading-relaxed">
                      {service.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div variants={fadeUp} custom={6}>
              <Link
                href="/atelier"
                className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
              >
                Atelier Services
                <ArrowRight
                  size={16}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </Link>
            </motion.div>
          </div>

          {/* Right — image */}
          <motion.div
            variants={fadeIn}
            className="relative"
          >
            <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-gradient-to-br from-[#F3ECFF] via-[#E8DEFF] to-[#DCD0FF] flex items-center justify-center">
              <Image
                src="/beautasy-atelier-logo.png"
                alt="Beautasy Atelier — Custom Sewing & Alterations"
                width={800}
                height={686}
                className="w-[65%] h-auto object-contain drop-shadow-lg"
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
   MAIN PAGE
   ═════════════════════════════════════════════════════ */

/**
 * `recentWork` is the row of the newest pieces from Our Work, and `reviews`
 * the newest kind words from /reviews — both read on the server by ./page.tsx
 * and passed in whole. `priceFrom` is the cheapest alteration, "£8", from the
 * service pages' price lists. `meetKristina` is her photo and a few words,
 * once the Studio has a photo (see @/components/MeetKristina).
 */
export default function Home({
  recentWork,
  reviews,
  priceFrom,
  meetKristina,
}: {
  recentWork?: React.ReactNode;
  reviews?: React.ReactNode;
  priceFrom?: string | null;
  meetKristina?: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main id="main">
        <Hero priceFrom={priceFrom} />
        {/* The atelier, its work and what people said about it, then the
            shop: the order the money comes in */}
        <AtelierSection />
        {/* Who does the work, straight after what the work is */}
        {meetKristina && (
          <div className="max-w-6xl mx-auto px-6 pt-24 md:pt-28">{meetKristina}</div>
        )}
        {recentWork && (
          <section className="py-24 md:py-28">
            <div className="max-w-6xl mx-auto px-6">{recentWork}</div>
          </section>
        )}
        {/* The work, then what people said about it — one block of proof */}
        {reviews && (
          <section className={recentWork ? "pb-24 md:pb-28" : "py-24 md:py-28"}>
            <div className="max-w-6xl mx-auto px-6">{reviews}</div>
          </section>
        )}
        <CategoryGrid />
      </main>
      <Footer />
    </>
  );
}
