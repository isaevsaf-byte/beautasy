"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, X, Plus, Minus, Trash2, Loader2, Package } from "lucide-react";
/* eslint-disable @next/next/no-img-element */
import { usePathname } from "next/navigation";
import { useCart } from "@/store/useCart";
import { useCartUI } from "@/store/useCartUI";
import { useIsClient } from "@/lib/useIsClient";
import { DEFAULT_FREE_THRESHOLD } from "@/lib/siteSettings";
import { trackBeginCheckout } from "@/lib/analytics";

/**
 * The bag icon in the header. Open/closed state lives in the `useCartUI`
 * store, so "Add to Bag" on a product page can open the same drawer.
 */
export default function Cart() {
  const items = useCart((state) => state.items);
  const openCart = useCartUI((state) => state.openCart);

  // The cart store hydrates from localStorage after SSR, so the count must read
  // as empty until we are on the client or the markup would not match.
  const hydrated = useIsClient();

  const count = hydrated
    ? items.reduce((sum, item) => sum + item.quantity, 0)
    : 0;

  return (
    <button
      onClick={openCart}
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
  );
}

/**
 * The drawer itself — rendered ONCE per page (the header mounts a cart button
 * for desktop and another for mobile, but there must only ever be one drawer).
 * Portaled to document.body because the header's backdrop-filter creates a new
 * containing block, which would break `position: fixed` on descendants.
 */
export function CartDrawer({
  freeShippingThreshold: propThreshold,
}: {
  freeShippingThreshold?: number;
}) {
  const { items, removeItem, updateQuantity, totalPrice, clearCart } = useCart();
  const isOpen = useCartUI((state) => state.isOpen);
  const closeCart = useCartUI((state) => state.closeCart);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(
    propThreshold ?? DEFAULT_FREE_THRESHOLD
  );
  // Gift card applied to this order, if any
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCard, setGiftCard] = useState<{ code: string; balance: number } | null>(null);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  const [checkingCard, setCheckingCard] = useState(false);

  const hydrated = useIsClient();

  // ── Close cart on every navigation ────────────────────────────────────
  // In Next.js App Router, concurrent rendering keeps the old page's DOM
  // alive while the new page loads. If the cart is open, its drawer (and
  // the free-shipping line) becomes a "ghost" on the incoming page.
  // Listening to pathname changes and closing immediately prevents this.
  const pathname = usePathname();
  useEffect(() => {
    closeCart();
  }, [pathname, closeCart]);

  // If no threshold prop was provided (client pages without HeaderWrapper),
  // fetch the live value from Sanity via the API route.
  // Use sessionStorage to avoid a re-fetch on every navigation.
  useEffect(() => {
    if (propThreshold !== undefined) return; // already have it from SSR
    try {
      const cached = sessionStorage.getItem("beautasy-free-threshold");
      if (cached !== null) {
        const t = Number(cached);
        if (!isNaN(t)) { setFreeShippingThreshold(t); return; }
      }
    } catch { /* sessionStorage unavailable */ }

    fetch("/api/site-settings")
      .then((r) => r.json())
      .then((data) => {
        const t = data?.shipping?.freeShippingThreshold;
        if (typeof t === "number") {
          setFreeShippingThreshold(t);
          try { sessionStorage.setItem("beautasy-free-threshold", String(t)); } catch { /* ok */ }
        }
      })
      .catch(() => {/* keep the default */});
  }, [propThreshold]);

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

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, closeCart]);

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

    trackBeginCheckout(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        variant: [item.size, item.color].filter(Boolean).join(" / ") || undefined,
      }))
    );

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, ...(giftCard ? { giftCardCode: giftCard.code } : {}) }),
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

  const drawer = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[9998]"
          />

          {/* Drawer */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Your bag"
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
                onClick={closeCart}
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
                  {items.map((item) => {
                    const key = {
                      id: item.id,
                      size: item.size,
                      color: item.color,
                      giftMessage: item.giftMessage,
                      measurements: item.measurements,
                    };
                    return (
                    <motion.div
                      key={`${item.id}-${item.size ?? ""}-${item.color ?? ""}-${item.giftMessage ?? ""}-${item.measurements ?? ""}`}
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
                        {item.measurements && (
                          <div className="mt-1.5 px-2 py-1.5 rounded-lg bg-lavender-bg/60 border border-lavender-soft/40">
                            <p className="text-[10px] tracking-wider uppercase text-charcoal-light mb-0.5">
                              Your measurements
                            </p>
                            <p className="text-xs text-charcoal break-words">{item.measurements}</p>
                          </div>
                        )}
                        {item.giftMessage && (
                          <div className="mt-1.5 px-2 py-1.5 rounded-lg bg-lavender-bg/60 border border-lavender-soft/40">
                            <p className="text-[10px] tracking-wider uppercase text-charcoal-light mb-0.5">
                              Gift card
                            </p>
                            <p className="text-xs text-charcoal italic break-words">
                              &ldquo;{item.giftMessage}&rdquo;
                            </p>
                          </div>
                        )}
                        <p className="text-sm font-medium mt-1">
                          £{(item.price / 100).toFixed(2)}
                        </p>

                        {/* Quantity controls */}
                        <div className="flex items-center gap-3 mt-2">
                          <button
                            onClick={() => updateQuantity(key, item.quantity - 1)}
                            className="w-7 h-7 rounded-lg bg-lavender-bg flex items-center justify-center hover:bg-lavender/20 transition-colors"
                            aria-label={`Decrease quantity of ${item.name}`}
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-sm font-medium w-6 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(key, item.quantity + 1)}
                            className="w-7 h-7 rounded-lg bg-lavender-bg flex items-center justify-center hover:bg-lavender/20 transition-colors"
                            aria-label={`Increase quantity of ${item.name}`}
                          >
                            <Plus size={14} />
                          </button>

                          <button
                            onClick={() => removeItem(key)}
                            className="ml-auto p-1.5 text-charcoal-light hover:text-red-400 transition-colors"
                            aria-label={`Remove ${item.name} from bag`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-lavender-soft/40 px-6 py-5 space-y-4 shrink-0">
                {/* Free shipping progress */}
                {freeShippingThreshold > 0 && (() => {
                  const spent = totalPrice();
                  const remaining = freeShippingThreshold - spent;
                  const pct = Math.min((spent / freeShippingThreshold) * 100, 100);
                  return (
                    <div>
                      {remaining > 0 ? (
                        <p className="text-xs text-charcoal-light mb-1.5 flex items-center gap-1">
                          <Package size={12} className="text-lavender" />
                          Add{" "}
                          <span className="font-medium text-charcoal">
                            £{(remaining / 100).toFixed(2)}
                          </span>{" "}
                          more for free UK delivery
                        </p>
                      ) : (
                        <p className="text-xs text-green-600 font-medium mb-1.5 flex items-center gap-1">
                          <Package size={12} />
                          You qualify for free UK delivery! 🎉
                        </p>
                      )}
                      <div className="h-1.5 w-full bg-lavender-bg rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-lavender rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Gift card */}
                <div>
                  {giftCard ? (
                    <div className="flex items-center justify-between gap-2 text-xs bg-lavender-bg/60 border border-lavender-soft/40 rounded-lg px-3 py-2">
                      <span className="text-charcoal">
                        Gift card <strong>{giftCard.code}</strong> — £
                        {(Math.min(giftCard.balance, totalPrice()) / 100).toFixed(2)} off
                      </span>
                      <button
                        onClick={() => {
                          setGiftCard(null);
                          setGiftCardCode("");
                        }}
                        className="text-charcoal-light hover:text-charcoal underline underline-offset-2"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setCheckingCard(true);
                        setGiftCardError(null);
                        try {
                          const res = await fetch(
                            `/api/gift-cards?code=${encodeURIComponent(giftCardCode)}`
                          );
                          const data = await res.json();
                          if (!res.ok || !data.valid) {
                            setGiftCardError(data.error ?? "That code isn't valid");
                          } else {
                            setGiftCard({ code: data.code, balance: data.balance });
                          }
                        } catch {
                          setGiftCardError("Could not check that code");
                        }
                        setCheckingCard(false);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={giftCardCode}
                        onChange={(e) => setGiftCardCode(e.target.value.toUpperCase().slice(0, 30))}
                        placeholder="Gift card code"
                        aria-label="Gift card code"
                        className="flex-1 min-w-0 text-xs px-3 py-2 rounded-lg border border-lavender-soft/50 bg-white focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
                      />
                      <button
                        type="submit"
                        disabled={checkingCard || giftCardCode.length < 4}
                        className="shrink-0 px-3 py-2 rounded-lg bg-lavender/20 hover:bg-lavender/30 text-charcoal text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {checkingCard ? "…" : "Apply"}
                      </button>
                    </form>
                  )}
                  {giftCardError && <p className="text-[11px] text-red-500 mt-1">{giftCardError}</p>}
                </div>

                {/* Total */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-charcoal-light">Subtotal</p>
                  <p className="font-serif text-xl">
                    £{(totalPrice() / 100).toFixed(2)}
                  </p>
                </div>
                <div className="text-xs text-charcoal-light space-y-0.5">
                  <p>Delivery selected at checkout</p>
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

  if (!hydrated) return null;
  return createPortal(drawer, document.body);
}
