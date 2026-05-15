"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X, ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
/* eslint-disable @next/next/no-img-element */
import AddToCartButton from "@/components/AddToCartButton";
import WishlistButton from "@/components/WishlistButton";
import { fadeUp, stagger } from "@/components/animations";

interface Product {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  category: string;
  subcategory?: string;
  availableSizes: string[];
  collection?: { name: string; slug: string } | null;
}

interface CategoryItem {
  label: string;
  slug: string;
}

const categories = [
  {
    slug: "lingerie",
    title: "Lingerie",
    image: "/beautasy-logo-gold.png",
    bgClass: "bg-gradient-to-br from-[#F3ECFF] via-[#E8DEFF] to-[#DCD0FF]",
    description: "Delicate pieces crafted with love",
    href: "/shop/lingerie",
    items: [
      { label: "Bras", slug: "bras" },
      { label: "Knickers", slug: "knickers" },
      { label: "Belts", slug: "belts" },
      { label: "Garters", slug: "garters" },
      { label: "Sleeping Masks", slug: "sleeping-masks" },
      { label: "Sets", slug: "sets" },
    ] as CategoryItem[],
  },
  {
    slug: "kids",
    title: "Mini Beautasy",
    subtitle: "Kids",
    image: "/beautasy-kids-logo.png",
    bgClass: "bg-gradient-to-br from-[#FFF5F8] via-[#FFF0F5] to-[#FFE8EF]",
    description: "Gentle comfort for little ones",
    href: "/shop/kids",
    items: [
      { label: "Kids' Underwear", slug: "underwear" },
      { label: "Pyjamas", slug: "pyjamas" },
      { label: "Blankets", slug: "blankets" },
      { label: "Muslin Cloths & Bibs", slug: "muslin-cloths" },
      { label: "Kids' Accessories", slug: "accessories" },
    ] as CategoryItem[],
  },
  {
    slug: "accessories",
    title: "Accessories & Bags",
    image: "/beautasy-accessories-logo.png",
    bgClass: "bg-gradient-to-br from-[#F5F0FF] via-[#EDE5FF] to-[#E5DBFF]",
    description: "Handmade finishing touches",
    href: "/shop/accessories",
    items: [
      { label: "Hair Accessories", slug: "hair-accessories" },
      { label: "Pouches", slug: "pouches" },
      { label: "Organisers", slug: "organisers" },
    ] as CategoryItem[],
  },
  {
    slug: "home",
    title: "Home Decor",
    image: "/beautasy-home-logo.png",
    bgClass: "bg-gradient-to-br from-[#FDFBF7] via-[#F8F3ED] to-[#F3ECDF]",
    description: "Beauty for your space",
    href: "/shop/home",
    items: [
      { label: "Cushion Cover", slug: "cushion-cover" },
      { label: "Table Runner", slug: "table-runner" },
      { label: "Placemats", slug: "placemats" },
      { label: "Napkins", slug: "napkins" },
    ] as CategoryItem[],
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

const subcategoryLabels: Record<string, string> = {
  bralettes: "Bralettes",
  panties: "Panties",
  sets: "Sets",
  sleepwear: "Sleepwear",
  blanket: "Blanket",
  "muslin-cloths": "Muslin Cloths & Bibs",
  bibs: "Bibs",
  pyjama: "Pyjama",
  accessories: "Accessories",
  // New subcategory labels
  bras: "Bras",
  knickers: "Knickers",
  belts: "Belts",
  garters: "Garters",
  "sleeping-masks": "Sleeping Masks",
  "hair-accessories": "Hair Accessories",
  pouches: "Pouches",
  organisers: "Organisers",
  "cushion-cover": "Cushion Cover",
  "table-runner": "Table Runner",
  placemats: "Placemats",
  napkins: "Napkins",
  underwear: "Kids' Underwear",
  pyjamas: "Pyjamas",
  blankets: "Blankets",
};

// Category-specific tag chips
const categoryTags: Record<string, { slug: string; label: string }[]> = {
  lingerie: [
    { slug: "bras", label: "Bras" },
    { slug: "knickers", label: "Knickers" },
    { slug: "belts", label: "Belts" },
    { slug: "garters", label: "Garters" },
    { slug: "sleeping-masks", label: "Sleeping Masks" },
    { slug: "sets", label: "Sets" },
  ],
  mini: [
    { slug: "underwear", label: "Kids' Underwear" },
    { slug: "pyjamas", label: "Pyjamas" },
    { slug: "blankets", label: "Blankets" },
    { slug: "muslin-cloths", label: "Muslin Cloths & Bibs" },
    { slug: "accessories", label: "Kids' Accessories" },
  ],
  kids: [
    { slug: "underwear", label: "Kids' Underwear" },
    { slug: "pyjamas", label: "Pyjamas" },
    { slug: "blankets", label: "Blankets" },
    { slug: "muslin-cloths", label: "Muslin Cloths & Bibs" },
    { slug: "accessories", label: "Kids' Accessories" },
  ],
  accessories: [
    { slug: "hair-accessories", label: "Hair Accessories" },
    { slug: "pouches", label: "Pouches" },
    { slug: "organisers", label: "Organisers" },
  ],
  home: [
    { slug: "cushion-cover", label: "Cushion Cover" },
    { slug: "table-runner", label: "Table Runner" },
    { slug: "placemats", label: "Placemats" },
    { slug: "napkins", label: "Napkins" },
  ],
};

interface ActiveCollection {
  name: string;
  slug: string;
  season?: string;
  description?: unknown[];
}

export default function ShopContent({
  products,
  activeCategory,
  activeCollection,
}: {
  products: Product[];
  activeCategory?: string;
  activeCollection?: ActiveCollection;
}) {
  // Read ?category= from the URL client-side so the server page doesn't need
  // searchParams (which would force fully-dynamic rendering and break ISR).
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeSubcategory = searchParams.get("category") ?? undefined;

  const displayedProducts = activeSubcategory
    ? products.filter((p) => p.subcategory === activeSubcategory)
    : products;

  // Tags to show for the active category page
  const tags = activeCategory ? (categoryTags[activeCategory] ?? []) : [];

  const isCollection = !!activeCollection;

  return (
    <>
      <main className="pt-28">
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
                {isCollection
                  ? `Collection${activeCollection.season ? ` — ${activeCollection.season}` : ""}`
                  : activeSubcategory
                  ? `${categoryLabels[activeCategory ?? ""] || "Collection"} — ${subcategoryLabels[activeSubcategory] || activeSubcategory}`
                  : activeCategory
                  ? categoryLabels[activeCategory] || "Collection"
                  : "Our Collections"}
              </motion.p>
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="font-serif text-4xl sm:text-5xl mb-6"
              >
                {isCollection
                  ? activeCollection.name
                  : activeSubcategory
                  ? subcategoryLabels[activeSubcategory] || activeSubcategory
                  : activeCategory
                  ? categoryLabels[activeCategory] || "Shop"
                  : "Browse the Shelves"}
              </motion.h2>
              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-lg text-charcoal-light max-w-lg mx-auto leading-relaxed"
              >
                {isCollection
                  ? "A curated selection of handmade pieces from our Southampton atelier."
                  : activeCategory
                  ? "Every piece is handmade with care in our Southampton atelier. Explore our handpicked selection below."
                  : "Every piece is handmade with care in our Southampton atelier. Explore our collections and find something made just for you."}
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* Category filter chips — shown when on a category page that has tags */}
        {activeCategory && tags.length > 0 && (
          <section className="pb-8">
            <div className="max-w-6xl mx-auto px-6">
              <div className="flex flex-wrap gap-2 justify-center">
                <Link
                  href={pathname}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                    !activeSubcategory
                      ? "bg-lavender text-charcoal"
                      : "bg-cream border border-lavender-soft/40 text-charcoal/60 hover:text-charcoal"
                  }`}
                >
                  All
                </Link>
                {tags.map((tag) => (
                  <Link
                    key={tag.slug}
                    href={`${pathname}?category=${tag.slug}`}
                    className={`px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                      activeSubcategory === tag.slug
                        ? "bg-lavender text-charcoal"
                        : "bg-cream border border-lavender-soft/40 text-charcoal/60 hover:text-charcoal"
                    }`}
                  >
                    {tag.label}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Category Overview — only show when browsing ALL products (no active category or collection) */}
        {!activeCategory && !isCollection && (
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
                    className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center p-6 rounded-3xl transition-colors"
                  >
                    {/* Image */}
                    <div className={`${i % 2 === 1 ? "lg:order-2" : ""}`}>
                      <Link href={cat.href}>
                        <div className={`relative aspect-[4/5] rounded-3xl overflow-hidden flex items-center justify-center cursor-pointer ${cat.bgClass || "bg-cream-soft"}`}>
                          <Image
                            src={cat.image}
                            alt={cat.title}
                            width={600}
                            height={600}
                            className="w-[60%] h-auto object-contain drop-shadow-lg hover:scale-105 transition-transform duration-700 ease-out"
                          />
                        </div>
                      </Link>
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
                          <Link
                            key={item.slug}
                            href={`/shop/${cat.slug}?category=${item.slug}`}
                            className="px-4 py-2 bg-lavender-bg rounded-full text-sm text-charcoal-light hover:bg-lavender hover:text-charcoal transition-colors"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>

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
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </section>
        )}

        {/* Products Grid */}
        <section className={`py-24 md:py-32 ${activeCategory || isCollection ? "" : "bg-lavender-bg"}`} id="products">
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

            {displayedProducts.length > 0 ? (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={stagger}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
              >
                {displayedProducts.map((product, i) => (
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
                  {activeSubcategory
                    ? `${subcategoryLabels[activeSubcategory] || activeSubcategory} Coming Soon`
                    : activeCategory
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
    </>
  );
}

function ProductCard({ product, index }: { product: Product; index: number }) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const availableImages =
    product.images.length > 0
      ? product.images
      : ["https://placehold.co/400x500/E6E6FA/4A4A4A?text=Product"];

  const activeImage = availableImages[activeImageIndex] ?? availableImages[0];

  const goNext = useCallback(() => {
    setActiveImageIndex((prev) =>
      prev < availableImages.length - 1 ? prev + 1 : 0
    );
  }, [availableImages.length]);

  const goPrev = useCallback(() => {
    setActiveImageIndex((prev) =>
      prev > 0 ? prev - 1 : availableImages.length - 1
    );
  }, [availableImages.length]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen, goNext, goPrev]);

  return (
    <>
      <motion.div
        variants={fadeUp}
        custom={index}
        whileHover={{ y: -6 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="group"
      >
        {/* Main product image — click to go to PDP */}
        <Link
          href={`/shop/${product.slug}`}
          className="relative aspect-[4/5] rounded-2xl overflow-hidden mb-4 bg-white/60 w-full block"
        >
          <img
            src={activeImage}
            alt={product.name}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          />
          <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-500" />
          <div className="absolute top-4 left-4 flex flex-col gap-1.5">
            <div className="bg-white/90 backdrop-blur-sm rounded-full px-3 py-1">
              <p className="text-xs text-charcoal-light">{product.category}</p>
            </div>
            {product.collection && (
              <a
                href={`/shop/collection/${product.collection.slug}`}
                onClick={(e) => e.stopPropagation()}
                className="bg-lavender/90 backdrop-blur-sm rounded-full px-3 py-1 hover:bg-lavender transition-colors"
              >
                <p className="text-xs text-charcoal font-medium">{product.collection.name}</p>
              </a>
            )}
          </div>
          {/* Wishlist heart */}
          <div className="absolute top-4 right-4 z-10">
            <WishlistButton
              product={{
                id: product._id,
                name: product.name,
                price: product.price,
                image: activeImage,
                slug: product.slug,
                availableSizes: product.availableSizes,
              }}
              className="bg-white/80 backdrop-blur-sm shadow-sm"
            />
          </div>
          {/* Zoom icon */}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLightboxOpen(true); }}
            className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-charcoal hover:bg-white transition-colors shadow-sm opacity-0 group-hover:opacity-100"
            aria-label="Quick view"
          >
            <Search size={16} />
          </button>
        </Link>

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

        <Link href={`/shop/${product.slug}`} className="block">
          <h4 className="font-serif text-lg mb-1 hover:text-charcoal/70 transition-colors">{product.name}</h4>
        </Link>
        <p className="text-charcoal-light text-sm mb-4">
          £{(product.price / 100).toFixed(2)}
        </p>

        {product.availableSizes && product.availableSizes.length > 0 ? (
          /* Product has sizes → send customer to PDP to choose */
          <Link
            href={`/shop/${product.slug}`}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
          >
            Choose Size
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        ) : (
          /* No sizes (accessories, home etc.) → add directly */
          <AddToCartButton
            id={product._id}
            name={product.name}
            price={product.price}
            image={activeImage}
          />
        )}
      </motion.div>

      {/* ──── Lightbox Modal ──── */}
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setLightboxOpen(false)}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/25 transition-colors"
              aria-label="Close lightbox"
            >
              <X size={22} />
            </button>

            {/* Previous button */}
            {availableImages.length > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                className="absolute left-4 sm:left-6 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/25 transition-colors"
                aria-label="Previous image"
              >
                <ChevronLeft size={22} />
              </button>
            )}

            {/* Image */}
            <motion.div
              key={activeImageIndex}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="relative max-w-[90vw] max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={availableImages[activeImageIndex]}
                alt={`${product.name} — image ${activeImageIndex + 1}`}
                className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
              />
              {/* Image counter */}
              {availableImages.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-1.5">
                  <p className="text-white text-xs tracking-wider">
                    {activeImageIndex + 1} / {availableImages.length}
                  </p>
                </div>
              )}
            </motion.div>

            {/* Next button */}
            {availableImages.length > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                className="absolute right-4 sm:right-6 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/25 transition-colors"
                aria-label="Next image"
              >
                <ChevronRight size={22} />
              </button>
            )}

            {/* Thumbnail strip */}
            {availableImages.length > 1 && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">
                {availableImages.map((image, i) => (
                  <button
                    key={`lightbox-thumb-${i}`}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setActiveImageIndex(i); }}
                    className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                      i === activeImageIndex
                        ? "border-white scale-110 shadow-lg"
                        : "border-white/30 hover:border-white/60"
                    }`}
                  >
                    <img
                      src={image}
                      alt={`Thumbnail ${i + 1}`}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
