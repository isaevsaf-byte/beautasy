"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Gift,
  Package,
  Search,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { PortableText } from "@portabletext/react";
import Header from "@/components/Header";
import Lightbox from "@/components/Lightbox";
import Footer from "@/components/Footer";
import WishlistButton from "@/components/WishlistButton";
import { useCart } from "@/store/useCart";
import { fadeUp, stagger } from "@/components/animations";
import { formatPence } from "@/lib/money";

/* eslint-disable @next/next/no-img-element */

/* ─── Types ─── */
interface ContentProduct {
  _id: string;
  name: string;
  slug: string;
  image: string;
  price: number;
  category: string;
}

interface GiftBoxProps {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  description: unknown[];
  stock: number;
  contentsNote: string | null;
  contents: ContentProduct[];
}

/** One label of the add button: quick to cross over, and it barely grows */
const addedLabel = (shown: boolean) =>
  `col-start-1 row-start-1 flex items-center justify-center gap-2 transition-[opacity,transform] duration-150 ease-out ${
    shown ? "opacity-100 scale-100" : "opacity-0 scale-95"
  }`;

/* ─── Main Component ─── */
export default function GiftBoxDetail({
  giftBox,
}: {
  giftBox: GiftBoxProps;
}) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const addItem = useCart((state) => state.addItem);
  const GIFT_MESSAGE_MAX = 200;
  // "Added to Bag!" goes back after a moment; a second tap starts the moment
  // again, and leaving the page takes the timer with it
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    },
    []
  );

  const images = giftBox.images;
  const activeImage = images[activeImageIndex] ?? images[0];

  const goNext = useCallback(() => {
    setActiveImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  const goPrev = useCallback(() => {
    setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  function handleAddToCart() {
    const trimmedMessage = giftMessage.trim();
    addItem({
      id: giftBox._id,
      name: giftBox.name,
      price: giftBox.price,
      image: activeImage,
      ...(trimmedMessage ? { giftMessage: trimmedMessage } : {}),
    });
    setAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(false), 1500);
  }

  // Calculate total value of individual products
  const totalIndividualValue = giftBox.contents.reduce(
    (sum, p) => sum + p.price,
    0
  );
  const savings = totalIndividualValue - giftBox.price;

  return (
    <>
      <Header />
      <main className="pt-28">
        {/* ── Breadcrumb ── */}
        <div className="max-w-6xl mx-auto px-6 py-6">
          {/* On one line however long the name: the links keep their words
              and the name gives way, ending in "…" with the whole of it on hover */}
          <nav className="flex items-center gap-2 text-sm text-charcoal-light">
            <Link
              href="/"
              className="shrink-0 whitespace-nowrap hover:text-charcoal transition-colors"
            >
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <Link
              href="/gift-boxes"
              className="shrink-0 whitespace-nowrap hover:text-charcoal transition-colors"
            >
              Gift Boxes
            </Link>
            <span aria-hidden="true">/</span>
            <span className="min-w-0 truncate text-charcoal" title={giftBox.name}>
              {giftBox.name}
            </span>
          </nav>
        </div>

        {/* ── Product Layout ── */}
        <section className="max-w-6xl mx-auto px-6 pb-16">
          {/* initial={false}, as on the product page: the photo is the page's
              largest paint, and faded in from opacity 0 it stayed invisible
              until every script had loaded. The name, price and Add button
              beside it waited the same way; the children inherit it. */}
          <motion.div
            initial={false}
            animate="visible"
            variants={stagger}
            className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16"
          >
            {/* ──── Left: Image Gallery ──── */}
            <motion.div variants={fadeUp} custom={0}>
              {/* Main Image */}
              <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-white/60 mb-4">
                <img
                  src={activeImage}
                  alt={giftBox.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {/* Zoom button */}
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-charcoal hover:bg-white transition-colors shadow-md"
                  aria-label="Zoom image"
                >
                  <Search size={18} />
                </button>

                {/* Nav arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={goPrev}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/70 backdrop-blur-sm flex items-center justify-center text-charcoal hover:bg-white transition-colors"
                      aria-label="Previous image"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/70 backdrop-blur-sm flex items-center justify-center text-charcoal hover:bg-white transition-colors"
                      aria-label="Next image"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                // p-1: room inside the scrolling strip for the chosen one's ring
                <div className="flex gap-2 overflow-x-auto snap-x snap-proximity overscroll-x-contain p-1 -m-1">
                  {images.map((image, i) => (
                    <button
                      key={`thumb-${i}`}
                      type="button"
                      onClick={() => setActiveImageIndex(i)}
                      aria-current={i === activeImageIndex ? "true" : undefined}
                      className={`relative w-16 h-16 shrink-0 snap-start rounded-lg overflow-hidden border-2 transition-[border-color,box-shadow] duration-200 ${
                        i === activeImageIndex
                          ? "border-transparent ring-2 ring-lavender-ink ring-offset-2 ring-offset-cream"
                          : "border-transparent hover:border-lavender/40"
                      }`}
                      aria-label={`Show image ${i + 1}`}
                    >
                      <img
                        src={image}
                        alt={`${giftBox.name} thumbnail ${i + 1}`}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </motion.div>

            {/* ──── Right: Gift Box Info ──── */}
            <motion.div variants={fadeUp} custom={1} className="flex flex-col">
              {/* Badge + Stock */}
              <div className="flex items-center gap-3 mb-3">
                <span className="px-3 py-1 bg-lavender-bg rounded-full text-xs tracking-eyebrow uppercase text-charcoal-light flex items-center gap-1.5">
                  <Gift size={12} />
                  Gift Set
                </span>
                {giftBox.stock > 0 ? (
                  <span className="text-xs text-green-700 font-medium">
                    In Stock
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 font-medium">
                    Made to Order
                  </span>
                )}
              </div>

              {/* Name + Price */}
              <h1 className="font-serif text-3xl sm:text-4xl mb-2">
                {giftBox.name}
              </h1>
              <div className="flex items-baseline gap-3 mb-6">
                <p className="font-serif text-2xl text-charcoal tabular-nums">
                  {formatPence(giftBox.price)}
                </p>
                {savings > 0 && totalIndividualValue > 0 && (
                  <p className="text-sm text-green-700 font-medium tabular-nums">
                    Save {formatPence(savings)}
                  </p>
                )}
              </div>

              {/* Description */}
              {giftBox.description && giftBox.description.length > 0 && (
                <div className="text-charcoal-light leading-relaxed mb-8 prose prose-sm max-w-none">
                  <PortableText
                    value={
                      giftBox.description as Parameters<
                        typeof PortableText
                      >[0]["value"]
                    }
                  />
                </div>
              )}

              {/* Optional gift card message */}
              <div className="mb-4 p-4 rounded-xl bg-white border border-lavender-soft/40">
                <label
                  htmlFor="giftbox-message"
                  className="block text-xs tracking-eyebrow uppercase font-medium text-charcoal mb-2"
                >
                  Gift card message{" "}
                  <span className="text-charcoal-light normal-case tracking-normal font-normal">
                    (optional)
                  </span>
                </label>
                <textarea
                  id="giftbox-message"
                  value={giftMessage}
                  onChange={(e) =>
                    setGiftMessage(e.target.value.slice(0, GIFT_MESSAGE_MAX))
                  }
                  rows={3}
                  placeholder="Write a short note to include with the gift card…"
                  className="w-full text-sm text-charcoal bg-cream-soft/50 rounded-field border border-lavender-soft/40 px-3 py-2 focus:outline-none focus:border-lavender-ink focus:ring-2 focus:ring-lavender-ink/25 resize-none"
                />
                <p className="text-[11px] text-charcoal-light mt-1.5 text-right tabular-nums">
                  {giftMessage.length} / {GIFT_MESSAGE_MAX}
                </p>
              </div>

              {/* Add to Cart + Wishlist */}
              <div className="flex items-center gap-3 mb-8">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="press flex-1 group inline-flex items-center justify-center px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover hover:shadow-lg hover:shadow-lavender/30"
                >
                  {/* Both labels always there, in one cell of a grid, as in
                      AddToCartButton: the button keeps its width, and the label
                      is in the server's HTML instead of fading in after scripts */}
                  <span className="grid" aria-live="polite">
                    <span className={addedLabel(!added)} aria-hidden={added}>
                      <Gift size={16} aria-hidden="true" />
                      Add Gift Box — {formatPence(giftBox.price)}
                    </span>
                    <span className={addedLabel(added)} aria-hidden={!added}>
                      <Gift size={16} aria-hidden="true" />
                      Added to Bag!
                    </span>
                  </span>
                </button>
                <WishlistButton
                  product={{
                    id: giftBox._id,
                    name: giftBox.name,
                    price: giftBox.price,
                    image: images[0],
                    slug: `gift-boxes/${giftBox.slug}`,
                  }}
                />
              </div>

              {/* Contents Note */}
              {giftBox.contentsNote && (
                <div className="p-4 rounded-xl bg-lavender-bg/50 border border-lavender-soft/30 mb-6">
                  <p className="text-xs tracking-eyebrow uppercase text-charcoal-light mb-2 flex items-center gap-1.5">
                    <Package size={12} />
                    Also Includes
                  </p>
                  <p className="text-sm text-charcoal-light leading-relaxed">
                    {giftBox.contentsNote}
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        </section>

        {/* ── What's Inside ── */}
        {giftBox.contents.length > 0 && (
          <section className="max-w-6xl mx-auto px-6 pb-24">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
            >
              <motion.div variants={fadeUp} custom={0} className="mb-10">
                <p className="text-sm tracking-eyebrow uppercase text-charcoal-light mb-2">
                  Curated Selection
                </p>
                <h2 className="font-serif text-2xl sm:text-3xl">
                  What&apos;s Inside
                </h2>
              </motion.div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                {giftBox.contents.map((product, i) => (
                  <motion.div
                    key={product._id}
                    variants={fadeUp}
                    custom={i + 1}
                  >
                    <Link
                      href={`/shop/${product.slug}`}
                      className="group block"
                    >
                      <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-white/60 mb-3">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ease-out"
                        />
                        <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-300" />
                        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-0.5">
                          <p className="text-[10px] text-charcoal-light">
                            {product.category}
                          </p>
                        </div>
                      </div>
                      <h4 className="font-serif text-sm mb-1 group-hover:text-charcoal/70 transition-colors line-clamp-2">
                        {product.name}
                      </h4>
                      <p className="text-xs text-charcoal-light tabular-nums">
                        {formatPence(product.price)}
                      </p>
                    </Link>
                  </motion.div>
                ))}
              </div>

              {/* Total value comparison */}
              {totalIndividualValue > 0 && (
                <motion.div
                  variants={fadeUp}
                  custom={giftBox.contents.length + 1}
                  className="mt-10 p-6 rounded-2xl bg-lavender-bg/50 border border-lavender-soft/30 text-center"
                >
                  <p className="text-sm text-charcoal-light mb-1 tabular-nums">
                    Total individual value:{" "}
                    <span className="line-through">
                      {formatPence(totalIndividualValue)}
                    </span>
                  </p>
                  <p className="font-serif text-xl text-charcoal tabular-nums">
                    Gift Box Price: {formatPence(giftBox.price)}
                    {savings > 0 && (
                      <span className="text-green-700 text-sm font-sans font-medium ml-2">
                        You save {formatPence(savings)}
                      </span>
                    )}
                  </p>
                </motion.div>
              )}
            </motion.div>
          </section>
        )}

        {/* ── Browse More ── */}
        <section className="max-w-6xl mx-auto px-6 pb-24 text-center">
          <Link
            href="/gift-boxes"
            className="group inline-flex items-center gap-2 px-8 py-3.5 border border-charcoal/20 text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender hover:border-lavender transition-colors duration-300"
          >
            Browse All Gift Boxes
            <ArrowRight
              size={16}
              className="group-hover:translate-x-1 transition-transform"
            />
          </Link>
        </section>
      </main>

      <Lightbox
        images={images}
        alt={giftBox.name}
        index={activeImageIndex}
        onIndexChange={setActiveImageIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />

      <Footer />
    </>
  );
}
