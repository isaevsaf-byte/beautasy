"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Heart, ArrowRight, CheckCircle } from "lucide-react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { fadeUp, stagger } from "@/components/animations";
import { useCart } from "@/store/useCart";
import { trackPurchase } from "@/lib/analytics";
import { pounds } from "@/lib/friendsLink";
import { clerkEnabled } from "@/lib/clerk";
import FriendsShare from "@/components/FriendsShare";
import TiedOff from "@/components/stitch/TiedOff";
import { formatPence } from "@/lib/money";

const ADS_PURCHASE_CONVERSION = "AW-18152477897/AdUTCNCJjKscEMmp489D";

interface OrderItem {
  id: string;
  slug?: string;
  name: string;
  quantity: number;
  /** Before any gift card or discount */
  amountSubtotal?: number;
  amountTotal: number;
}

interface OrderSummary {
  paid: boolean;
  kind?: "order" | "giftCard";
  reference?: string;
  total?: number;
  shippingTotal?: number;
  discountTotal?: number;
  items?: OrderItem[];
  /** The buyer's own Beautasy Friends link, when the programme is on */
  friendsCode?: string | null;
  friendsOffer?: { give: number; get: number } | null;
}

const money = formatPence;

/* ── Clears the bag, reports the purchase, and fetches what was bought. ── */
function useReceipt(sessionId: string | null): OrderSummary | null {
  const clearCart = useCart((state) => state.clearCart);
  const [order, setOrder] = useState<OrderSummary | null>(null);

  useEffect(() => {
    // Only act on a real Stripe session, so landing on /success directly
    // neither wipes a bag nor reports a purchase.
    if (!sessionId) return;

    clearCart();

    let cancelled = false;
    fetch(`/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data: OrderSummary) => {
        if (cancelled || !data?.paid) return;
        setOrder(data);
        trackPurchase({
          transactionId: sessionId,
          valuePence: data.total ?? 0,
          items: (data.items ?? []).map((item) => ({
            id: item.id,
            slug: item.slug,
            name: item.name,
            price: item.quantity > 0 ? item.amountTotal / item.quantity : item.amountTotal,
            quantity: item.quantity,
          })),
          adsConversionLabel: ADS_PURCHASE_CONVERSION,
        });
      })
      .catch(() => {/* the confirmation email still has the details */});

    return () => {
      cancelled = true;
    };
  }, [clearCart, sessionId]);

  return order;
}

/* ── What they just bought. A gift card has no delivery and nothing to sew,
      and an order a gift card paid for in full still shows what it was. ── */
function OrderDetails({ order, giftCard }: { order: OrderSummary; giftCard: boolean }) {
  if (!order.paid || !order.items?.length) return null;

  const give = order.friendsOffer ? pounds(order.friendsOffer.give) : "£5";
  const get = order.friendsOffer ? pounds(order.friendsOffer.get) : "£5";
  const discount = order.discountTotal ?? 0;

  return (
    <>
    {/* The moment they are most likely to tell someone: their own link, right here */}
    {order.friendsCode && (
      <motion.div
        variants={fadeUp}
        custom={4}
        className="bg-lavender-bg rounded-2xl p-6 mb-8 text-left"
      >
        <p className="text-xs tracking-[0.2em] uppercase text-charcoal-light mb-2">Give {give}, get {get}</p>
        <p className="text-sm text-charcoal-light leading-relaxed mb-4">
          Know someone who&apos;d love a piece made for them, or has a dress that never quite fitted? Send them
          your link: they get {give} off their first order or first alteration, and {get} of Beautasy credit lands
          with you when they do.
        </p>
        <FriendsShare code={order.friendsCode} />
      </motion.div>
    )}
    <motion.div
      variants={fadeUp}
      custom={4}
      className="bg-white/70 border border-lavender-soft/40 rounded-2xl p-6 mb-8 text-left"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-xs tracking-[0.2em] uppercase text-charcoal-light">
          {giftCard ? "Your gift card" : "Your order"}
        </h3>
        {order.reference && (
          <span className="text-xs font-mono text-charcoal-light">#{order.reference}</span>
        )}
      </div>
      <ul className="space-y-2 mb-4">
        {order.items.map((item, i) => (
          <li key={`${item.id}-${i}`} className="flex justify-between gap-4 text-sm">
            <span className="text-charcoal-light">
              {item.name} × {item.quantity}
            </span>
            <span className="tabular-nums">{money(item.amountSubtotal ?? item.amountTotal)}</span>
          </li>
        ))}
      </ul>
      {!giftCard && typeof order.shippingTotal === "number" && (
        <div className="flex justify-between gap-4 text-sm pt-3 border-t border-lavender-soft/40">
          <span className="text-charcoal-light">Delivery</span>
          <span className="tabular-nums">
            {order.shippingTotal === 0 ? "Free" : money(order.shippingTotal)}
          </span>
        </div>
      )}
      {discount > 0 && (
        <div className="flex justify-between gap-4 text-sm pt-2">
          <span className="text-charcoal-light">Gift card &amp; discounts</span>
          <span className="tabular-nums">−{money(discount)}</span>
        </div>
      )}
      <div className="flex justify-between gap-4 pt-2 font-medium">
        <span>Total</span>
        <span className="tabular-nums">{money(order.total ?? 0)}</span>
      </div>
      <p className="text-xs text-charcoal-light mt-4 leading-relaxed">
        {giftCard
          ? "The code is in your receipt email as well, in case the card goes astray."
          : "Handmade to order — please allow 3–5 business days in the atelier before dispatch."}
      </p>
    </motion.div>
    </>
  );
}

/* ── For a guest there is no "My Orders" to go to — it is a sign-in page and
      then "No orders yet". The receipt is in their email, so that is what
      they are told. A gift card is never in My Orders at all. ── */
function ReceiptWhere({ giftCard }: { giftCard: boolean }) {
  const inEmail = (
    <p className="text-sm text-charcoal-light px-4 py-3.5">Your receipt is in your email</p>
  );
  if (giftCard || !clerkEnabled) return inEmail;
  return (
    <>
      <SignedIn>
        <Link
          href="/orders"
          className="inline-flex items-center gap-2 px-8 py-3.5 border border-charcoal/20 text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:border-lavender hover:bg-lavender/10 transition-colors duration-300"
        >
          View My Orders
        </Link>
      </SignedIn>
      <SignedOut>{inEmail}</SignedOut>
    </>
  );
}

/* ── The page itself. Before the address is read (the prerendered HTML) it
      says only "thank you": the rest depends on what was bought. ── */
function SuccessContent({ sessionId, giftCardHint }: { sessionId: string | null; giftCardHint: boolean }) {
  const order = useReceipt(sessionId);
  const giftCard = giftCardHint || order?.kind === "giftCard";

  return (
    <>
      {/* Heading. A paid order holds, so it is tied off under its last words,
          as a booking that holds its time is (stitch/TiedOff.tsx); mb-6 leaves
          the seam its room above the message. initial={false}: the seam is
          sewn as the page appears, so the heading is not faded in over it. */}
      <motion.h2
        variants={fadeUp}
        custom={1}
        initial={false}
        className="font-serif text-3xl sm:text-4xl mb-6"
      >
        Thank you for
        <br />
        <span className="italic text-lavender">
          <TiedOff>{giftCard ? "your gift!" : "your order!"}</TiedOff>
        </span>
      </motion.h2>

      {/* Message */}
      <motion.p
        variants={fadeUp}
        custom={2}
        className={`text-charcoal-light leading-relaxed ${giftCard ? "mb-10" : "mb-3"}`}
      >
        {giftCard
          ? "Your gift card is emailed to the person it's for — straight away, or on the day you picked — with your message on it."
          : "We will start crafting your items soon. Every piece is made by hand with care in our Southampton atelier."}
      </motion.p>

      {!giftCard && (
        <motion.p
          variants={fadeUp}
          custom={3}
          className="text-sm text-charcoal-light/70 flex items-center justify-center gap-1.5 mb-10"
        >
          Made with <Heart size={14} className="text-lavender fill-lavender" /> just for you
        </motion.p>
      )}

      {/* What they just bought */}
      {order && <OrderDetails order={order} giftCard={giftCard} />}

      {/* Confirmation note */}
      <motion.div
        variants={fadeUp}
        custom={4}
        className="bg-lavender-bg rounded-2xl p-6 mb-10"
      >
        <p className="text-sm text-charcoal-light leading-relaxed">
          {giftCard
            ? "Your receipt has been sent to your inbox. Wrong address, or a different day? Please "
            : "A confirmation email has been sent to your inbox. If you have any questions about your order, please don't hesitate to "}
          <Link href="/contact" className="text-charcoal underline underline-offset-2 hover:text-lavender transition-colors">
            contact us
          </Link>
          .
        </p>
      </motion.div>

      {/* Actions */}
      <motion.div
        variants={fadeUp}
        custom={5}
        className="flex flex-col sm:flex-row items-center justify-center gap-4"
      >
        <Link
          href="/shop"
          className="press group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover hover:shadow-lg hover:shadow-lavender/30"
        >
          Continue Shopping
          <ArrowRight
            size={16}
            className="group-hover:translate-x-1 transition-transform"
          />
        </Link>
        <ReceiptWhere giftCard={giftCard} />
      </motion.div>
    </>
  );
}

/** Reads the address Stripe sent the shopper back to. */
function FromStripe() {
  const searchParams = useSearchParams();
  return (
    <SuccessContent
      sessionId={searchParams.get("session_id")}
      giftCardHint={searchParams.get("kind") === "gift-card"}
    />
  );
}

export default function SuccessPage() {
  return (
    <>
      <Header />
      <main className="pt-28">
        <section className="min-h-[70vh] flex items-center justify-center py-16 md:py-24">
          <div className="max-w-lg mx-auto px-6 text-center">
            {/* initial={false}: the thank-you is the whole point of the page,
                painted as it is rather than faded in once scripts arrive */}
            <motion.div
              initial={false}
              animate="visible"
              variants={stagger}
            >
              {/* Check icon */}
              <motion.div
                variants={fadeUp}
                custom={0}
                className="mb-8"
              >
                <div className="w-20 h-20 rounded-full bg-lavender/20 flex items-center justify-center mx-auto">
                  <CheckCircle size={40} className="text-lavender" />
                </div>
              </motion.div>

              {/* Nothing in the fallback talks about sewing or posting: until
                  the address is read, this could be a gift card */}
              <Suspense
                fallback={<h2 className="font-serif text-3xl sm:text-4xl mb-4">Thank you!</h2>}
              >
                <FromStripe />
              </Suspense>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
