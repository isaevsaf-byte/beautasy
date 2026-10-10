"use client";

import { useEffect, useRef, useState } from "react";
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
  /** Extra classes for the button, e.g. w-full beside a full-width sibling */
  className?: string;
}

/** One label in the shared cell: quick to cross over, and it barely grows, so it reads as one button changing its mind */
const label = (shown: boolean) =>
  `col-start-1 row-start-1 flex items-center justify-center gap-2 transition-[opacity,transform] duration-150 ease-out ${
    shown ? "opacity-100 scale-100" : "opacity-0 scale-95"
  }`;

export default function AddToCartButton({
  id,
  name,
  slug,
  price,
  image,
  size,
  className = "",
}: AddToCartButtonProps) {
  const addItem = useCart((state) => state.addItem);
  const [added, setAdded] = useState(false);
  // "Added!" goes back after a moment; a second tap starts the moment again,
  // and a card that leaves the page takes its timer with it
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function handleAdd() {
    addItem({ id, name, slug, price, image, size });
    trackAddToCart([{ id, name, slug, price, quantity: 1, variant: size }]);
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      className={`press group inline-flex items-center justify-center px-6 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] hover:shadow-lg hover:shadow-lavender/30 ${className}`}
    >
      {/* Both labels are always there, in one cell of a grid: the button keeps
          the width of the longer one, so nothing beside it moves, and the
          label is in the server's HTML as it is. It used to fade in from
          nothing once scripts arrived — an empty lavender pill until then. */}
      <span className="grid" aria-live="polite">
        <span className={label(!added)} aria-hidden={added}>
          <ShoppingBag size={16} aria-hidden="true" />
          Add to Bag — £{(price / 100).toFixed(2)}
        </span>
        <span className={label(added)} aria-hidden={!added}>
          <Check size={16} aria-hidden="true" />
          Added!
        </span>
      </span>
    </button>
  );
}
