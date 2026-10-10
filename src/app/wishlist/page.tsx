"use client";

import { useIsClient } from "@/lib/useIsClient";
import { motion } from "framer-motion";
import { Heart, ArrowRight, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useWishlist } from "@/store/useWishlist";
import { useCart } from "@/store/useCart";
import { useCartUI } from "@/store/useCartUI";
import { cardAction } from "@/lib/shopCard";
import { fadeUp, stagger } from "@/components/animations";
import { formatPence } from "@/lib/money";

/* eslint-disable @next/next/no-img-element */

export default function WishlistPage() {
  const { items, removeItem, clearWishlist } = useWishlist();
  const addToCart = useCart((s) => s.addItem);
  const openCart = useCartUI((s) => s.openCart);
  const hydrated = useIsClient();

  const wishlistItems = hydrated ? items : [];

  function handleAddToCart(item: (typeof items)[0]) {
    addToCart({
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
    });
    // Show what just happened, as the product page does: the bag icon is far
    // up the page here, so a silent add read as a button that did nothing
    openCart();
  }

  return (
    <>
      <Header />
      {/* svh: a phone's full screen counted with its address bar showing, so
          the page does not grow under the bar and jump as it hides */}
      <main className="pt-28 min-h-svh">
        <section className="py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6">
            {/* initial={false}: the heading is the first thing on the page, so
                it is painted as it is, not faded in once scripts arrive */}
            <motion.div
              initial={false}
              animate="visible"
              variants={stagger}
              className="text-center mb-16"
            >
              <motion.p
                variants={fadeUp}
                custom={0}
                className="text-sm tracking-eyebrow uppercase text-charcoal-light mb-4"
              >
                Your Wishlist
              </motion.p>
              <motion.h1
                variants={fadeUp}
                custom={1}
                className="font-serif text-4xl sm:text-5xl mb-6"
              >
                Saved Pieces
              </motion.h1>
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
                    // The shop card's own rule (@/lib/shopCard): a size or a
                    // colour to choose goes to the page; only a piece with
                    // nothing to choose goes straight into the bag. Sizes alone
                    // let a colourless sleeping mask in, and checkout then
                    // refused the whole bag. Saved before colours were kept, or
                    // a gift box: the page, which knows.
                    const action = cardAction(item);

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
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ease-out"
                        />
                        <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-300 ease-out" />
                      </Link>

                      <h4 className="font-serif text-lg mb-1">
                        <Link
                          href={itemHref}
                          className="hover:text-charcoal/70 transition-colors"
                        >
                          {item.name}
                        </Link>
                      </h4>
                      <p className="text-charcoal-light text-sm mb-4 tabular-nums">
                        {formatPence(item.price)}
                      </p>

                      <div className="flex gap-2">
                        {action.kind === "page" ? (
                          /* Something to choose — send to the PDP */
                          <Link
                            href={itemHref}
                            className="press flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-lavender text-charcoal rounded-full text-xs tracking-wider uppercase font-medium hover:bg-lavender-hover"
                          >
                            <ShoppingBag size={14} />
                            {action.label}
                          </Link>
                        ) : (
                          /* Nothing to choose — add directly to cart */
                          <button
                            type="button"
                            onClick={() => handleAddToCart(item)}
                            className="press flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-lavender text-charcoal rounded-full text-xs tracking-wider uppercase font-medium hover:bg-lavender-hover"
                          >
                            <ShoppingBag size={14} />
                            Add to Bag
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="p-2.5 rounded-full border border-charcoal/15 text-charcoal-light hover:text-rose-700 hover:border-red-200 transition-colors"
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
                    type="button"
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
                  className="press group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover hover:shadow-lg hover:shadow-lavender/30"
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
