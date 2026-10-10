"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { placeLink, shelvesFrom, stockedLinks } from "@/lib/shelves";
import { availability } from "@/lib/availability";
import { cardAction } from "@/lib/shopCard";
import { THUMB, sizedImageUrl } from "@/lib/shopImages";
import Image from "next/image";
/* eslint-disable @next/next/no-img-element */
import AddToCartButton from "@/components/AddToCartButton";
import WishlistButton from "@/components/WishlistButton";
import { wishlistEntry } from "@/store/useWishlist";
import Lightbox from "@/components/Lightbox";
import { fadeUp, stagger } from "@/components/animations";
import { startingPriceLabel, type SizePrice } from "./startingPrice";

interface Product {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  category: string;
  subcategory?: string;
  availableSizes: string[];
  /** Prices of their own for some sizes, so the card can say "from £18.00" */
  sizePrices?: SizePrice[] | null;
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
    bgClass: "bg-lavender-wash",
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
    // The palest of the lavenders, not the pink it was: pink is nowhere else
    // in the brand, and beside the lilac tiles it read as another shop's
    bgClass: "bg-gradient-to-br from-[#FBF9FF] via-[#F5F0FF] to-[#EEE7FF]",
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

/**
 * The section tiles' row on a laptop, by how many sections have something in
 * them: always a quarter of the width each, and the row centred, so three
 * stocked sections leave no hole where the fourth was and don't swell to fill it
 */
const TILE_ROW: Record<number, string> = {
  1: "lg:grid-cols-1 lg:max-w-[17rem]",
  2: "lg:grid-cols-2 lg:max-w-[35.5rem]",
  3: "lg:grid-cols-3 lg:max-w-[54rem]",
  4: "lg:grid-cols-4",
};

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
      <main id="main" className="pt-28">
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
                  : "Browse the shelves"}
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
        {/* One row of small tiles, two to a phone's row and four to a
            laptop's. Each section used to be a half-screen of logo beside its
            words, zigzagging down the page, so on a phone four logos came
            before the first thing for sale. The tile is the link the
            "Explore" button was. Painted as they are, not faded in: the whole
            row is on the first screen. */}
        {!activeCategory && !isCollection && (
          <section className="pb-14">
            <div className="max-w-6xl mx-auto px-6">
              <ul className={`mx-auto grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-5 ${TILE_ROW[stockedCategories.length] ?? "lg:grid-cols-4"}`}>
                {stockedCategories.map((cat, i) => (
                  <li key={cat.title}>
                    <Link href={cat.href} className="group block">
                      {/* The logos are drawn on near-white squares; multiplied
                          into the tile, the square takes its colour and the
                          drop shadow it cast is gone with it. 5% brighter
                          first, as the squares are 246–252 and not white (see
                          the home page's shelves). */}
                      <div className={`relative aspect-[5/4] rounded-2xl overflow-hidden flex items-center justify-center transition-shadow duration-300 group-hover:shadow-lg group-hover:shadow-plum/10 ${cat.bgClass || "bg-cream-soft"}`}>
                        <Image
                          src={cat.image}
                          alt={cat.title}
                          width={320}
                          height={320}
                          className="w-[60%] h-auto object-contain brightness-105 mix-blend-multiply group-hover:scale-105 transition-transform duration-300 ease-out"
                          {...(i === 0 ? { preload: true, fetchPriority: "high" as const } : {})}
                        />
                      </div>
                      {/* h2: each section is a part of the page under its h1,
                          as "Featured products" is; as h3 they skipped a level */}
                      <h2 className="mt-3 font-serif text-lg sm:text-xl leading-snug group-hover:text-lavender-ink transition-colors">
                        {cat.title}
                        {cat.subtitle && (
                          <span className="text-sm font-sans text-charcoal-light ml-2">
                            ({cat.subtitle})
                          </span>
                        )}
                      </h2>
                      <p className="mt-0.5 text-sm text-charcoal-light leading-relaxed">
                        {cat.description}
                      </p>
                    </Link>

                    {/* The kinds of piece inside, from a small tablet up. On a
                        phone the tile is too narrow for them, and the section's
                        own page opens on the same chips. */}
                    {cat.items.length > 0 && (
                      <div className="hidden sm:flex flex-wrap gap-1.5 mt-3">
                        {cat.items.map((item) => (
                          <Link
                            key={item.slug}
                            href={item.href}
                            className="px-3 py-1 bg-lavender-bg rounded-full text-xs text-charcoal-light hover:bg-lavender hover:text-charcoal transition-colors"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
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
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="font-serif text-3xl sm:text-4xl"
              >
                Featured products
              </motion.h2>
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
                {/* A drawn sparkle, not the emoji: an emoji is whatever the
                    phone's own font makes of it — yellow on one, flat on
                    another — where an icon is the brand's colour everywhere,
                    as on the wishlist and gift boxes */}
                <div className="w-20 h-20 rounded-full bg-lavender/15 flex items-center justify-center mx-auto mb-6">
                  <Sparkles size={32} aria-hidden="true" className="text-lavender-ink" />
                </div>
                <h3 className="font-serif text-2xl mb-3">
                  {activeSize || readyOnly
                    ? "Nothing matches those filters"
                    : activeSubcategory
                    ? `${subcategoryLabels[activeSubcategory] || activeSubcategory} coming soon`
                    : activeCategory
                    ? `${categoryLabels[activeCategory] || "This"} collection coming soon`
                    : "New collection coming soon"}
                </h3>
                <p className="text-charcoal-light max-w-md mx-auto leading-relaxed mb-8">
                  We&apos;re handcrafting new pieces for this collection. Check
                  back soon or get in touch to request something custom.
                </p>
                <Link
                  href="/contact"
                  className="press group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover hover:shadow-lg hover:shadow-lavender/30"
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
      : // .png: without it placehold.co sends an SVG, which next/image refuses
        ["https://placehold.co/400x500/E6E6FA/4A4A4A.png?text=Product"];

  const activeImage = availableImages[activeImageIndex] ?? availableImages[0];
  // Straight into the bag only when there is nothing to choose (@/lib/shopCard)
  const action = cardAction(product);

  return (
    <>
      {/* The lift on hover is CSS on the inner card. As whileHover on this
          motion.div it came back down on the entrance's own transition —
          delayed by the card's place in the grid, so the ninth card hung in
          the air for over a second after the pointer left it. */}
      <motion.div variants={fadeUp} custom={index} className="group h-full">
        <div className="flex flex-col h-full transition-transform duration-200 ease-out group-hover:-translate-y-1.5">
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
                className="object-cover group-hover:scale-105 transition-transform duration-300 ease-out"
                priority={index < 3}
              />
              <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-300 ease-out" />
            </Link>
            {/* Wishlist heart — the one thing on the photo besides the zoom.
                The section and collection pills that sat over its top left
                corner are under the name now, so the piece is seen whole. */}
            <div className="absolute top-4 right-4 z-10">
              <WishlistButton
                product={wishlistEntry(product, activeImage)}
                className="bg-white/80 backdrop-blur-sm shadow-sm"
              />
            </div>
            {/* Zoom icon — waits for the hover where there is a pointer to hover
                with; on a phone, where hidden still meant tappable, it shows */}
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="absolute bottom-4 right-4 z-10 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-charcoal hover:bg-white transition-[background-color,opacity] duration-200 ease-out shadow-sm opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="Quick view"
            >
              <Search size={16} />
            </button>
          </div>

          {availableImages.length > 1 && (
            <div className="flex gap-2 mb-4 overflow-x-auto snap-x snap-proximity overscroll-x-contain pb-1">
              {availableImages.map((image, i) => (
                <button
                  key={`${product._id}-image-${i}`}
                  type="button"
                  onClick={() => setActiveImageIndex(i)}
                  className={`relative w-14 h-14 shrink-0 snap-start rounded-lg overflow-hidden border transition-colors ${
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
            {/* Two lines at most, so a long name does not push its card's
                button below its neighbours'; the whole name is in the title */}
            <h3 className="font-serif text-lg mb-1 line-clamp-2 hover:text-charcoal/70 transition-colors" title={product.name}>
              {product.name}
            </h3>
          </Link>
          {/* Where it belongs, in small words under its name: the section, and
              the collection as a link to the rest of it. They used to be pills
              over the photo, covering the piece. A long collection name wraps
              here instead of ending in "…". */}
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-charcoal-light mb-1.5">
            <span>{product.category}</span>
            {product.collection && (
              <>
                <span aria-hidden="true">·</span>
                <Link
                  href={`/shop/collection/${product.collection.slug}`}
                  className="text-lavender-ink underline-offset-2 hover:underline"
                >
                  {product.collection.name}
                </Link>
              </>
            )}
          </p>
          {/* "from" the cheapest size when the sizes cost different amounts */}
          <p className="text-charcoal-light text-sm mb-1 tabular-nums">{startingPriceLabel(product)}</p>
          {/* The same words the product page uses (@/lib/availability). Full
              charcoal-light, not 80% of it: at 11px the faded grey was about
              3.2:1 on the lavender shelf, under the 4.5:1 small text needs. */}
          <p className="text-[11px] text-charcoal-light mb-4">{availability(product).label}</p>

          {action.kind === "page" ? (
            /* A size or colour to choose → the product page asks for it */
            <Link
              href={`/shop/${product.slug}`}
              className="press mt-auto w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover hover:shadow-lg hover:shadow-lavender/30"
            >
              {action.label}
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform duration-200 ease-out" />
            </Link>
          ) : (
            /* Nothing to choose → add directly, as wide as its neighbours' links */
            <AddToCartButton
              id={product._id}
              name={product.name}
              slug={product.slug}
              price={product.price}
              image={activeImage}
              className="mt-auto w-full"
            />
          )}
        </div>
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
