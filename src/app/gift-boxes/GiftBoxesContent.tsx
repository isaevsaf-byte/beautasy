"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X, ChevronLeft, ChevronRight, Search, Gift, Package } from "lucide-react";
import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AddToCartButton from "@/components/AddToCartButton";
import WishlistButton from "@/components/WishlistButton";
import { fadeUp, stagger } from "@/components/animations";

interface GiftBox {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  stock: number;
  productCount: number;
}

export default function GiftBoxesContent({
  giftBoxes,
}: {
  giftBoxes: GiftBox[];
}) {
  return (
    <>
      <Header />
      <main className="pt-28">
        {/* Hero */}
        <section className="py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={stagger}
              className="text-center mb-16"
            >
              <motion.div
                variants={fadeUp}
                custom={0}
                className="flex items-center justify-center gap-2 mb-4"
              >
                <Gift size={16} className="text-lavender" />
                <p className="text-sm tracking-[0.25em] uppercase text-charcoal-light">
                  Curated Sets
                </p>
              </motion.div>
              <motion.h1
                variants={fadeUp}
                custom={1}
                className="font-serif text-4xl sm:text-5xl mb-6"
              >
                Gift Boxes
              </motion.h1>
              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-lg text-charcoal-light max-w-lg mx-auto leading-relaxed"
              >
                Beautifully curated bundles of our finest handmade pieces,
                wrapped and ready to delight.
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* Gift Boxes Grid */}
        <section className="py-24 md:py-32 bg-lavender-bg" id="gift-boxes">
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
                Our Gift Sets
              </motion.h3>
            </motion.div>

            {giftBoxes.length > 0 ? (
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={stagger}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
              >
                {giftBoxes.map((giftBox, i) => (
                  <GiftBoxCard key={giftBox._id} giftBox={giftBox} index={i} />
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
                  <Gift size={32} className="text-lavender" />
                </div>
                <h4 className="font-serif text-2xl mb-3">
                  Gift Boxes Coming Soon
                </h4>
                <p className="text-charcoal-light max-w-md mx-auto leading-relaxed mb-8">
                  We&apos;re curating beautiful gift sets for you. Check back
                  soon or get in touch for a bespoke gift box.
                </p>
                <Link
                  href="/contact"
                  className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
                >
                  Request Custom Gift Box
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

function GiftBoxCard({ giftBox, index }: { giftBox: GiftBox; index: number }) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const availableImages =
    giftBox.images.length > 0
      ? giftBox.images
      : ["https://placehold.co/400x500/E6E6FA/4A4A4A?text=Gift+Box"];

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
        {/* Main image — click to go to detail */}
        <Link
          href={`/gift-boxes/${giftBox.slug}`}
          className="relative aspect-[4/5] rounded-2xl overflow-hidden mb-4 bg-white/60 w-full block"
        >
          <img
            src={activeImage}
            alt={giftBox.name}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          />
          <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-500" />

          {/* Gift Box badge */}
          <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5">
            <Gift size={12} className="text-lavender" />
            <p className="text-xs text-charcoal-light">Gift Set</p>
          </div>

          {/* Product count badge */}
          {giftBox.productCount > 0 && (
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5">
              <Package size={12} className="text-charcoal-light" />
              <p className="text-xs text-charcoal-light">
                {giftBox.productCount} item{giftBox.productCount !== 1 ? "s" : ""}
              </p>
            </div>
          )}

          {/* Wishlist heart */}
          <div className="absolute top-4 right-4 z-10">
            <WishlistButton
              product={{
                id: giftBox._id,
                name: giftBox.name,
                price: giftBox.price,
                image: activeImage,
                slug: `gift-boxes/${giftBox.slug}`,
              }}
              className="bg-white/80 backdrop-blur-sm shadow-sm"
            />
          </div>

          {/* Zoom icon */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLightboxOpen(true);
            }}
            className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-charcoal hover:bg-white transition-colors shadow-sm opacity-0 group-hover:opacity-100"
            aria-label="Quick view"
          >
            <Search size={16} />
          </button>
        </Link>

        {/* Thumbnails */}
        {availableImages.length > 1 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {availableImages.map((image, i) => (
              <button
                key={`${giftBox._id}-image-${i}`}
                type="button"
                onClick={() => setActiveImageIndex(i)}
                className={`relative w-14 h-14 shrink-0 rounded-lg overflow-hidden border transition-colors ${
                  i === activeImageIndex
                    ? "border-lavender"
                    : "border-transparent hover:border-lavender/40"
                }`}
                aria-label={`Show image ${i + 1} for ${giftBox.name}`}
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

        <Link href={`/gift-boxes/${giftBox.slug}`} className="block">
          <h4 className="font-serif text-lg mb-1 hover:text-charcoal/70 transition-colors">
            {giftBox.name}
          </h4>
        </Link>
        <p className="text-charcoal-light text-sm mb-4">
          £{(giftBox.price / 100).toFixed(2)}
        </p>

        <AddToCartButton
          id={giftBox._id}
          name={giftBox.name}
          price={giftBox.price}
          image={activeImage}
        />
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
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/25 transition-colors"
              aria-label="Close lightbox"
            >
              <X size={22} />
            </button>

            {availableImages.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                className="absolute left-4 sm:left-6 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/25 transition-colors"
                aria-label="Previous image"
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
                src={availableImages[activeImageIndex]}
                alt={`${giftBox.name} — image ${activeImageIndex + 1}`}
                className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
              />
              {availableImages.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-1.5">
                  <p className="text-white text-xs tracking-wider">
                    {activeImageIndex + 1} / {availableImages.length}
                  </p>
                </div>
              )}
            </motion.div>

            {availableImages.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                className="absolute right-4 sm:right-6 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/25 transition-colors"
                aria-label="Next image"
              >
                <ChevronRight size={22} />
              </button>
            )}

            {availableImages.length > 1 && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">
                {availableImages.map((image, i) => (
                  <button
                    key={`lightbox-thumb-${i}`}
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
    </>
  );
}
