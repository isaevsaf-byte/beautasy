"use client";

import { motion } from "framer-motion";
import { Scissors, Heart, Sparkles, ArrowRight, MapPin, Clock, Phone } from "lucide-react";
import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { fadeUp, fadeIn, stagger } from "@/components/animations";

const services = [
  {
    icon: Scissors,
    title: "Custom Sewing",
    description:
      "Bespoke pieces tailored exactly to your measurements and desires. From lingerie to dresses, we bring your vision to life.",
    details: ["Made-to-measure fitting", "Fabric consultation", "Design collaboration", "2–4 week turnaround"],
  },
  {
    icon: Heart,
    title: "Repairs",
    description:
      "Breathe new life into your favourite garments with careful, invisible repair work.",
    details: ["Seam repairs", "Zipper replacement", "Patching & mending", "1–2 week turnaround"],
  },
  {
    icon: Sparkles,
    title: "Alterations",
    description:
      "Perfect fit adjustments for ready-to-wear and cherished pieces. Because every body is different.",
    details: ["Taking in / letting out", "Hemming", "Bodice adjustments", "1–2 week turnaround"],
  },
];

const process = [
  { step: "01", title: "Consultation", description: "Tell us about your project — in person, by phone, or online." },
  { step: "02", title: "Design & Fabric", description: "We help you choose the perfect fabric and finalise the design." },
  { step: "03", title: "Crafting", description: "Your piece is carefully handmade in our Southampton atelier." },
  { step: "04", title: "Fitting & Finish", description: "Final adjustments to ensure a perfect fit, then it's yours." },
];

export default function AtelierPage() {
  return (
    <>
      <Header />
      <main className="pt-24">
        {/* Hero */}
        <section className="py-16 md:py-24 bg-lavender-bg">
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={stagger}
              className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"
            >
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
                  className="font-serif text-4xl sm:text-5xl leading-tight mb-6"
                >
                  Local Services
                  <br />
                  <span className="italic text-lavender">in Southampton</span>
                </motion.h2>
                <motion.p
                  variants={fadeUp}
                  custom={2}
                  className="text-lg text-charcoal-light max-w-md leading-relaxed mb-10"
                >
                  From custom sewing to careful repairs and perfect-fit alterations — our atelier is
                  your go-to place for garments that feel truly yours.
                </motion.p>

                <motion.div variants={fadeUp} custom={3} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <MapPin size={18} className="text-lavender" />
                    <p className="text-sm text-charcoal-light">Southampton, Hampshire, UK</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock size={18} className="text-lavender" />
                    <p className="text-sm text-charcoal-light">Mon–Sat: 9am – 6pm</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone size={18} className="text-lavender" />
                    <p className="text-sm text-charcoal-light">By appointment</p>
                  </div>
                </motion.div>
              </div>

              <motion.div variants={fadeIn} className="relative">
                <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-lavender-soft/40">
                  <img
                    src="https://placehold.co/800x1000/DCD0FF/4A4A4A?text=Atelier"
                    alt="Beautasy Atelier — Custom Sewing"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 1 }}
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

        {/* Services */}
        <section className="py-24 md:py-32">
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="text-center mb-16"
            >
              <motion.p
                variants={fadeUp}
                custom={0}
                className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4"
              >
                What We Offer
              </motion.p>
              <motion.h3
                variants={fadeUp}
                custom={1}
                className="font-serif text-3xl sm:text-4xl"
              >
                Our Services
              </motion.h3>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="grid grid-cols-1 md:grid-cols-3 gap-8"
            >
              {services.map((service, i) => (
                <motion.div
                  key={service.title}
                  variants={fadeUp}
                  custom={i}
                  className="bg-cream-soft rounded-3xl p-8 hover:shadow-lg hover:shadow-lavender/10 transition-shadow duration-300"
                >
                  <div className="w-12 h-12 rounded-2xl bg-lavender/30 flex items-center justify-center mb-6">
                    <service.icon size={22} className="text-charcoal" />
                  </div>
                  <h4 className="font-serif text-xl mb-3">{service.title}</h4>
                  <p className="text-sm text-charcoal-light leading-relaxed mb-6">
                    {service.description}
                  </p>
                  <ul className="space-y-2">
                    {service.details.map((detail) => (
                      <li key={detail} className="flex items-center gap-2 text-sm text-charcoal-light">
                        <span className="w-1 h-1 rounded-full bg-lavender flex-shrink-0" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Process */}
        <section className="py-24 md:py-32 bg-lavender-bg">
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="text-center mb-16"
            >
              <motion.p
                variants={fadeUp}
                custom={0}
                className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4"
              >
                How It Works
              </motion.p>
              <motion.h3
                variants={fadeUp}
                custom={1}
                className="font-serif text-3xl sm:text-4xl"
              >
                Our Process
              </motion.h3>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
            >
              {process.map((step, i) => (
                <motion.div key={step.step} variants={fadeUp} custom={i} className="text-center">
                  <p className="font-serif text-4xl text-lavender/40 mb-4">{step.step}</p>
                  <h4 className="font-medium text-lg mb-2">{step.title}</h4>
                  <p className="text-sm text-charcoal-light leading-relaxed">{step.description}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6 text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <motion.h3
                variants={fadeUp}
                custom={0}
                className="font-serif text-3xl sm:text-4xl mb-6"
              >
                Ready to get started?
              </motion.h3>
              <motion.p
                variants={fadeUp}
                custom={1}
                className="text-charcoal-light max-w-md mx-auto mb-8 leading-relaxed"
              >
                Book a consultation or drop by our atelier. We&apos;d love to hear about your project.
              </motion.p>
              <motion.div variants={fadeUp} custom={2}>
                <Link
                  href="/contact"
                  className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
                >
                  Book a Consultation
                  <ArrowRight
                    size={16}
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
