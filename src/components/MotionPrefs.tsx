"use client";

import { MotionConfig } from "framer-motion";

/**
 * Every framer-motion animation on the site listens to "Reduce motion".
 *
 * The stitch, the pin and the chalk are CSS and already did; the rest — cards
 * rising into place, the bag sliding in, hearts and buttons — moved whatever
 * the visitor had asked her phone for. With "user", fades and colour changes
 * still play (they help you follow what changed) and movement and scaling are
 * dropped.
 */
export default function MotionPrefs({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
