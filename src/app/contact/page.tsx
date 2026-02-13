"use client";

import { motion } from "framer-motion";
import { MapPin, Clock, Phone, Mail, Instagram, Send } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { fadeUp, stagger } from "@/components/animations";

const contactInfo = [
  { icon: MapPin, label: "Location", value: "Southampton, Hampshire, UK" },
  { icon: Clock, label: "Hours", value: "Mon–Sat: 9am – 6pm" },
  { icon: Phone, label: "Phone", value: "By appointment" },
  { icon: Mail, label: "Email", value: "hello@beautasy.co.uk" },
  { icon: Instagram, label: "Instagram", value: "@beautasy" },
];

export default function ContactPage() {
  return (
    <>
      <Header />
      <main className="pt-24">
        {/* Hero */}
        <section className="py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={stagger}
              className="text-center mb-16"
            >
              <motion.p
                variants={fadeUp}
                custom={0}
                className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-4"
              >
                Get in Touch
              </motion.p>
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="font-serif text-4xl sm:text-5xl mb-6"
              >
                We&apos;d Love to Hear
                <br />
                <span className="italic text-lavender">From You</span>
              </motion.h2>
              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-lg text-charcoal-light max-w-lg mx-auto leading-relaxed"
              >
                Have a question about our products, need a custom order, or want to book
                an atelier appointment? Drop us a message.
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* Contact Content */}
        <section className="pb-24 md:pb-32">
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="grid grid-cols-1 lg:grid-cols-2 gap-16"
            >
              {/* Contact Form */}
              <motion.div variants={fadeUp} custom={0}>
                <h3 className="font-serif text-2xl mb-8">Send a Message</h3>
                <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm text-charcoal-light mb-2">Name</label>
                      <input
                        type="text"
                        placeholder="Your name"
                        className="w-full px-4 py-3 bg-cream-soft rounded-xl border border-lavender-soft/40 text-sm focus:outline-none focus:border-lavender transition-colors placeholder:text-charcoal-light/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-charcoal-light mb-2">Email</label>
                      <input
                        type="email"
                        placeholder="your@email.com"
                        className="w-full px-4 py-3 bg-cream-soft rounded-xl border border-lavender-soft/40 text-sm focus:outline-none focus:border-lavender transition-colors placeholder:text-charcoal-light/50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-charcoal-light mb-2">Subject</label>
                    <select className="w-full px-4 py-3 bg-cream-soft rounded-xl border border-lavender-soft/40 text-sm focus:outline-none focus:border-lavender transition-colors text-charcoal-light">
                      <option>General Enquiry</option>
                      <option>Custom Order</option>
                      <option>Atelier Appointment</option>
                      <option>Repair / Alteration</option>
                      <option>Wholesale</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-charcoal-light mb-2">Message</label>
                    <textarea
                      rows={5}
                      placeholder="Tell us what you have in mind..."
                      className="w-full px-4 py-3 bg-cream-soft rounded-xl border border-lavender-soft/40 text-sm focus:outline-none focus:border-lavender transition-colors resize-none placeholder:text-charcoal-light/50"
                    />
                  </div>

                  <button
                    type="submit"
                    className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
                  >
                    Send Message
                    <Send
                      size={16}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </button>
                </form>
              </motion.div>

              {/* Contact Info */}
              <motion.div variants={fadeUp} custom={1}>
                <h3 className="font-serif text-2xl mb-8">Find Us</h3>

                <div className="space-y-6 mb-12">
                  {contactInfo.map((item) => (
                    <div key={item.label} className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-lavender/20 flex items-center justify-center flex-shrink-0">
                        <item.icon size={18} className="text-charcoal" />
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-0.5">{item.label}</p>
                        <p className="text-sm text-charcoal-light">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Map placeholder */}
                <div className="aspect-[4/3] rounded-3xl overflow-hidden bg-lavender-bg flex items-center justify-center">
                  <div className="text-center">
                    <MapPin size={32} className="text-lavender mx-auto mb-3" />
                    <p className="text-sm text-charcoal-light">Southampton, UK</p>
                    <p className="text-xs text-charcoal-light/60 mt-1">Map coming soon</p>
                  </div>
                </div>

                {/* Quick links */}
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/shop"
                    className="px-5 py-2.5 bg-cream-soft rounded-full text-sm text-charcoal-light hover:bg-lavender/20 transition-colors"
                  >
                    Browse Shop
                  </Link>
                  <Link
                    href="/alterations"
                    className="px-5 py-2.5 bg-cream-soft rounded-full text-sm text-charcoal-light hover:bg-lavender/20 transition-colors"
                  >
                    Alterations Services
                  </Link>
                  <Link
                    href="/shop/kids"
                    className="px-5 py-2.5 bg-cream-soft rounded-full text-sm text-charcoal-light hover:bg-lavender/20 transition-colors"
                  >
                    Mini Beautasy
                  </Link>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
