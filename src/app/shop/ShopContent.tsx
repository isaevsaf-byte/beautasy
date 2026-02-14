"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AddToCartButton from "@/components/AddToCartButton";
import { fadeUp, stagger } from "@/components/animations";

interface Product {
  _id: string;
  name: string;
  price: number;
  images: string[];
  category: string;
}

const categories = [
  {
    slug: "lingerie",
    title: "Lingerie",
    image: "https://placehold.co/600x700/E6E6FA/4A4A4A?text=Lingerie",
    description: "Delicate pieces crafted with love",
    href: "/shop/lingerie",
    items: ["Bralettes", "Bodysuits", "Sleepwear", "Sets"],
  },
  {
    slug: "kids",
    title: "Mini Beautasy",
    subtitle: "Kids",
    image: "https://placehold.co/600x700/FFF0F5/4A4A4A?text=Kids",
    description: "Gentle comfort for little ones",
    href: "/shop/kids",
    items: ["Dresses", "Rompers", "Accessories", "Pyjamas"],
  },
  {
    slug: "accessories",
    title: "Accessories & Bags",
    image: "https://placehold.co/600x700/F5F0FF/4A4A4A?text=Accessories",
    description: "Handmade finishing touches",
    href: "/shop/accessories",
    items: ["Tote Bags", "Scrunchies", "Hair Accessories", "Pouches"],
  },
  {
    slug: "home",
    title: "Home Decor",
    image: "https://placehold.co/600x700/FDFBF7/4A4A4A?text=Home+Decor",
    description: "Beauty for your space",
    href: "/shop/home",
    items: ["Cushion Covers", "Table Runners", "Napkins", "Lavender Sachets"],
  },
];

// Human-friendly category name mapping
const categoryLabels: Record<string, string> = {
  lingerie: "Lingerie",
  kids: "Mini Beautasy",
  accessories: "Accessories & Bags",
  home: "Home Decor",
  mini: "Mini Beautasy",
};

export default function ShopContent({
  products,
  activeCategory,
}: {
  products: Product[];
  activeCategory?: string;
}) {
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
                Every piece is handmade with care in our Southampton atelier.
                Explore our collections and find something made just for you.
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* Category Overview */}
        <section className="pb-16">
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
                  className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center p-6 rounded-3xl transition-colors ${activeCategory &&
                      cat.slug === activeCategory.toLowerCase()
                      ? "bg-lavender/10 border border-lavender/20"
                      : ""
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

                    {cat.href ? (
                      <Link
                        href={cat.href}
                        className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
                      >
                        Explore {cat.title}
                        <ArrowRight
                          size={16}
                          className="group-hover:translate-x-1 transition-transform"
                        />
                      </Link>
                    ) : (
                      <a
                        href="#products"
                        className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
                      >
                        Shop {cat.title}
                        <ArrowRight
                          size={16}
                          className="group-hover:translate-x-1 transition-transform"
                        />
                      </a>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Products Grid */}
        <section className="py-24 md:py-32 bg-lavender-bg" id="products">
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
                Handmade with Love
              </motion.p>
              <motion.h3
                variants={fadeUp}
                custom={1}
                className="font-serif text-3xl sm:text-4xl"
              >
                Featured Products
              </motion.h3>
            </motion.div>

            {products.length > 0 ? (
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={stagger}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
              >
                {products.map((product, i) => (
                  <ProductCard key={product._id} product={product} index={i} />
                ))}
              </motion.div>
            ) : (
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={0}
                className="text-center py-16"
              >
                <div className="w-20 h-20 rounded-full bg-lavender/15 flex items-center justify-center mx-auto mb-6">
                  <span className="text-3xl">✨</span>
                </div>
                <h4 className="font-serif text-2xl mb-3">
                  {activeCategory
                    ? `${categoryLabels[activeCategory] || "This"} Collection Coming Soon`
                    : "New Collection Coming Soon"}
                </h4>
                <p className="text-charcoal-light max-w-md mx-auto leading-relaxed mb-8">
                  We&apos;re handcrafting new pieces for this collection. Check
                  back soon or get in touch to request something custom.
                </p>
                <Link
                  href="/contact"
                  className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
                >
                  Request Custom Order
                  <ArrowRight
                    size={16}
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </Link>
              </motion.div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function ProductCard({ product, index }: { product: Product; index: number }) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const availableImages =
    product.images.length > 0
      ? product.images
      : ["https://placehold.co/400x500/E6E6FA/4A4A4A?text=Product"];

  const activeImage = availableImages[activeImageIndex] ?? availableImages[0];

  return (
    <motion.div
      variants={fadeUp}
      custom={index}
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="group"
    >
      <div className="relative aspect-[4/5] rounded-2xl overflow-hidden mb-4 bg-white/60">
        <img
          src={activeImage}
          alt={product.name}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
        />
        <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-500" />
        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1">
          <p className="text-xs text-charcoal-light">{product.category}</p>
        </div>
      </div>

      {availableImages.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {availableImages.map((image, i) => (
            <button
              key={`${product._id}-image-${i}`}
              type="button"
              onClick={() => setActiveImageIndex(i)}
              className={`relative w-14 h-14 shrink-0 rounded-lg overflow-hidden border transition-colors ${
                i === activeImageIndex
                  ? "border-lavender"
                  : "border-transparent hover:border-lavender/40"
              }`}
              aria-label={`Show image ${i + 1} for ${product.name}`}
            >
              <img
                src={image}
                alt={`${product.name} thumbnail ${i + 1}`}
                className="absolute inset-0 w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <h4 className="font-serif text-lg mb-1">{product.name}</h4>
      <p className="text-charcoal-light text-sm mb-4">
        £{(product.price / 100).toFixed(2)}
      </p>

      <AddToCartButton
        id={product._id}
        name={product.name}
        price={product.price}
        image={activeImage}
      />
    </motion.div>
  );
}
