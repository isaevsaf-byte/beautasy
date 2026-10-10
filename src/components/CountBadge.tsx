"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE_OUT } from "@/components/animations";

/** What the badge prints: past 99 it stops counting, rather than outgrow the icon */
export function badgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** Which way the count last moved: 1 up, -1 down */
type Way = 1 | -1;

const roll = {
  enter: (way: Way) => ({ y: way > 0 ? "60%" : "-60%", opacity: 0 }),
  shown: { y: 0, opacity: 1 },
  exit: (way: Way) => ({ y: way > 0 ? "-60%" : "60%", opacity: 0 }),
};

/**
 * The little count on the bag and the wishlist.
 *
 * It used to pop up from nothing on every page: the header is drawn afresh
 * for each page and the count only arrives once the browser has read the
 * saved bag, so the same "2" bounced in again and again. Now it is simply
 * there when the page arrives, and only a real change moves it, rolling like
 * a counter: up when the count grows (the old number out at the top, the new
 * in from below), down when it shrinks. It always rolled up, so taking one
 * out of the bag read as adding one.
 */
export default function CountBadge({ count, className }: { count: number; className: string }) {
  // The way is worked out while rendering, from the count it last saw (React's
  // "adjusting state when a prop changes"), so the number leaving and the one
  // arriving are told the same way in the same render
  const [seen, setSeen] = useState(count);
  const [way, setWay] = useState<Way>(1);
  if (count !== seen) {
    setSeen(count);
    setWay(count > seen ? 1 : -1);
  }
  if (count <= 0) return null;
  const label = badgeLabel(count);
  return (
    <span
      className={`absolute overflow-hidden rounded-full bg-lavender text-charcoal font-medium tabular-nums flex items-center justify-center ${className}`}
    >
      <AnimatePresence initial={false} mode="popLayout" custom={way}>
        <motion.span
          key={label}
          custom={way}
          variants={roll}
          initial="enter"
          animate="shown"
          exit="exit"
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="block leading-none"
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
