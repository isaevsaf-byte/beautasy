"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Gift,
  Package,
  Search,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { PortableText } from "@portabletext/react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WishlistButton from "@/components/WishlistButton";
import { useCart } from "@/store/useCart";
import { fadeUp, stagger } from "@/components/animations";

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

  const images = giftBox.images;
  const activeImage = images[activeImageIndex] ?? images[0];

  const goNext = useCallback(() => {
    setActiveImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  const goPrev = useCallback(() => {
    setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  // Keyboard nav for lightbox
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
    setTimeout(() => setAdded(false), 1500);
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
          <nav className="flex items-center gap-2 text-sm text-charcoal-light">
            <Link
              href="/"
              className="hover:text-charcoal transition-colors"
            >
              Home
            </Link>
            <span>/</span>
            <Link
              href="/gift-boxes"
              className="hover:text-charcoal transition-colors"
            >
              Gift Boxes
            </Link>
            <span>/</span>
            <span className="text-charcoal">{giftBox.name}</span>
          </nav>
        </div>

        {/* ── Product Layout ── */}
        <section className="max-w-6xl mx-auto px-6 pb-16">
          <motion.div
            initial="hidden"
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
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((image, i) => (
                    <button
                      key={`thumb-${i}`}
                      type="button"
                      onClick={() => setActiveImageIndex(i)}
                      className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                        i === activeImageIndex
                          ? "border-lavender shadow-md"
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
                <span className="px-3 py-1 bg-lavender-bg rounded-full text-xs tracking-wider uppercase text-charcoal-light flex items-center gap-1.5">
                  <Gift size={12} />
                  Gift Set
                </span>
                {giftBox.stock > 0 ? (
                  <span className="text-xs text-green-600 font-medium">
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
                <p className="font-serif text-2xl text-charcoal">
                  £{(giftBox.price / 100).toFixed(2)}
                </p>
                {savings > 0 && totalIndividualValue > 0 && (
                  <p className="text-sm text-green-600 font-medium">
                    Save £{(savings / 100).toFixed(2)}
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
                  className="block text-xs tracking-wider uppercase font-medium text-charcoal mb-2"
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
                  className="w-full text-sm text-charcoal bg-cream-soft/50 rounded-lg border border-lavender-soft/40 px-3 py-2 focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20 resize-none"
                />
                <p className="text-[11px] text-charcoal-light mt-1.5 text-right">
                  {giftMessage.length} / {GIFT_MESSAGE_MAX}
                </p>
              </div>

              {/* Add to Cart + Wishlist */}
              <div className="flex items-center gap-3 mb-8">
                <button
                  onClick={handleAddToCart}
                  className="flex-1 group inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
                >
                  <AnimatePresence mode="wait">
                    {added ? (
                      <motion.span
                        key="added"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex items-center gap-2"
                      >
                        <Gift size={16} />
                        Added to Bag!
                      </motion.span>
                    ) : (
                      <motion.span
                        key="add"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex items-center gap-2"
                      >
                        <Gift size={16} />
                        Add Gift Box — £{(giftBox.price / 100).toFixed(2)}
                      </motion.span>
                    )}
                  </AnimatePresence>
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
                  <p className="text-xs tracking-wider uppercase text-charcoal-light mb-2 flex items-center gap-1.5">
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
                <p className="text-sm tracking-[0.25em] uppercase text-charcoal-light mb-2">
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
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
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
                      <p className="text-xs text-charcoal-light">
                        £{(product.price / 100).toFixed(2)}
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
                  <p className="text-sm text-charcoal-light mb-1">
                    Total individual value:{" "}
                    <span className="line-through">
                      £{(totalIndividualValue / 100).toFixed(2)}
                    </span>
                  </p>
                  <p className="font-serif text-xl text-charcoal">
                    Gift Box Price: £{(giftBox.price / 100).toFixed(2)}
                    {savings > 0 && (
                      <span className="text-green-600 text-sm font-sans font-medium ml-2">
                        You save £{(savings / 100).toFixed(2)}
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
            className="group inline-flex items-center gap-2 px-8 py-3.5 border border-charcoal/20 text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender hover:border-lavender transition-all duration-300"
          >
            Browse All Gift Boxes
            <ArrowRight
              size={16}
              className="group-hover:translate-x-1 transition-transform"
            />
          </Link>
        </section>
      </main>

      {/* ──── Lightbox ──── */}
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
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/25 transition-colors"
              aria-label="Close"
            >
              <X size={22} />
            </button>

            {images.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                className="absolute left-4 sm:left-6 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/25 transition-colors"
                aria-label="Previous"
              >
                <ChevronLeft size={22} />
              </button>
            )}

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
                src={images[activeImageIndex]}
                alt={`${giftBox.name} — image ${activeImageIndex + 1}`}
                className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
              />
              {images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-1.5">
                  <p className="text-white text-xs tracking-wider">
                    {activeImageIndex + 1} / {images.length}
                  </p>
                </div>
              )}
            </motion.div>

            {images.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                className="absolute right-4 sm:right-6 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/25 transition-colors"
                aria-label="Next"
              >
                <ChevronRight size={22} />
              </button>
            )}

            {images.length > 1 && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">
                {images.map((image, i) => (
                  <button
                    key={`lb-thumb-${i}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex(i);
                    }}
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

      <Footer />
    </>
  );
}
