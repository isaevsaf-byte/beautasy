"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { placeLink, shelvesFrom, stockedLinks } from "@/lib/shelves";
import { availability } from "@/lib/availability";
import { cardAction } from "@/lib/shopCard";
import { THUMB, sizedImageUrl } from "@/lib/shopImages";
import Image from "next/image";
/* eslint-disable @next/next/no-img-element */
import AddToCartButton from "@/components/AddToCartButton";
import WishlistButton from "@/components/WishlistButton";
import Lightbox from "@/components/Lightbox";
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
  /** Ready-made pieces on the shelf; 0 means made to order, not unavailable */
  stock?: number;
  /** Kristina's making time ("3-5"), so a card can say how long made to order takes */
  productionTime?: string | null;
  /** How many colours it comes in; a piece with a colour to choose is sent to its page */
  colorCount?: number | null;
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

export interface ShopFilters {
  /** ?category= — subcategory chip */
  category?: string;
  /** ?sort= — price-asc | price-desc | undefined (newest) */
  sort?: string;
  /** ?size= */
  size?: string;
  /** ?ready=1 — only pieces already sewn */
  ready?: string;
}

export default function ShopContent({
  products,
  activeCategory,
  activeCollection,
  basePath,
  filters = {},
}: {
  products: Product[];
  activeCategory?: string;
  activeCollection?: ActiveCollection;
  /** Path this listing lives at, used to build filter links */
  basePath: string;
  filters?: ShopFilters;
}) {
  // Filters arrive from the server rather than from useSearchParams(): reading
  // them client-side made Next replace the whole listing with the Suspense
  // skeleton in the prerendered HTML, so search engines never saw a product.
  const activeSubcategory = filters.category;
  const activeSort = filters.sort;
  const activeSize = filters.size;
  const readyOnly = filters.ready === "1";

  /** Builds a URL for this listing with some params changed and the rest kept. */
  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const current: Record<string, string | undefined> = {
      category: activeSubcategory,
      sort: activeSort,
      size: activeSize,
      ready: filters.ready,
      ...patch,
    };
    for (const [key, value] of Object.entries(current)) {
      if (value !== undefined) next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  // Sizes actually offered by the products on this page
  const sizeOptions = Array.from(
    new Set(products.flatMap((p) => p.availableSizes ?? []))
  );

  const displayedProducts = products
    .filter((p) => (activeSubcategory ? p.subcategory === activeSubcategory : true))
    .filter((p) => (activeSize ? (p.availableSizes ?? []).includes(activeSize) : true))
    // "Ready to ship" means pieces already sewn; everything else is made to
    // order. The same helper writes each card's availability line.
    .filter((p) => (readyOnly ? availability(p).kind !== "made-to-order" : true))
    .sort((a, b) => {
      if (activeSort === "price-asc") return a.price - b.price;
      if (activeSort === "price-desc") return b.price - a.price;
      return 0; // server already returns newest first, which is our default
    });

  // Tags to show for the active category page
  // What the products on this page fill: a section or a chip with nothing
  // behind it is left out (see @/lib/shelves). A chip someone arrived on stays,
  // so the page still says what it is showing.
  const shelves = shelvesFrom({ products });
  const tags = (activeCategory ? (categoryTags[activeCategory] ?? []) : []).filter(
    (tag) => tag.slug === activeSubcategory || products.some((p) => p.subcategory === tag.slug)
  );
  const stockedCategories = categories
    .filter((cat) => placeLink(cat.href, shelves) !== null)
    .map((cat) => ({
      ...cat,
      items: stockedLinks(
        cat.items.map((item) => ({ ...item, href: `/shop/${cat.slug}?category=${item.slug}` })),
        shelves
      ),
    }));

  const isCollection = !!activeCollection;

  return (
    <>
      <main className="pt-28">
        {/* Page Hero */}
        {/* initial={false}, here and on the grid below: painted as it is, not
            faded in from opacity 0. Faded, the heading and the products waited
            for every script — on a throttled phone /shop showed a blank top
            for 14–19 seconds. The children inherit it, as on the home page. */}
        <section className="py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial={false}
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
              <motion.h1
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
              </motion.h1>
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
                  href={buildHref({ category: undefined })}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                    !activeSubcategory
                      ? "bg-lavender text-charcoal"
                      : "bg-cream border border-lavender-soft/40 text-charcoal/80 hover:text-charcoal"
                  }`}
                >
                  All
                </Link>
                {tags.map((tag) => (
                  <Link
                    key={tag.slug}
                    href={buildHref({ category: tag.slug })}
                    className={`px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                      activeSubcategory === tag.slug
                        ? "bg-lavender text-charcoal"
                        : "bg-cream border border-lavender-soft/40 text-charcoal/80 hover:text-charcoal"
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
                {stockedCategories.map((cat, i) => (
                  <motion.div
                    key={cat.title}
                    variants={fadeUp}
                    custom={i}
                    // The first card is on screen before anything scrolls; waiting
                    // for it to scroll into view left it hidden until scripts ran.
                    initial={i === 0 ? false : undefined}
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
                            {...(i === 0 ? { preload: true, fetchPriority: "high" as const } : {})}
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
                            href={item.href}
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
              initial={false}
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

            {/* Sort + filter controls */}
            {products.length > 0 && (
              <div className="flex flex-col gap-4 mb-10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs tracking-wider uppercase text-charcoal-light">
                    {displayedProducts.length}{" "}
                    {displayedProducts.length === 1 ? "piece" : "pieces"}
                  </p>
                  {/* The price order is said in words. The ↑ and ↓ it used to
                      show did not draw on Kristina's phone, so both pills read
                      "Price" and the row looked cut off. The three pills fit a
                      320px screen on one line; the word "Sort" joins them from
                      360px, and screen readers always hear it. The inactive
                      pills' text is darker too — at 60% it was faint enough
                      to read as missing. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="sr-only min-[360px]:not-sr-only text-xs tracking-wider uppercase text-charcoal-light min-[360px]:mr-1">
                      Sort
                    </span>
                    {[
                      { key: undefined, label: "Newest" },
                      { key: "price-asc", label: "Price: low" },
                      { key: "price-desc", label: "Price: high" },
                    ].map((option) => {
                      const active = (activeSort ?? undefined) === option.key;
                      return (
                        <Link
                          key={option.label}
                          href={buildHref({ sort: option.key })}
                          scroll={false}
                          aria-current={active ? "true" : undefined}
                          className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors duration-200 ${
                            active
                              ? "bg-lavender text-charcoal"
                              : "bg-cream border border-lavender-soft/40 text-charcoal/80 hover:text-charcoal"
                          }`}
                        >
                          {option.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>

                {/* These filters are links, so the chosen one is marked with
                    aria-current like the sort pills. aria-pressed belongs to
                    toggle buttons; on a link, screen readers announce a
                    "toggle button" that then navigates away. */}
                {(sizeOptions.length > 0 || readyOnly) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {sizeOptions.length > 0 && (
                      <>
                        <span className="text-xs tracking-wider uppercase text-charcoal-light mr-1">
                          Size
                        </span>
                        {sizeOptions.map((size) => {
                          const active = activeSize === size;
                          return (
                            <Link
                              key={size}
                              href={buildHref({ size: active ? undefined : size })}
                              scroll={false}
                              aria-current={active ? "true" : undefined}
                              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 ${
                                active
                                  ? "bg-lavender text-charcoal"
                                  : "bg-cream border border-lavender-soft/40 text-charcoal/80 hover:text-charcoal"
                              }`}
                            >
                              {size}
                            </Link>
                          );
                        })}
                      </>
                    )}
                    <Link
                      href={buildHref({ ready: readyOnly ? undefined : "1" })}
                      scroll={false}
                      aria-current={readyOnly ? "true" : undefined}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 ${
                        readyOnly
                          ? "bg-lavender text-charcoal"
                          : "bg-cream border border-lavender-soft/40 text-charcoal/80 hover:text-charcoal"
                      }`}
                    >
                      Ready to ship
                    </Link>
                    {(activeSize || readyOnly || activeSort) && (
                      <Link
                        href={buildHref({ size: undefined, ready: undefined, sort: undefined })}
                        scroll={false}
                        className="px-3 py-1.5 text-xs text-charcoal-light hover:text-charcoal underline underline-offset-2"
                      >
                        Clear
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}

            {displayedProducts.length > 0 ? (
              <motion.div
                initial={false}
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
                  {activeSize || readyOnly
                    ? "Nothing matches those filters"
                    : activeSubcategory
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
  // Straight into the bag only when there is nothing to choose (@/lib/shopCard)
  const action = cardAction(product);

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
        <div className="relative aspect-[4/5] rounded-2xl overflow-hidden mb-4 bg-white/60 w-full">
          <Link href={`/shop/${product.slug}`} className="absolute inset-0 block">
            {/* next/image serves a phone-sized crop to phones — the plain <img>
                was shipping the 800px desktop file to every device. */}
            <Image
              src={activeImage}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
              priority={index < 3}
            />
            <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-500" />
          </Link>
          {/* Badges — siblings of the PDP link, not nested inside it */}
          <div className="absolute top-4 left-4 flex flex-col gap-1.5 pointer-events-none">
            <div className="bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 pointer-events-auto">
              <p className="text-xs text-charcoal-light">{product.category}</p>
            </div>
            {product.collection && (
              <Link
                href={`/shop/collection/${product.collection.slug}`}
                className="bg-lavender/90 backdrop-blur-sm rounded-full px-3 py-1 hover:bg-lavender transition-colors pointer-events-auto"
              >
                <p className="text-xs text-charcoal font-medium">{product.collection.name}</p>
              </Link>
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
            onClick={() => setLightboxOpen(true)}
            className="absolute bottom-4 right-4 z-10 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-charcoal hover:bg-white transition-colors shadow-sm opacity-0 group-hover:opacity-100"
            aria-label="Quick view"
          >
            <Search size={16} />
          </button>
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
                {/* A 160px copy, not the 800px photo, and only once it is
                    near the screen — lazy also keeps React from turning it
                    into an early download in <head> (see @/lib/shopImages) */}
                <img
                  src={sizedImageUrl(image, THUMB)}
                  alt={`${product.name} thumbnail ${i + 1}`}
                  width={56}
                  height={56}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        <Link href={`/shop/${product.slug}`} className="block">
          <h4 className="font-serif text-lg mb-1 hover:text-charcoal/70 transition-colors">{product.name}</h4>
        </Link>
        <p className="text-charcoal-light text-sm mb-1">
          £{(product.price / 100).toFixed(2)}
        </p>
        {/* The same words the product page uses (@/lib/availability). Full
            charcoal-light, not 80% of it: at 11px the faded grey was about
            3.2:1 on the lavender shelf, under the 4.5:1 small text needs. */}
        <p className="text-[11px] text-charcoal-light mb-4">{availability(product).label}</p>

        {action.kind === "page" ? (
          /* A size or colour to choose → the product page asks for it */
          <Link
            href={`/shop/${product.slug}`}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
          >
            {action.label}
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        ) : (
          /* Nothing to choose → add directly */
          <AddToCartButton
            id={product._id}
            name={product.name}
            slug={product.slug}
            price={product.price}
            image={activeImage}
          />
        )}
      </motion.div>

      <Lightbox
        images={availableImages}
        alt={product.name}
        index={activeImageIndex}
        onIndexChange={setActiveImageIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
