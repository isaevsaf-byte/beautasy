"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Heart, ArrowRight, CheckCircle } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { fadeUp, stagger } from "@/components/animations";
import { useCart } from "@/store/useCart";
import { trackPurchase } from "@/lib/analytics";

const ADS_PURCHASE_CONVERSION = "AW-18152477897/AdUTCNCJjKscEMmp489D";

interface OrderItem {
  id: string;
  slug?: string;
  name: string;
  quantity: number;
  amountTotal: number;
}

interface OrderSummary {
  paid: boolean;
  reference?: string;
  total?: number;
  shippingTotal?: number;
  items?: OrderItem[];
}

/* ── Order summary: clears the bag, reports the purchase, and shows the
      customer what they actually bought (the page used to show nothing). ── */
function OrderDetails() {
  const clearCart = useCart((state) => state.clearCart);
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
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

  if (!order?.paid || !order.items?.length) return null;

  return (
    <motion.div
      variants={fadeUp}
      custom={4}
      className="bg-white/70 border border-lavender-soft/40 rounded-2xl p-6 mb-8 text-left"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-xs tracking-[0.2em] uppercase text-charcoal-light">Your order</h3>
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
            <span className="tabular-nums">£{(item.amountTotal / 100).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      {typeof order.shippingTotal === "number" && (
        <div className="flex justify-between gap-4 text-sm pt-3 border-t border-lavender-soft/40">
          <span className="text-charcoal-light">Delivery</span>
          <span className="tabular-nums">
            {order.shippingTotal === 0 ? "Free" : `£${(order.shippingTotal / 100).toFixed(2)}`}
          </span>
        </div>
      )}
      <div className="flex justify-between gap-4 pt-2 font-medium">
        <span>Total</span>
        <span className="tabular-nums">£{((order.total ?? 0) / 100).toFixed(2)}</span>
      </div>
      <p className="text-xs text-charcoal-light mt-4 leading-relaxed">
        Handmade to order — please allow 3–5 business days in the atelier before dispatch.
      </p>
    </motion.div>
  );
}

export default function SuccessPage() {
  return (
    <>
      <Header />
      <main className="pt-28">
        <section className="min-h-[70vh] flex items-center justify-center py-16 md:py-24">
          <div className="max-w-lg mx-auto px-6 text-center">
            <motion.div
              initial="hidden"
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

              {/* Heading */}
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="font-serif text-3xl sm:text-4xl mb-4"
              >
                Thank you for
                <br />
                <span className="italic text-lavender">your order!</span>
              </motion.h2>

              {/* Message */}
              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-charcoal-light leading-relaxed mb-3"
              >
                We will start crafting your items soon. Every piece is made by
                hand with care in our Southampton atelier.
              </motion.p>

              <motion.p
                variants={fadeUp}
                custom={3}
                className="text-sm text-charcoal-light/70 flex items-center justify-center gap-1.5 mb-10"
              >
                Made with <Heart size={14} className="text-lavender fill-lavender" /> just for you
              </motion.p>

              {/* What they just bought */}
              <Suspense fallback={null}>
                <OrderDetails />
              </Suspense>

              {/* Confirmation note */}
              <motion.div
                variants={fadeUp}
                custom={4}
                className="bg-lavender-bg rounded-2xl p-6 mb-10"
              >
                <p className="text-sm text-charcoal-light leading-relaxed">
                  A confirmation email has been sent to your inbox. If you have
                  any questions about your order, please don&apos;t hesitate to{" "}
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
                  className="group inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
                >
                  Continue Shopping
                  <ArrowRight
                    size={16}
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </Link>
                <Link
                  href="/orders"
                  className="inline-flex items-center gap-2 px-8 py-3.5 border border-charcoal/20 text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:border-lavender hover:bg-lavender/10 transition-all duration-300"
                >
                  View My Orders
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
