"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { fadeUp, stagger } from "@/components/animations";

const categories = [
  {
    title: "Lingerie",
    image: "https://placehold.co/600x700/E6E6FA/4A4A4A?text=Lingerie",
    description: "Delicate pieces crafted with love",
    items: ["Bralettes", "Bodysuits", "Sleepwear", "Sets"],
  },
  {
    title: "Mini Beautasy",
    subtitle: "Kids",
    image: "https://placehold.co/600x700/FFF0F5/4A4A4A?text=Kids",
    description: "Gentle comfort for little ones",
    href: "/mini",
    items: ["Dresses", "Rompers", "Accessories", "Pyjamas"],
  },
  {
    title: "Accessories & Bags",
    image: "https://placehold.co/600x700/F5F0FF/4A4A4A?text=Accessories",
    description: "Handmade finishing touches",
    items: ["Tote Bags", "Scrunchies", "Hair Accessories", "Pouches"],
  },
  {
    title: "Home Decor",
    image: "https://placehold.co/600x700/FDFBF7/4A4A4A?text=Home+Decor",
    description: "Beauty for your space",
    items: ["Cushion Covers", "Table Runners", "Napkins", "Lavender Sachets"],
  },
];

export default function ShopPage() {
  return (
    <>
      <Header />
      <main className="pt-24">
        {/* Page Hero */}
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
                Our Collections
              </motion.p>
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="font-serif text-4xl sm:text-5xl mb-6"
              >
                Browse the Shelves
              </motion.h2>
              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-lg text-charcoal-light max-w-lg mx-auto leading-relaxed"
              >
                Every piece is handmade with care in our Southampton atelier. Explore our
                collections and find something made just for you.
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* Category Cards */}
        <section className="pb-24 md:pb-32">
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="space-y-20"
            >
              {categories.map((cat, i) => (
                <motion.div
                  key={cat.title}
                  variants={fadeUp}
                  custom={i}
                  className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${
                    i % 2 === 1 ? "lg:direction-rtl" : ""
                  }`}
                >
                  {/* Image */}
                  <div className={`${i % 2 === 1 ? "lg:order-2" : ""}`}>
                    <div className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-cream-soft">
                      <img
                        src={cat.image}
                        alt={cat.title}
                        className="absolute inset-0 w-full h-full object-cover hover:scale-105 transition-transform duration-700 ease-out"
                      />
                    </div>
                  </div>

                  {/* Text */}
                  <div className={`${i % 2 === 1 ? "lg:order-1" : ""}`}>
                    <p className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-3">
                      Collection
                    </p>
                    <h3 className="font-serif text-3xl sm:text-4xl mb-2">
                      {cat.title}
                      {cat.subtitle && (
                        <span className="text-lg font-sans text-charcoal-light ml-3">
                          ({cat.subtitle})
                        </span>
                      )}
                    </h3>
                    <p className="text-charcoal-light leading-relaxed mb-8 max-w-md">
                      {cat.description}
                    </p>

                    {/* Item tags */}
                    <div className="flex flex-wrap gap-2 mb-8">
                      {cat.items.map((item) => (
                        <span
                          key={item}
                          className="px-4 py-2 bg-lavender-bg rounded-full text-sm text-charcoal-light"
                        >
                          {item}
                        </span>
                      ))}
                    </div>

                    <Link
                      href={cat.href || "#"}
                      className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
                    >
                      Explore {cat.title}
                      <ArrowRight
                        size={16}
                        className="group-hover:translate-x-1 transition-transform"
                      />
                    </Link>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
