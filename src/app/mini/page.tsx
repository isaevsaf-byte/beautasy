"use client";

import { motion } from "framer-motion";
import { ArrowRight, Star, Heart } from "lucide-react";
import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { fadeUp, stagger } from "@/components/animations";

const kidsProducts = [
  {
    title: "Cotton Dresses",
    image: "https://placehold.co/500x600/FFF0F5/4A4A4A?text=Dresses",
    description: "Soft, breathable dresses for everyday adventures",
    ages: "0–8 years",
  },
  {
    title: "Rompers & Playsuits",
    image: "https://placehold.co/500x600/E6E6FA/4A4A4A?text=Rompers",
    description: "Comfortable one-pieces for active little ones",
    ages: "0–4 years",
  },
  {
    title: "Hair Accessories",
    image: "https://placehold.co/500x600/F5F0FF/4A4A4A?text=Hair+Bows",
    description: "Handmade bows, headbands, and clips",
    ages: "All ages",
  },
  {
    title: "Pyjama Sets",
    image: "https://placehold.co/500x600/FDFBF7/4A4A4A?text=Pyjamas",
    description: "Dreamy sleepwear made from the softest fabrics",
    ages: "1–8 years",
  },
  {
    title: "Special Occasion",
    image: "https://placehold.co/500x600/FFF0F5/4A4A4A?text=Special",
    description: "Christenings, birthdays, and celebrations",
    ages: "0–8 years",
  },
  {
    title: "Matching Sets",
    image: "https://placehold.co/500x600/E6E6FA/4A4A4A?text=Matching",
    description: "Coordinated outfits for siblings and mum & mini",
    ages: "All ages",
  },
];

const features = [
  { icon: Heart, title: "Made with Love", description: "Every stitch placed with care" },
  { icon: Star, title: "Natural Fabrics", description: "Cotton, linen & gentle materials" },
];

export default function MiniPage() {
  return (
    <>
      <Header />
      <main className="pt-24">
        {/* Hero */}
        <section className="py-16 md:py-24 bg-[#FFF0F5]/30">
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
                  Mini Beautasy
                </motion.p>
                <motion.h2
                  variants={fadeUp}
                  custom={1}
                  className="font-serif text-4xl sm:text-5xl leading-tight mb-6"
                >
                  Little ones,
                  <br />
                  <span className="italic text-[#E8B4C8]">big comfort.</span>
                </motion.h2>
                <motion.p
                  variants={fadeUp}
                  custom={2}
                  className="text-lg text-charcoal-light max-w-md leading-relaxed mb-8"
                >
                  Gentle, handmade clothing for your little ones. Crafted from natural fabrics
                  with the same care and attention as our adult collections.
                </motion.p>

                <motion.div variants={fadeUp} custom={3} className="flex flex-col sm:flex-row gap-4">
                  {features.map((f) => (
                    <div key={f.title} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#FFF0F5] flex items-center justify-center">
                        <f.icon size={18} className="text-[#E8B4C8]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{f.title}</p>
                        <p className="text-xs text-charcoal-light">{f.description}</p>
                      </div>
                    </div>
                  ))}
                </motion.div>
              </div>

              <motion.div variants={fadeUp} custom={2} className="relative">
                <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-[#FFF0F5]/50">
                  <img
                    src="https://placehold.co/800x1000/FFF0F5/4A4A4A?text=Mini+Beautasy"
                    alt="Mini Beautasy — Kids Collection"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Products Grid */}
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
                For Little Ones
              </motion.p>
              <motion.h3
                variants={fadeUp}
                custom={1}
                className="font-serif text-3xl sm:text-4xl"
              >
                Our Kids Collection
              </motion.h3>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
            >
              {kidsProducts.map((product, i) => (
                <motion.div
                  key={product.title}
                  variants={fadeUp}
                  custom={i}
                  whileHover={{ y: -8 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="group"
                >
                  <Link
                    href="/shop/kids"
                    className="block relative aspect-[5/6] rounded-2xl overflow-hidden mb-4 bg-cream-soft"
                  >
                    <img
                      src={product.image}
                      alt={product.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    />
                    <div className="absolute inset-0 bg-[#E8B4C8]/0 group-hover:bg-[#E8B4C8]/10 transition-colors duration-500" />
                    {/* Age badge */}
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1">
                      <p className="text-xs text-charcoal-light">{product.ages}</p>
                    </div>
                  </Link>
                  <Link href="/shop/kids">
                    <h4 className="font-serif text-lg mb-1 hover:text-charcoal/70 transition-colors">{product.title}</h4>
                  </Link>
                  <p className="text-sm text-charcoal-light">{product.description}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 md:py-24 bg-[#FFF0F5]/30">
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
                Something special in mind?
              </motion.h3>
              <motion.p
                variants={fadeUp}
                custom={1}
                className="text-charcoal-light max-w-md mx-auto mb-8 leading-relaxed"
              >
                We love creating custom pieces for little ones. Get in touch to discuss
                your ideas.
              </motion.p>
              <motion.div variants={fadeUp} custom={2}>
                <Link
                  href="/contact"
                  className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
                >
                  Get in Touch
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
