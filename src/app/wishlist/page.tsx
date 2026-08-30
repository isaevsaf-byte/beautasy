"use client";

import { useIsClient } from "@/lib/useIsClient";
import { motion } from "framer-motion";
import { Heart, ArrowRight, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useWishlist } from "@/store/useWishlist";
import { useCart } from "@/store/useCart";
import { fadeUp, stagger } from "@/components/animations";

/* eslint-disable @next/next/no-img-element */

export default function WishlistPage() {
  const { items, removeItem, clearWishlist } = useWishlist();
  const addToCart = useCart((s) => s.addItem);
  const hydrated = useIsClient();

  const wishlistItems = hydrated ? items : [];

  // Items that require a size/colour selection cannot be added directly from
  // the wishlist — they need to go through the PDP first.
  function itemNeedsOptions(item: (typeof items)[0]): boolean {
    // If availableSizes is undefined (old wishlist items) assume it needs options
    // to be safe. If it's an empty array the product has no size variants.
    return item.availableSizes === undefined || item.availableSizes.length > 0;
  }

  function handleAddToCart(item: (typeof items)[0]) {
    addToCart({
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
    });
  }

  return (
    <>
      <Header />
      <main className="pt-28 min-h-screen">
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
                Your Wishlist
              </motion.p>
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="font-serif text-4xl sm:text-5xl mb-6"
              >
                Saved Pieces
              </motion.h2>
              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-lg text-charcoal-light max-w-lg mx-auto leading-relaxed"
              >
                Your handpicked favourites, all in one place.
              </motion.p>
            </motion.div>

            {wishlistItems.length > 0 ? (
              <>
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={stagger}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
                >
                  {wishlistItems.map((item, i) => {
                    // Gift box slugs already include their path prefix (e.g. "gift-boxes/slug")
                    const itemHref = item.slug.includes("/")
                      ? `/${item.slug}`
                      : `/shop/${item.slug}`;

                    return (
                    <motion.div
                      key={item.id}
                      variants={fadeUp}
                      custom={i}
                      className="group"
                    >
                      <Link
                        href={itemHref}
                        className="relative aspect-[4/5] rounded-2xl overflow-hidden mb-4 bg-white/60 block"
                      >
                        <img
                          src={item.image}
                          alt={item.name}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                        />
                        <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-500" />
                      </Link>

                      <h4 className="font-serif text-lg mb-1">
                        <Link
                          href={itemHref}
                          className="hover:text-charcoal/70 transition-colors"
                        >
                          {item.name}
                        </Link>
                      </h4>
                      <p className="text-charcoal-light text-sm mb-4">
                        £{(item.price / 100).toFixed(2)}
                      </p>

                      <div className="flex gap-2">
                        {itemNeedsOptions(item) ? (
                          /* Product needs size/colour — send to PDP */
                          <Link
                            href={itemHref}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-lavender text-charcoal rounded-full text-xs tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300"
                          >
                            <ShoppingBag size={14} />
                            Select Options
                          </Link>
                        ) : (
                          /* No size variant — add directly to cart */
                          <button
                            onClick={() => handleAddToCart(item)}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-lavender text-charcoal rounded-full text-xs tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300"
                          >
                            <ShoppingBag size={14} />
                            Add to Bag
                          </button>
                        )}
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-2.5 rounded-full border border-charcoal/15 text-charcoal-light hover:text-red-500 hover:border-red-200 transition-colors"
                          aria-label="Remove from wishlist"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </motion.div>
                    );
                  })}
                </motion.div>

                <div className="text-center mt-12">
                  <button
                    onClick={clearWishlist}
                    className="text-xs tracking-wider uppercase text-charcoal-light hover:text-charcoal transition-colors"
                  >
                    Clear Wishlist
                  </button>
                </div>
              </>
            ) : (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                custom={0}
                className="text-center py-16"
              >
                <div className="w-20 h-20 rounded-full bg-lavender/15 flex items-center justify-center mx-auto mb-6">
                  <Heart size={32} className="text-lavender" />
                </div>
                <h4 className="font-serif text-2xl mb-3">
                  Your wishlist is empty
                </h4>
                <p className="text-charcoal-light max-w-md mx-auto leading-relaxed mb-8">
                  Browse our collections and tap the heart to save pieces you
                  love.
                </p>
                <Link
                  href="/shop"
                  className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
                >
                  Browse Shop
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
