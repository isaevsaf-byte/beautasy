"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Heart, ArrowRight, CheckCircle } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { fadeUp, stagger } from "@/components/animations";
import { useCart } from "@/store/useCart";

/* ── Cart clearer — isolated so useSearchParams gets a Suspense boundary ── */
function CartClearer() {
  const clearCart = useCart((state) => state.clearCart);
  const searchParams = useSearchParams();

  useEffect(() => {
    // Only clear the cart when Stripe sends us a real session_id.
    // This prevents the cart being wiped if someone navigates to /success directly.
    const sessionId = searchParams.get("session_id");
    if (sessionId) {
      clearCart();
    }
  }, [clearCart, searchParams]);

  return null;
}

export default function SuccessPage() {
  return (
    <>
      {/* Suspense boundary required for useSearchParams in App Router */}
      <Suspense fallback={null}>
        <CartClearer />
      </Suspense>

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
                  href="/"
                  className="inline-flex items-center gap-2 px-8 py-3.5 border border-charcoal/20 text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:border-lavender hover:bg-lavender/10 transition-all duration-300"
                >
                  Back Home
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
