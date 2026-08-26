"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, Check } from "lucide-react";
import { useCart } from "@/store/useCart";
import { trackAddToCart } from "@/lib/analytics";

interface AddToCartButtonProps {
  id: string;
  name: string;
  /** Feeds the Meta catalogue id on ad events */
  slug?: string;
  price: number; // in pence
  image: string;
  size?: string;
}

export default function AddToCartButton({
  id,
  name,
  slug,
  price,
  image,
  size,
}: AddToCartButtonProps) {
  const addItem = useCart((state) => state.addItem);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    addItem({ id, name, slug, price, image, size });
    trackAddToCart([{ id, name, slug, price, quantity: 1, variant: size }]);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <button
      onClick={handleAdd}
      className="group inline-flex items-center gap-2 px-6 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30"
    >
      <AnimatePresence mode="wait">
        {added ? (
          <motion.span
            key="added"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2"
          >
            <Check size={16} />
            Added!
          </motion.span>
        ) : (
          <motion.span
            key="add"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2"
          >
            <ShoppingBag size={16} />
            Add to Bag — £{(price / 100).toFixed(2)}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
