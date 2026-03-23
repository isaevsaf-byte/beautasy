"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, X, Plus, Minus, Trash2, Loader2 } from "lucide-react";
/* eslint-disable @next/next/no-img-element */
import { useCart } from "@/store/useCart";

export default function Cart() {
  const { items, removeItem, updateQuantity, totalItems, totalPrice, clearCart } =
    useCart();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fix Zustand hydration: the store hydrates from localStorage after SSR,
  // so we track when the client has mounted to avoid hydration mismatches.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const count = hydrated ? totalItems() : 0;

  // Lock body scroll when cart is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  async function handleCheckout() {
    setIsLoading(true);
    setError(null);

    // Validate items before sending to Stripe
    if (!items || items.length === 0) {
      setError("Your bag is empty. Add some items before checking out.");
      setIsLoading(false);
      return;
    }

    const invalidItems = items.filter(
      (item) =>
        !item.name ||
        !item.price ||
        item.price < 1 ||
        !item.quantity ||
        item.quantity < 1
    );

    if (invalidItems.length > 0) {
      setError(
        "Some items in your bag have invalid data. Please remove them and try again."
      );
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        // Stripe returned OK but no URL — should never happen, but handle it
        throw new Error("Could not create checkout session. Please try again.");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to start checkout";
      setError(message);
      setIsLoading(false);
    }
  }

  // ─── Cart drawer rendered via Portal ───────────────────────────────
  // The header uses backdrop-filter which creates a new containing block,
  // breaking `position: fixed` on descendants. Portal escapes this.
  const drawer = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[9998]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-[#FDFBF7] z-[9999] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-lavender-soft/40 shrink-0">
              <h2 className="font-serif text-xl tracking-wide">Your Bag</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-charcoal-light hover:text-charcoal transition-colors"
                aria-label="Close cart"
              >
                <X size={20} />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <ShoppingBag
                    size={48}
                    className="text-lavender-soft mb-4"
                  />
                  <p className="font-serif text-lg mb-2">Your bag is empty</p>
                  <p className="text-sm text-charcoal-light">
                    Add something beautiful to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => (
                    <motion.div
                      key={`${item.id}-${item.size}`}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex gap-4 p-3 rounded-2xl bg-white/60 border border-lavender-soft/30"
                    >
                      {/* Image */}
                      <div className="w-20 h-24 rounded-xl overflow-hidden bg-cream-soft flex-shrink-0">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">
                          {item.name}
                        </h4>
                        {item.size && (
                          <p className="text-xs text-charcoal-light mt-0.5">
                            Size: {item.size}
                          </p>
                        )}
                        {item.color && (
                          <p className="text-xs text-charcoal-light mt-0.5">
                            Colour: {item.color}
                          </p>
                        )}
                        <p className="text-sm font-medium mt-1">
                          £{(item.price / 100).toFixed(2)}
                        </p>

                        {/* Quantity controls */}
                        <div className="flex items-center gap-3 mt-2">
                          <button
                            onClick={() =>
                              updateQuantity(
                                item.id,
                                item.quantity - 1,
                                item.size
                              )
                            }
                            className="w-7 h-7 rounded-lg bg-lavender-bg flex items-center justify-center hover:bg-lavender/20 transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-sm font-medium w-6 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateQuantity(
                                item.id,
                                item.quantity + 1,
                                item.size
                              )
                            }
                            className="w-7 h-7 rounded-lg bg-lavender-bg flex items-center justify-center hover:bg-lavender/20 transition-colors"
                          >
                            <Plus size={14} />
                          </button>

                          <button
                            onClick={() => removeItem(item.id, item.size)}
                            className="ml-auto p-1.5 text-charcoal-light hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-lavender-soft/40 px-6 py-5 space-y-4 shrink-0">
                {/* Total */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-charcoal-light">Subtotal</p>
                  <p className="font-serif text-xl">
                    £{(totalPrice() / 100).toFixed(2)}
                  </p>
                </div>
                <div className="text-xs text-charcoal-light space-y-0.5">
                  <p>Delivery: UK £3.00 · International £12.00</p>
                  <p>Selected at checkout</p>
                </div>

                {/* Error message */}
                {error && (
                  <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                {/* Checkout button */}
                <button
                  onClick={handleCheckout}
                  disabled={isLoading}
                  className="w-full py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Redirecting…
                    </>
                  ) : (
                    "Checkout — £" +
                    (totalPrice() / 100).toFixed(2)
                  )}
                </button>

                {/* Clear cart */}
                <button
                  onClick={clearCart}
                  className="w-full text-center text-xs text-charcoal-light hover:text-charcoal transition-colors"
                >
                  Clear bag
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {/* Cart Button — stays in the header */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-2 text-charcoal hover:text-charcoal/70 transition-colors"
        aria-label="Open cart"
      >
        <ShoppingBag size={20} />
        {count > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-lavender text-charcoal text-[10px] font-medium rounded-full flex items-center justify-center"
          >
            {count}
          </motion.span>
        )}
      </button>

      {/* Cart Drawer — portaled to document.body to escape header's backdrop-filter containing block */}
      {hydrated && createPortal(drawer, document.body)}
    </>
  );
}
