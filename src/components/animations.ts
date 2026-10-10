/**
 * The shared entrances for framer-motion.
 *
 * The curve is the site's ease-out (globals.css, --ease-out): it starts fast,
 * so the eye sees movement the moment it looks, and settles gently. Kept to
 * half a second, a short rise and a short gap between neighbours — at 0.7s,
 * 30px and 120ms apart, the ninth card on a page arrived nearly two seconds
 * after the first, and the price lines on /atelier were still arriving after
 * the visitor had read them.
 */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: Math.min(i, 8) * 0.06, duration: 0.5, ease: EASE_OUT },
  }),
};

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.5, ease: EASE_OUT },
  },
};

export const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
};
