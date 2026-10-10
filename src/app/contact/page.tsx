"use client";

import { motion } from "framer-motion";
import { MapPin, Mail, ArrowRight, Phone, Clock, CalendarCheck } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { fadeUp, stagger } from "@/components/animations";
import { BUSINESS, whatsappLink } from "@/lib/business";

/** The first line of the chat, typed for them */
const WHATSAPP_HELLO = "Hi Kristina! I'd love to ask about an alteration.";

/**
 * How to reach Kristina. Most people land here wanting one of three things —
 * to book, to message, to ring — so those come first, as buttons, with the
 * hours beside them. The page used to have no phone number, no hours (they
 * were behind a Google link), no way to book at all, and a WhatsApp button
 * whose green-on-pale-green text measured 1.8:1.
 */
export default function ContactPage() {
  return (
    <>
      <Header />
      <main id="main" className="pt-28">
        {/* Hero. Painted as it is, not faded in: at opacity 0 the heading and
            the buttons under it waited for every script on the page to load
            before a phone showed them. */}
        <section className="pt-16 md:pt-24 pb-12">
          <div className="max-w-2xl mx-auto px-6">
            <motion.div
              initial={false}
              animate="visible"
              variants={stagger}
              className="text-center"
            >
              <motion.p
                variants={fadeUp}
                custom={0}
                className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4"
              >
                Contact
              </motion.p>
              <motion.h1
                variants={fadeUp}
                custom={1}
                className="font-serif text-4xl sm:text-5xl mb-6"
              >
                Get in Touch
              </motion.h1>
              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-lg text-charcoal-light max-w-lg mx-auto leading-relaxed mb-8"
              >
                Book a fitting, send Kristina a photo of what needs doing, or ask about a
                custom piece. Already left something with her? Message to check on it.
              </motion.p>

              {/* The three ways to start, as buttons a thumb can't miss */}
              <motion.div variants={fadeUp} custom={3} className="grid gap-3 sm:grid-cols-3">
                <Link
                  href="/atelier#book"
                  className="topstitch inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-lavender text-charcoal rounded-full text-sm font-medium hover:bg-[#CFC0F0] transition-colors"
                >
                  <CalendarCheck size={16} aria-hidden="true" />
                  Choose a time
                </Link>
                {/* Solid dark green, white text: 7.7:1. The old pale-green
                    text on a pale-green pill was 1.8:1 */}
                <a
                  href={whatsappLink(WHATSAPP_HELLO)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#075E54] text-white rounded-full text-sm font-medium hover:bg-[#064b43] transition-colors"
                >
                  <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp
                </a>
                <a
                  href={BUSINESS.telephoneHref}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-charcoal/20 text-charcoal rounded-full text-sm font-medium hover:border-lavender hover:bg-lavender/10 transition-colors"
                >
                  <Phone size={16} aria-hidden="true" />
                  Call
                </a>
              </motion.div>

              {/* When, and where: the hours used to be behind a Google link */}
              <motion.ul
                variants={fadeUp}
                custom={4}
                className="mt-8 inline-flex flex-col gap-2 text-left text-sm text-charcoal"
              >
                <li className="flex items-start gap-3">
                  <Clock size={16} aria-hidden="true" className="text-lavender-ink shrink-0 mt-0.5" />
                  <span>{BUSINESS.hours.label}</span>
                </li>
                <li className="flex items-start gap-3">
                  <MapPin size={16} aria-hidden="true" className="text-lavender-ink shrink-0 mt-0.5" />
                  <span>Southampton · by appointment — Kristina sends the address before your visit</span>
                </li>
              </motion.ul>
            </motion.div>
          </div>
        </section>

        {/* Every way in, spelled out */}
        <section className="pb-24 md:pb-32">
          <div className="max-w-2xl mx-auto px-6">
            <motion.div
              initial={false}
              animate="visible"
              variants={stagger}
              className="space-y-5"
            >
              {/* Phone. On these cards only the shadow eases on hover:
                  transition-all also caught the opacity and transform framer
                  moves on the entrance, and the two fought every frame. */}
              <motion.a
                variants={fadeUp}
                custom={0}
                href={BUSINESS.telephoneHref}
                className="flex items-center gap-5 bg-white/70 backdrop-blur-sm border border-lavender-soft/30 rounded-2xl px-7 py-6 hover:shadow-xl hover:shadow-lavender/10 transition-shadow duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-lavender/20 flex items-center justify-center flex-shrink-0">
                  <Phone size={22} className="text-charcoal" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-serif text-lg mb-0.5">Call Kristina</p>
                  <p className="text-sm text-charcoal-light">{BUSINESS.telephone}</p>
                </div>
                <ArrowRight
                  size={18}
                  className="text-charcoal-light group-hover:translate-x-1 group-hover:text-charcoal transition-[translate,color] duration-200 ease-out"
                />
              </motion.a>

              {/* Email */}
              <motion.a
                variants={fadeUp}
                custom={1}
                href={`mailto:${BUSINESS.email}`}
                className="flex items-center gap-5 bg-white/70 backdrop-blur-sm border border-lavender-soft/30 rounded-2xl px-7 py-6 hover:shadow-xl hover:shadow-lavender/10 transition-shadow duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-lavender/20 flex items-center justify-center flex-shrink-0">
                  <Mail size={22} className="text-charcoal" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-serif text-lg mb-0.5">Email Us</p>
                  <p className="text-sm text-charcoal-light break-all">{BUSINESS.email}</p>
                </div>
                <ArrowRight
                  size={18}
                  className="text-charcoal-light group-hover:translate-x-1 group-hover:text-charcoal transition-[translate,color] duration-200 ease-out"
                />
              </motion.a>

              {/* WhatsApp & Telegram */}
              <motion.div
                variants={fadeUp}
                custom={2}
                className="bg-white/70 backdrop-blur-sm border border-lavender-soft/30 rounded-2xl px-7 py-6"
              >
                <div className="flex items-center gap-5 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-lavender/20 flex items-center justify-center flex-shrink-0">
                    <svg
                      viewBox="0 0 24 24"
                      width={22}
                      height={22}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-charcoal"
                      aria-hidden="true"
                    >
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-serif text-lg">Message Us</p>
                    <p className="text-sm text-charcoal-light">
                      WhatsApp or Telegram — a photo of the job is the quickest way to a price
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:pl-[4.25rem]">
                  {/* Both in dark ink on their pale tints, 7.4:1 and 5.5:1;
                      the brand greens and blues as text were 1.8:1 and 3.4:1 */}
                  <a
                    href={whatsappLink(WHATSAPP_HELLO)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#25D366]/10 text-[#075E54] rounded-full text-sm font-medium hover:bg-[#25D366]/20 transition-colors duration-300"
                  >
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp
                    <span className="text-xs">{BUSINESS.telephone}</span>
                  </a>
                  <a
                    href="https://t.me/Safkristi07"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#0088cc]/10 text-[#006699] rounded-full text-sm font-medium hover:bg-[#0088cc]/20 transition-colors duration-300"
                  >
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                    </svg>
                    Telegram
                    <span className="text-xs">@Safkristi07</span>
                  </a>
                </div>
              </motion.div>

              {/* The Google listing, where the reviews are — it used to open a
                  map of the whole of Southampton. It shows no street address
                  (that is Kristina's to send), so it promises no directions */}
              <motion.a
                variants={fadeUp}
                custom={3}
                href={BUSINESS.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-5 bg-white/70 backdrop-blur-sm border border-lavender-soft/30 rounded-2xl px-7 py-6 hover:shadow-xl hover:shadow-lavender/10 transition-shadow duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-lavender/20 flex items-center justify-center flex-shrink-0">
                  <MapPin size={22} className="text-charcoal" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-serif text-lg mb-0.5">Find us on Google</p>
                  <p className="text-sm text-charcoal-light">
                    {BUSINESS.atelierName}, Southampton — reviews from clients
                  </p>
                </div>
                <ArrowRight
                  size={18}
                  className="text-charcoal-light group-hover:translate-x-1 group-hover:text-charcoal transition-[translate,color] duration-200 ease-out"
                />
              </motion.a>
            </motion.div>

            {/* Quick links */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={0}
              className="mt-12 flex flex-wrap justify-center gap-3"
            >
              <Link
                href="/atelier"
                className="px-5 py-2.5 bg-cream-soft rounded-full text-sm text-charcoal-light hover:bg-lavender/20 transition-colors"
              >
                Alterations &amp; Prices
              </Link>
              <Link
                href="/work"
                className="px-5 py-2.5 bg-cream-soft rounded-full text-sm text-charcoal-light hover:bg-lavender/20 transition-colors"
              >
                Our Work
              </Link>
              <Link
                href="/shop"
                className="px-5 py-2.5 bg-cream-soft rounded-full text-sm text-charcoal-light hover:bg-lavender/20 transition-colors"
              >
                Browse Shop
              </Link>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
