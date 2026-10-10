"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Stitched from "@/components/stitch/Stitched";
import LogoSheen from "@/components/stitch/LogoSheen";
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
    bgClass: "bg-lavender-wash",
    description: "Delicate pieces crafted with love",
    href: "/shop/lingerie",
  },
  {
    title: "Mini Beautasy",
    subtitle: "Kids",
    image: "/beautasy-kids-logo.png",
    // The palest of the lavenders, not the pink it was: pink is nowhere else
    // in the brand, and beside the lilac tiles it read as another shop's
    bgClass: "bg-gradient-to-br from-[#FBF9FF] via-[#F5F0FF] to-[#EEE7FF]",
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
    title: "Custom sewing",
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
    // make the page a little wider than the screen. At least the small
    // screen's height (svh), not the dynamic one: dvh changes as a phone's
    // address bar slides away, and the whole hero jumped with it mid-scroll
    <section className="relative min-h-svh flex items-center pt-28 pb-12 overflow-x-clip">
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
            {/* The break is for a laptop, where the two lines are the design;
                on a phone the browser balances the words itself, and a fixed
                break there left "repairs" alone on a line at some widths */}
            Alterations &amp; repairs{" "}
            <br className="hidden md:inline" />
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
              className="topstitch group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium sm:whitespace-nowrap hover:bg-lavender-hover transition-[background-color,box-shadow] duration-300 hover:shadow-lg hover:shadow-lavender/30"
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
              className="inline-flex max-w-full items-center justify-center gap-2 px-8 py-3.5 border border-charcoal/20 text-charcoal rounded-full text-sm text-center tracking-wider uppercase font-medium sm:whitespace-nowrap hover:border-lavender hover:bg-lavender/10 transition-colors duration-300"
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
        {/* Painted where it stands, with no entrance at all: it is the largest
            thing on the page — the moment Google times as "loaded" — so it
            never fades in, and the one-second settle it used to do from 97%
            ran on the main thread while the page was still waking up, just
            when a first tap needs it. */}
        <div className="order-2 relative">
          <div className="relative aspect-[5/4] sm:aspect-[4/5] rounded-3xl overflow-hidden bg-lavender-wash flex items-center justify-center">
            {/* The gold catches the light once, after the first stitch or as it
                comes into view (stitch/LogoSheen.tsx); the picture is unchanged.
                The logo file has no transparency — it is gold on a white square
                — so it is multiplied into the lavender: white takes the card's
                colour and the gold stays gold, a shade warmer. No drop shadow:
                on an opaque picture it shadows the square, not the letters. */}
            <div className="relative w-[250px] sm:w-[280px] lg:w-[300px]">
              <Image
                src="/beautasy-logo-gold.png"
                alt="Beautasy - Handmade Lingerie & Alterations Logo"
                width={600}
                height={600}
                className="w-full h-auto object-contain mix-blend-multiply"
                preload
                fetchPriority="high"
              />
              <LogoSheen />
            </div>
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
        </div>
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
        {/* Section heading. No small line over it: "Our Collections" said
            what "Browse the shelves" says. The page keeps two of those lines,
            the hero's and the gallery's name, where they add something. */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.h2
            variants={fadeUp}
            custom={0}
            className="font-serif text-3xl sm:text-4xl"
          >
            Browse the shelves
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
            // The lift on hover is CSS on the link inside, not framer on the
            // card: the card's own transition is the entrance's (fadeUp, with
            // its delay), so a card the pointer had left waited out that
            // delay and hung in the air before it came down
            <motion.div
              key={cat.title}
              variants={fadeUp}
              custom={i}
              className="group block"
            >
              <Link
                href={cat.href || "/shop"}
                className="block transition-transform duration-200 ease-out group-hover:-translate-y-1.5"
              >
                {/* Each logo is drawn on its own near-white square; multiplied
                    into the tile, the square takes the tile's colour (see the
                    hero). The section logos' squares are not quite white —
                    246 to 252, and noisier once compressed — which multiplied
                    to a faint yellowish box; 5% brighter lifts them to white
                    first and leaves the drawing all but unchanged. */}
                <div className={`relative aspect-[6/7] rounded-2xl overflow-hidden mb-4 flex items-center justify-center ${cat.bgClass || "bg-cream-soft"}`}>
                  <Image
                    src={cat.image}
                    alt={cat.title}
                    width={600}
                    height={600}
                    className="w-[65%] h-auto object-contain brightness-105 mix-blend-multiply group-hover:scale-105 transition-transform duration-300 ease-out"
                  />
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-300 ease-out" />
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
          {/* Left — text, with no small line over the heading: "The Atelier"
              repeated what the heading and the button under it say */}
          <div>
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="font-serif text-3xl sm:text-4xl mb-6"
            >
              {/* A break on a laptop only, as in the hero */}
              Local services{" "}
              <br className="hidden md:inline" />
              in Southampton
            </motion.h2>
            <motion.p
              variants={fadeUp}
              custom={1}
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
                  custom={i + 2}
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

            <motion.div variants={fadeUp} custom={5}>
              <Link
                href="/atelier"
                className="press group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover hover:shadow-lg hover:shadow-lavender/30"
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
            <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-lavender-wash flex items-center justify-center">
              <Image
                src="/beautasy-atelier-logo.png"
                alt="Beautasy Atelier — Custom Sewing & Alterations"
                width={800}
                height={686}
                // Multiplied into the wash, so its near-white square goes, and
                // lifted to white first (see the shelves below)
                className="w-[65%] h-auto object-contain brightness-105 mix-blend-multiply"
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
