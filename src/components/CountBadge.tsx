"use client";

import { AnimatePresence, motion } from "framer-motion";
import { EASE_OUT } from "@/components/animations";

/** What the badge prints: past 99 it stops counting, rather than outgrow the icon */
export function badgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * The little count on the bag and the wishlist.
 *
 * It used to pop up from nothing on every page: the header is drawn afresh
 * for each page and the count only arrives once the browser has read the
 * saved bag, so the same "2" bounced in again and again. Now it is simply
 * there when the page arrives, and only a real change moves it — the old
 * number rolls up and out, the new one rolls in from below, like a counter.
 */
export default function CountBadge({ count, className }: { count: number; className: string }) {
  if (count <= 0) return null;
  const label = badgeLabel(count);
  return (
    <span
      className={`absolute overflow-hidden rounded-full bg-lavender text-charcoal font-medium tabular-nums flex items-center justify-center ${className}`}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={label}
          initial={{ y: "60%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-60%", opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="block leading-none"
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
