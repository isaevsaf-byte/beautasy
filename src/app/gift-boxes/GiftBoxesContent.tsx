"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Search, Gift, Package } from "lucide-react";
import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AddToCartButton from "@/components/AddToCartButton";
import WishlistButton from "@/components/WishlistButton";
import Lightbox from "@/components/Lightbox";
import { fadeUp, stagger } from "@/components/animations";
import { formatPence } from "@/lib/money";

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
        {/* initial={false}: the heading is the first thing on the page, so it
            is painted as it is, not faded in once every script has loaded */}
        <section className="py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial={false}
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
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="font-serif text-3xl sm:text-4xl"
              >
                Our Gift Sets
              </motion.h2>
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
                  className="press group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] hover:shadow-lg hover:shadow-lavender/30"
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
      : ["https://placehold.co/400x500/E6E6FA/4A4A4A.png?text=Gift+Box"];

  const activeImage = availableImages[activeImageIndex] ?? availableImages[0];

  return (
    <>
      {/* The lift on hover is CSS on the inner card, as in the shop: on this
          motion.div it came back down on the entrance's delayed transition */}
      <motion.div variants={fadeUp} custom={index} className="group h-full">
        <div className="flex flex-col h-full transition-transform duration-200 ease-out group-hover:-translate-y-1.5">
          {/* Main image — click to go to detail */}
          <Link
            href={`/gift-boxes/${giftBox.slug}`}
            className="relative aspect-[4/5] rounded-2xl overflow-hidden mb-4 bg-white/60 w-full block"
          >
            <img
              src={activeImage}
              alt={giftBox.name}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ease-out"
            />
            <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-300 ease-out" />

            {/* Gift Box badge */}
            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5">
              <Gift size={12} className="text-lavender" />
              <p className="text-xs text-charcoal-light">Gift Set</p>
            </div>

            {/* Product count badge */}
            {giftBox.productCount > 0 && (
              <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5">
                <Package size={12} className="text-charcoal-light" />
                <p className="text-xs text-charcoal-light tabular-nums">
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

            {/* Zoom icon — waits for the hover where there is a pointer to
                hover with; on a phone, where hidden still meant tappable, it shows */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLightboxOpen(true);
              }}
              className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-charcoal hover:bg-white transition-[background-color,opacity] duration-200 ease-out shadow-sm opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="Quick view"
            >
              <Search size={16} />
            </button>
          </Link>

          {/* Thumbnails */}
          {availableImages.length > 1 && (
            <div className="flex gap-2 mb-4 overflow-x-auto snap-x snap-proximity overscroll-x-contain pb-1">
              {availableImages.map((image, i) => (
                <button
                  key={`${giftBox._id}-image-${i}`}
                  type="button"
                  onClick={() => setActiveImageIndex(i)}
                  className={`relative w-14 h-14 shrink-0 snap-start rounded-lg overflow-hidden border transition-colors ${
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
            {/* Two lines at most, so each card's button lines up with its neighbours' */}
            <h4 className="font-serif text-lg mb-1 line-clamp-2 hover:text-charcoal/70 transition-colors" title={giftBox.name}>
              {giftBox.name}
            </h4>
          </Link>
          <p className="text-charcoal-light text-sm mb-4 tabular-nums">{formatPence(giftBox.price)}</p>

          <AddToCartButton
            id={giftBox._id}
            name={giftBox.name}
            price={giftBox.price}
            image={activeImage}
            className="mt-auto w-full"
          />
        </div>
      </motion.div>

      {/* The shared viewer (components/Lightbox): a real dialog with focus kept
          inside, a swipe on phones, and the next photo shown without zooming
          in. This page kept its own copy of it, without any of that. */}
      <Lightbox
        images={availableImages}
        alt={giftBox.name}
        index={activeImageIndex}
        onIndexChange={setActiveImageIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
