"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { useWishlist, WishlistItem } from "@/store/useWishlist";

interface WishlistButtonProps {
  product: WishlistItem;
  className?: string;
}

export default function WishlistButton({
  product,
  className = "",
}: WishlistButtonProps) {
  const { toggleItem, isWishlisted } = useWishlist();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  const wishlisted = hydrated ? isWishlisted(product.id) : false;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleItem(product);
      }}
      className={`p-3 rounded-full border transition-all duration-300 ${
        wishlisted
          ? "bg-lavender/20 border-lavender text-lavender"
          : "border-charcoal/20 text-charcoal-light hover:border-lavender hover:text-lavender"
      } ${className}`}
      aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
    >
      <motion.div
        animate={{ scale: wishlisted ? [1, 1.3, 1] : 1 }}
        transition={{ duration: 0.3 }}
      >
        <Heart size={18} className={wishlisted ? "fill-lavender" : ""} />
      </motion.div>
    </button>
  );
}
