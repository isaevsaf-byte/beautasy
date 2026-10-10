"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { EASE_OUT } from "@/components/animations";
import { useWishlist, WishlistItem } from "@/store/useWishlist";
import { useIsClient } from "@/lib/useIsClient";

interface WishlistButtonProps {
  product: WishlistItem;
  className?: string;
}

export default function WishlistButton({
  product,
  className = "",
}: WishlistButtonProps) {
  const { toggleItem, isWishlisted } = useWishlist();
  const hydrated = useIsClient();

  const wishlisted = hydrated ? isWishlisted(product.id) : false;
  // The heart beats when the visitor saves it, not when the page loads. Tied
  // to "is it saved", it beat on every saved heart on the page as the wishlist
  // was read from the browser. A count of saves instead, so each save beats once.
  const [saves, setSaves] = useState(0);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!wishlisted) setSaves((n) => n + 1);
        toggleItem(product);
      }}
      className={`p-3 rounded-full border transition-colors duration-200 ${
        wishlisted
          ? "bg-lavender/20 border-lavender text-lavender"
          : "border-charcoal/20 text-charcoal-light hover:border-lavender hover:text-lavender"
      } ${className}`}
      aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
    >
      {/* One small beat: to 115% and back in a quarter of a second. At 130%
          over 0.3s the heart swelled past its ring and lagged the tap. */}
      <motion.div
        key={saves}
        animate={saves > 0 && wishlisted ? { scale: [1, 1.15, 1] } : undefined}
        transition={{ duration: 0.25, ease: EASE_OUT }}
      >
        <Heart size={18} className={wishlisted ? "fill-lavender" : ""} />
      </motion.div>
    </button>
  );
}
