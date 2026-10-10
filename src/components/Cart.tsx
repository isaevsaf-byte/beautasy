"use client";

import { useState, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ShoppingBag, X, Plus, Minus, Trash2, Loader2, Package, Sparkles } from "lucide-react";
/* eslint-disable @next/next/no-img-element */
import { usePathname } from "next/navigation";
import { MAX_PER_LINE, useCart } from "@/store/useCart";
import { useCartUI } from "@/store/useCartUI";
import { whatsappLink } from "@/lib/business";
import { useIsClient } from "@/lib/useIsClient";
import { useDialog, useScrollLock } from "@/lib/useDialog";
import { formatPence } from "@/lib/money";
import { EASE_IN_OUT, EASE_OUT } from "@/components/animations";
import CountBadge from "@/components/CountBadge";
import type { CartItem } from "@/store/useCart";
import { DEFAULT_FREE_THRESHOLD } from "@/lib/siteSettings";
import { trackBeginCheckout, trackReferralApply } from "@/lib/analytics";
import {
  clearReferralCookie,
  looksLikeReferralCode,
  pounds,
  readReferralCookie,
  writeReferralCookie,
} from "@/lib/friendsLink";
import { friendDiscountApplies, looksLikeWelcomeCode, welcomeCodeNote } from "@/lib/bagCodes";
import TermsNote from "@/components/TermsNote";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The drawer's curve, as globals.css has it (--ease-drawer): quick off the mark, a long soft landing */
const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

/** How long "Bag cleared · Undo" (and a line's "Removed · Undo") stays */
const UNDO_MS = 5000;

/** The drawer's slide, in ms: the bag's own requests wait for it to finish */
const OPEN_SETTLE_MS = 350;

/**
 * Its slide away, in ms: quicker than the way in. Opening, the eye follows the
 * bag onto the screen; closing, the visitor has already moved on, and a drawer
 * that takes as long to leave as to arrive feels like it is lingering.
 */
const CLOSE_MS = 250;

/** The free-delivery bar's thread: the gold of the site's stitched leaders (.leader-stitch) */
const STITCH_GOLD = "rgb(176 136 72)";

/** What WhatsApp opens with when a line has reached the bag's ten */
function moreThanTenMessage(item: CartItem): string {
  const variant = [item.size && `size ${item.size}`, item.color].filter(Boolean).join(", ");
  return `Hi Kristina, I'd like more than ${MAX_PER_LINE} of ${item.name}${variant ? ` (${variant})` : ""}`;
}

/** Shown when a line's photo will not load: the mark, small, rather than a broken-image icon */
const IMAGE_FALLBACK = "/beautasy-mark.png";

/** A line's photo, or the quiet mark when the photo is gone (a piece unpublished, a URL changed) */
function BagImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return <img src={IMAGE_FALLBACK} alt={alt} className="w-full h-full object-contain p-5 opacity-60" />;
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} className="w-full h-full object-cover" />;
}

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
    // A 44px target with the same 20px bag; the negative margin keeps the
    // glyph where the old 36px button had it, so the header row does not move.
    // It darkens on hover like the icons beside it, where it used to fade.
    <button
      onClick={openCart}
      className="relative size-11 -m-1 grid place-items-center text-charcoal/70 hover:text-charcoal transition-colors duration-300"
      aria-label="Open cart"
    >
      <ShoppingBag size={20} />
      <CountBadge count={count} className="top-0 right-0 min-w-5 h-5 px-1 text-[10px]" />
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
  const { items, removeItem, updateQuantity, totalPrice, clearCart, restore } = useCart();
  const isOpen = useCartUI((state) => state.isOpen);
  const closeCart = useCartUI((state) => state.closeCart);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(
    propThreshold ?? DEFAULT_FREE_THRESHOLD
  );
  // One field takes both kinds of code. A gift card pays part of the order;
  // a friend's code ("ANNA-K7P2") takes £5 off a first order and needs the
  // email it will be checked against.
  const [codeInput, setCodeInput] = useState("");
  const [giftCard, setGiftCard] = useState<{ code: string; balance: number } | null>(null);
  const [friend, setFriend] = useState<{
    code: string;
    firstName: string | null;
    discount: number;
    minBasket: number;
  } | null>(null);
  const [friendEmail, setFriendEmail] = useState("");
  const friendEmailRef = useRef<HTMLInputElement | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  // Not an error: where a newsletter welcome code goes instead (@/lib/bagCodes)
  const [codeNote, setCodeNote] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  // Where the parcel is going. Preselected from the shopper's country, but
  // theirs to change — a UK customer might be sending a gift abroad.
  const [region, setRegion] = useState<"uk" | "international">("uk");
  // The terms line under Checkout, which the button names as its description
  const termsId = useId();
  // What clearing the bag took out, kept for a few seconds so Undo can put it back
  const [cleared, setCleared] = useState<CartItem[] | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One line taken out by its bin (or its minus at 1), and where it stood:
  // "Removed · Undo" holds its place for the same few seconds
  const [removed, setRemoved] = useState<{ line: CartItem; at: number } | null>(null);
  const removedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (removedTimer.current) clearTimeout(removedTimer.current);
  }, []);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const hydrated = useIsClient();
  // The drawer slides with a transform string (see the drawer below), which
  // MotionConfig reducedMotion="user" does not strip the way it strips `x`:
  // with reduced motion asked for, it fades in place instead
  const reduceMotion = useReducedMotion() ?? false;

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

  // A friend's link left its code on this device: apply it without any typing
  useEffect(() => {
    if (!isOpen || friend) return;
    const code = readReferralCookie();
    if (!code) return;
    let cancelled = false;
    // Once the drawer has slid in, so the answer's re-render does not land
    // in the middle of the slide
    const wait = setTimeout(() => {
      fetch(`/api/referrals?code=${encodeURIComponent(code)}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (data?.valid) {
            setFriend({
              code: data.code,
              firstName: data.firstName ?? null,
              discount: data.shopDiscount ?? 0,
              minBasket: data.minBasket ?? 0,
            });
          } else {
            clearReferralCookie();
          }
        })
        .catch(() => {/* no discount is the safe default */});
    }, OPEN_SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(wait);
    };
  }, [isOpen, friend]);

  // Preselect the delivery region from where the shopper appears to be
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const wait = setTimeout(() => {
      fetch("/api/geo")
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled && (data?.region === "uk" || data?.region === "international")) {
            setRegion(data.region);
          }
        })
        .catch(() => {/* the UK default is the common case */});
    }, OPEN_SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(wait);
    };
  }, [isOpen]);

  // The page behind stays still, counted with the other panels (closing the
  // search over the open bag no longer unfreezes the page). Focus moves to
  // the close button, Tab stays in the bag, Escape closes it, and focus goes
  // back to the bag button that opened it.
  useScrollLock(isOpen);
  const panelRef = useDialog(isOpen, closeCart, closeRef);

  function removeWithUndo(line: CartItem, at: number) {
    setRemoved({ line, at });
    removeItem(line);
    if (removedTimer.current) clearTimeout(removedTimer.current);
    removedTimer.current = setTimeout(() => setRemoved(null), UNDO_MS);
  }

  function undoRemove() {
    if (removed) restore([removed.line], removed.at);
    setRemoved(null);
    if (removedTimer.current) clearTimeout(removedTimer.current);
  }

  /** "Removed · Undo", spliced into the list where the line stood */
  function withRemovedNote(rows: React.ReactElement[]): React.ReactElement[] {
    if (!removed) return rows;
    const note = (
      <motion.p
        key="removed-line"
        role="status"
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
        transition={{ duration: 0.2, ease: EASE_OUT, layout: { duration: 0.25, ease: EASE_IN_OUT } }}
        className="px-3 py-2 rounded-2xl border border-dashed border-lavender-soft/60 text-center text-sm text-charcoal"
      >
        Removed<span className="sr-only"> {removed.line.name}</span> ·{" "}
        <button
          type="button"
          onClick={undoRemove}
          className="-my-3 py-3 font-medium underline underline-offset-2 hover:text-charcoal/70 transition-colors"
        >
          Undo
        </button>
      </motion.p>
    );
    const at = Math.min(removed.at, rows.length);
    return [...rows.slice(0, at), note, ...rows.slice(at)];
  }

  function clearWithUndo() {
    // One Undo on screen at a time: the bag's takes over from a line's, and
    // brings back what clearing took, not the line removed before it
    setRemoved(null);
    if (removedTimer.current) clearTimeout(removedTimer.current);
    setCleared(items);
    clearCart();
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setCleared(null), UNDO_MS);
  }

  function undoClear() {
    if (cleared) restore(cleared);
    setCleared(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }

  // Whether the friend's (or salon's) £5 is on this basket. One answer for the
  // banner, the email box, the email check and what checkout is sent: under
  // the minimum the box is not shown, so the email must not be asked for, and
  // the order goes through at full price with the code left out. The cookie
  // stays, so the discount comes back if the basket grows.
  const friendApplies = friendDiscountApplies(friend, totalPrice());

  // The moment the bag reaches free delivery, the gold thread is tied off
  // with a knot. Once per crossing, and only one she saw happen: a bag that
  // opens already qualifying shows its knot sitting there, not tying itself
  // again. The previous answer is kept in state and compared while
  // rendering (React's "adjusting state when a prop changes"), so there is
  // no effect and no extra paint between the bar filling and the knot.
  const qualifiesForFree = freeShippingThreshold > 0 && totalPrice() >= freeShippingThreshold;
  const [qualifiedBefore, setQualifiedBefore] = useState(qualifiesForFree);
  const [tyingKnot, setTyingKnot] = useState(false);
  if (qualifiesForFree !== qualifiedBefore) {
    setQualifiedBefore(qualifiesForFree);
    // Open here also covers Add to Bag, which adds and opens in one go
    setTyingKnot(qualifiesForFree && isOpen);
  }
  // Closed, the knot is simply tied: the next opening must not tie it again
  if (!isOpen && tyingKnot) setTyingKnot(false);

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

    // The friend discount is checked against an email — "first order", "not
    // your own link" — so the server needs it before Stripe does
    if (friend && friendApplies && !EMAIL_RE.test(friendEmail.trim())) {
      setError(`Add the email you'll check out with, so we can apply ${friend.firstName ? `${friend.firstName}'s` : "the friend"} discount.`);
      friendEmailRef.current?.focus();
      setIsLoading(false);
      return;
    }

    trackBeginCheckout(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        price: item.price,
        quantity: item.quantity,
        variant: [item.size, item.color].filter(Boolean).join(" / ") || undefined,
      }))
    );

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          region,
          ...(giftCard ? { giftCardCode: giftCard.code } : {}),
          ...(friend && friendApplies ? { referralCode: friend.code, email: friendEmail.trim() } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // A friend code the server refused (own email, not a first order…)
        // is dropped here, so the next attempt goes through without it
        if (data?.referralInvalid) {
          setFriend(null);
          clearReferralCookie();
        }
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
          {/* Backdrop: a plain tint, a shade darker than it was blurred.
              A blur behind a fading layer is worked out again over the whole
              page on every frame of the fade, which a phone feels. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 bg-black/35 z-[9998]"
          />

          {/* Drawer. The slide is a full transform string on the drawer
              curve, not framer's `x` shorthand: a transform string runs on
              the compositor, so it stays smooth while the bag's contents
              render. The drawer itself does not scroll: the list does, and
              the footer only when it alone would fill most of the screen.
              Reduced motion: no slide, the bag fades where it stands. */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Your bag"
            initial={reduceMotion ? { opacity: 0 } : { transform: "translateX(100%)" }}
            animate={reduceMotion ? { opacity: 1 } : { transform: "translateX(0%)" }}
            exit={{
              ...(reduceMotion ? { opacity: 0 } : { transform: "translateX(100%)" }),
              transition: { duration: CLOSE_MS / 1000, ease: EASE_DRAWER },
            }}
            transition={{ duration: OPEN_SETTLE_MS / 1000, ease: EASE_DRAWER }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-[#FDFBF7] z-[9999] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-lavender-soft/40 shrink-0">
              <h2 className="font-serif text-xl tracking-wide">Your Bag</h2>
              {/* A 44px target round the same 20px cross; the negative
                  margin keeps the cross where it was */}
              <button
                ref={closeRef}
                onClick={closeCart}
                className="size-11 -m-2 grid place-items-center text-charcoal-light hover:text-charcoal transition-colors"
                aria-label="Close cart"
              >
                <X size={20} />
              </button>
            </div>

            {/* Items — the one part of the bag that scrolls. It used to scroll
                inside a drawer that scrolled too, so a swipe on the list
                moved one or the other depending on where it started. */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4">
              {/* Empty and full swap at once. They used to cross with a fade
                  that waited for one to leave before the other came — and the
                  footer, outside it, jumped in or out straight away — so Clear
                  bag and its Undo blinked: list, nothing, footer, list. A swap
                  the visitor just asked for is answered at once; the fades are
                  kept for a single line leaving or arriving. */}
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
                  {/* Clearing the bag is one tap and takes measurements and gift
                      notes with it: for a few seconds it can be taken back */}
                  {cleared && (
                    <p role="status" className="mt-5 text-sm text-charcoal">
                      Bag cleared ·{" "}
                      <button
                        type="button"
                        onClick={undoClear}
                        className="-my-3 py-3 font-medium underline underline-offset-2 hover:text-charcoal/70 transition-colors"
                      >
                        Undo
                      </button>
                    </p>
                  )}
                  {/* The last line's bin empties the bag: its Undo waits here */}
                  {removed && !cleared && (
                    <p role="status" className="mt-5 text-sm text-charcoal">
                      Removed<span className="sr-only"> {removed.line.name}</span> ·{" "}
                      <button
                        type="button"
                        onClick={undoRemove}
                        className="-my-3 py-3 font-medium underline underline-offset-2 hover:text-charcoal/70 transition-colors"
                      >
                        Undo
                      </button>
                    </p>
                  )}
                </div>
              ) : (
                <div className="relative flex flex-col gap-4">
                  {/* Lines already in the bag are simply there when it opens;
                      one added while it is open rises in, one taken out fades
                      and the rest close the gap. The exit only ever ran with
                      AnimatePresence round the list, which it never had. */}
                  <AnimatePresence initial={false} mode="popLayout">
                  {withRemovedNote(items.map((item, index) => {
                    const key = {
                      id: item.id,
                      size: item.size,
                      color: item.color,
                      giftMessage: item.giftMessage,
                      measurements: item.measurements,
                    };
                    const atMost = item.quantity >= MAX_PER_LINE;
                    return (
                    <motion.div
                      key={`${item.id}-${item.size ?? ""}-${item.color ?? ""}-${item.giftMessage ?? ""}-${item.measurements ?? ""}`}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18, ease: EASE_OUT } }}
                      transition={{
                        duration: 0.2,
                        ease: EASE_OUT,
                        layout: { duration: 0.25, ease: EASE_IN_OUT },
                      }}
                      className="flex gap-4 p-3 rounded-2xl bg-white/60 border border-lavender-soft/30"
                    >
                      {/* Image */}
                      <div className="w-20 h-24 rounded-xl overflow-hidden bg-cream-soft flex-shrink-0">
                        <BagImage src={item.image} alt={item.name} />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate" title={item.name}>
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
                            <p className="text-[10px] tracking-caps-sm uppercase text-charcoal-light mb-0.5">
                              Your measurements
                            </p>
                            <p className="text-xs text-charcoal break-words">{item.measurements}</p>
                          </div>
                        )}
                        {item.giftMessage && (
                          <div className="mt-1.5 px-2 py-1.5 rounded-lg bg-lavender-bg/60 border border-lavender-soft/40">
                            <p className="text-[10px] tracking-caps-sm uppercase text-charcoal-light mb-0.5">
                              Gift card
                            </p>
                            <p className="text-xs text-charcoal italic break-words">
                              &ldquo;{item.giftMessage}&rdquo;
                            </p>
                          </div>
                        )}
                        {/* What the line costs, with the price of one beside
                            it once there are several: "£24.00" next to a 3
                            read as the total and was not */}
                        <p className="text-sm font-medium mt-1 tabular-nums">
                          {formatPence(item.price * item.quantity)}
                          {item.quantity > 1 && (
                            <span className="ml-1.5 text-xs font-normal text-charcoal-light">
                              {formatPence(item.price)} each
                            </span>
                          )}
                        </p>

                        {/* Quantity controls: 40px squares on a phone, where a
                            thumb pressed them, 36px with a mouse. The bin
                            stays at the far end, well clear of the minus. */}
                        <div className="flex items-center gap-3 mt-2">
                          {/* At 1 the minus takes the line out, so it gets
                              the bin's Undo too */}
                          <button
                            onClick={() =>
                              item.quantity > 1
                                ? updateQuantity(key, item.quantity - 1)
                                : removeWithUndo(item, index)
                            }
                            className="size-10 sm:size-9 rounded-lg bg-lavender-bg flex items-center justify-center hover:bg-lavender/20 transition-colors"
                            aria-label={`Decrease quantity of ${item.name}`}
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-sm font-medium min-w-6 tabular-nums text-center">
                            {item.quantity}
                          </span>
                          {/* At ten it stays in the tab order and says it is
                              unavailable (aria-disabled, not disabled), with
                              the way to ask for more right under the line */}
                          <button
                            onClick={() => {
                              if (!atMost) updateQuantity(key, item.quantity + 1);
                            }}
                            aria-disabled={atMost || undefined}
                            className="size-10 sm:size-9 rounded-lg bg-lavender-bg flex items-center justify-center hover:bg-lavender/20 transition-colors aria-disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-lavender-bg"
                            aria-label={`Increase quantity of ${item.name}`}
                          >
                            <Plus size={14} />
                          </button>

                          <button
                            onClick={() => removeWithUndo(item, index)}
                            className="ml-auto -mr-2 size-10 grid place-items-center text-charcoal-light hover:text-red-400 transition-colors"
                            aria-label={`Remove ${item.name} from bag`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {/* Ten of one piece is the bag's most (MAX_PER_LINE);
                            past that it is a word with Kristina, who sews them */}
                        {atMost && (
                          <p className="text-xs text-charcoal-light mt-1.5">
                            <a
                              href={whatsappLink(moreThanTenMessage(item))}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-2 hover:text-charcoal transition-colors"
                            >
                              Need more? Message Kristina
                            </a>
                          </p>
                        )}
                      </div>
                    </motion.div>
                    );
                  }))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Footer */}
            {/* Never taller than 70% of the drawer: on a 320x460 screen it
                grew past the bottom and its last button could not be reached. Past
                that height it scrolls on its own, under the list, not inside
                it — and it clears the iPhone's home bar. */}
            {items.length > 0 && (
              <div className="border-t border-lavender-soft/40 px-6 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] space-y-4 shrink-0 max-h-[70%] overflow-y-auto overscroll-contain">
                {/* Free shipping progress */}
                {region === "uk" && freeShippingThreshold > 0 && (() => {
                  const spent = totalPrice();
                  const remaining = freeShippingThreshold - spent;
                  const pct = Math.min((spent / freeShippingThreshold) * 100, 100);
                  return (
                    <div>
                      {remaining > 0 ? (
                        <p className="text-xs text-charcoal-light mb-1.5 flex items-center gap-1">
                          <Package size={12} className="text-lavender" />
                          Add{" "}
                          <span className="font-medium text-charcoal tabular-nums">
                            {formatPence(remaining)}
                          </span>{" "}
                          more for free UK delivery
                        </p>
                      ) : (
                        <p className="text-xs text-green-700 font-medium mb-1.5 flex items-center gap-1">
                          <Package size={12} />
                          You qualify for free UK delivery! 🎉
                        </p>
                      )}
                      {/* A line of gold running stitch, sewn as far as the
                          share spent, on a pale thread of what is left. It
                          opens where it is and moves only when the amount
                          does: clip-path uncovers stitches already laid out,
                          where scaling the bar would stretch them into dashes. At free
                          delivery it is tied off with a knot at the end —
                          tied in front of her only when she crossed the line
                          (see tyingKnot), simply there otherwise. The row
                          keeps the old bar's 6px, so nothing below moves. */}
                      <div className="relative h-1.5 w-full flex items-center" aria-hidden="true">
                        <div className="h-0.5 w-full bg-lavender-bg rounded-full">
                          <div
                            className="h-full w-full transition-[clip-path] duration-400 ease-out motion-reduce:transition-none"
                            style={{
                              background: `repeating-linear-gradient(90deg, rgb(176 136 72 / 0.6) 0 6px, transparent 6px 10px)`,
                              clipPath: `inset(0 ${100 - pct}% 0 0)`,
                            }}
                          />
                        </div>
                        {qualifiesForFree && (
                          <span
                            className={`absolute right-0 top-0 size-1.5 rounded-full ${
                              tyingKnot
                                ? // after the 0.4s the stitches take to reach the end
                                  "animate-[bty-knot_0.3s_cubic-bezier(0.34,1.56,0.64,1)_0.35s_both] motion-reduce:animate-none"
                                : ""
                            }`}
                            style={{ background: STITCH_GOLD }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Delivery region — decides which rate Stripe offers */}
                <div>
                  <p className="text-[11px] tracking-caps-sm uppercase text-charcoal-light mb-1.5">
                    Delivering to
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["uk", "United Kingdom"],
                      ["international", "Rest of world"],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRegion(value)}
                        aria-pressed={region === value}
                        className={`py-2 rounded-chip border text-xs font-medium transition-colors ${
                          region === value
                            ? "bg-lavender border-lavender text-charcoal"
                            : "bg-white border-lavender-soft/50 text-charcoal-light hover:border-lavender"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Friend discount — from the cookie a friend's link left, or a typed code */}
                {/* With the shop discount switched off (£0) there is nothing to
                    say, rather than "Add £0 more for £0 off" */}
                {friend && friend.discount > 0 && (() => {
                  const short = Math.max(0, friend.minBasket - totalPrice());
                  const applies = friendApplies;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2 text-xs bg-lavender-bg/60 border border-lavender-soft/40 rounded-lg px-3 py-2">
                        <span className="text-charcoal inline-flex items-start gap-1.5">
                          <Sparkles size={13} className="text-lavender shrink-0 mt-0.5" aria-hidden="true" />
                          <span>
                            {applies ? (
                              <>
                                <strong>{pounds(friend.discount)} off</strong> your first order
                                {friend.firstName ? `, from ${friend.firstName}` : ""}
                              </>
                            ) : (
                              <>
                                Add <strong>{pounds(short)}</strong> more for{" "}
                                {friend.firstName ? `${friend.firstName}'s` : "the"} {pounds(friend.discount)} off
                              </>
                            )}
                          </span>
                        </span>
                        <button
                          onClick={() => {
                            setFriend(null);
                            clearReferralCookie();
                          }}
                          className="text-charcoal-light hover:text-charcoal underline underline-offset-2 shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                      {applies && (
                        <div>
                          <input
                            ref={friendEmailRef}
                            type="email"
                            value={friendEmail}
                            onChange={(e) => setFriendEmail(e.target.value)}
                            placeholder="Email you'll check out with"
                            aria-label="Email you'll check out with"
                            autoComplete="email"
                            className="w-full text-xs px-3 py-2 rounded-field border border-lavender-soft/50 bg-white focus:outline-none focus:border-lavender-ink focus:ring-2 focus:ring-lavender-ink/25"
                          />
                          <p className="text-[11px] text-charcoal-light mt-1">
                            First orders only, so we check by email. Not combined with other codes.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Gift card, or a friend's code typed by hand */}
                <div>
                  {giftCard && (
                    <div className="flex items-center justify-between gap-2 text-xs bg-lavender-bg/60 border border-lavender-soft/40 rounded-lg px-3 py-2 mb-2">
                      <span className="text-charcoal">
                        Gift card <strong>{giftCard.code}</strong> —{" "}
                        <span className="tabular-nums">
                          {formatPence(Math.min(giftCard.balance, Math.max(0, totalPrice() - (friend && friendApplies ? friend.discount : 0))))}
                        </span>{" "}
                        off
                      </span>
                      <button
                        onClick={() => {
                          setGiftCard(null);
                          setCodeInput("");
                        }}
                        className="text-charcoal-light hover:text-charcoal underline underline-offset-2"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  {(!giftCard || !friend) && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setCheckingCode(true);
                        setCodeError(null);
                        setCodeNote(null);
                        const typed = codeInput.trim();
                        try {
                          // A newsletter welcome code is good, just not here:
                          // it goes in on Stripe's payment page, so say where
                          // rather than send it to the gift card lookup, which
                          // answered "That code isn't valid". A friend code has
                          // a shape of its own; everything else is tried as a
                          // gift card.
                          if (looksLikeWelcomeCode(typed)) {
                            setCodeNote(
                              welcomeCodeNote(typed.toUpperCase(), {
                                friendDiscount: friendApplies,
                                giftCard: !!giftCard,
                              })
                            );
                          } else if (looksLikeReferralCode(typed)) {
                            if (friend) {
                              setCodeError("One friend code per order — remove the current one first");
                            } else {
                              const res = await fetch(`/api/referrals?code=${encodeURIComponent(typed)}`);
                              const data = await res.json();
                              if (!res.ok || !data.valid) {
                                setCodeError(data.error ?? "That code isn't valid");
                              } else {
                                setFriend({
                                  code: data.code,
                                  firstName: data.firstName ?? null,
                                  discount: data.shopDiscount ?? 0,
                                  minBasket: data.minBasket ?? 0,
                                });
                                writeReferralCookie(data.code);
                                trackReferralApply("shop");
                                setCodeInput("");
                              }
                            }
                          } else if (giftCard) {
                            setCodeError("One gift card per order — remove the current one first");
                          } else {
                            const res = await fetch(`/api/gift-cards?code=${encodeURIComponent(typed)}`);
                            const data = await res.json();
                            if (!res.ok || !data.valid) {
                              setCodeError(data.error ?? "That code isn't valid");
                            } else {
                              setGiftCard({ code: data.code, balance: data.balance });
                              setCodeInput("");
                            }
                          }
                        } catch {
                          setCodeError("Could not check that code");
                        }
                        setCheckingCode(false);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={codeInput}
                        onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 30))}
                        placeholder={giftCard ? "Friend code" : friend ? "Gift card code" : "Gift card or friend code"}
                        aria-label="Gift card or friend code"
                        // Codes are capitals and made-up words: the phone's
                        // keyboard types capitals, does not "correct" ANNA-K7P2
                        // into a word, and its return key says Go
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        autoComplete="off"
                        enterKeyHint="go"
                        className="flex-1 min-w-0 text-xs px-3 py-2 rounded-field border border-lavender-soft/50 bg-white focus:outline-none focus:border-lavender-ink focus:ring-2 focus:ring-lavender-ink/25"
                      />
                      {/* While the code is checked the word stays (invisible)
                          and the spinner sits over it, so the button keeps
                          its width — "…" used to shrink it and move the field */}
                      <button
                        type="submit"
                        disabled={checkingCode || codeInput.trim().length < 4}
                        aria-busy={checkingCode}
                        className="press relative shrink-0 px-3 py-2 rounded-field bg-lavender/20 hover:bg-lavender/30 text-charcoal text-xs font-medium disabled:opacity-50"
                      >
                        <span className={checkingCode ? "opacity-0" : undefined}>Apply</span>
                        {checkingCode && (
                          <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
                            <Loader2 size={14} className="animate-spin" />
                          </span>
                        )}
                      </button>
                    </form>
                  )}
                  {codeError && <p role="alert" className="text-[11px] text-rose-700 mt-1">{codeError}</p>}
                  {codeNote && (
                    <p role="status" className="text-[11px] text-charcoal mt-1 leading-relaxed">
                      {codeNote}
                    </p>
                  )}
                </div>

                {/* Total */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-charcoal-light">Subtotal</p>
                  <p className="font-serif text-xl tabular-nums">
                    {formatPence(totalPrice())}
                  </p>
                </div>
                <div className="text-xs text-charcoal-light space-y-0.5">
                  <p>Delivery selected at checkout</p>
                </div>

                {/* Error message */}
                {error && (
                  <p role="alert" className="text-xs text-rose-700 bg-red-50 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                {/* Checkout button. .press gives it the site's press and
                    carries its colour and shadow changes, in place of a
                    transition-all that also animated layout */}
                <button
                  onClick={handleCheckout}
                  disabled={isLoading}
                  aria-describedby={termsId}
                  className="press w-full py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium tabular-nums hover:bg-lavender-hover hover:shadow-lg hover:shadow-lavender/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Redirecting…
                    </>
                  ) : (
                    "Checkout — " + formatPence(totalPrice())
                  )}
                </button>
                {/* What paying agrees to, said before Stripe's page: the link
                    closes the bag (every navigation does) and the bag is kept */}
                <TermsNote id={termsId} doing="paying" className="text-center" />

                {/* Clear cart — with a few seconds' Undo in the empty bag */}
                <button
                  onClick={clearWithUndo}
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
