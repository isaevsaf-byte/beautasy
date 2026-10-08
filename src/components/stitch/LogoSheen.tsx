"use client";

import { useEffect, useRef } from "react";

/**
 * How far into the first stitch under "in Southampton" the logo may shine:
 * the needle stops moving at its --park-at (app/globals.css) and has settled
 * by now, so the two never move at once.
 */
export const SHEEN_AFTER_STITCH = 4.9;

/** How much of the logo is on screen before it shines: the gold letters are in its lower half */
export const IN_VIEW = 0.6;

/** Whether the logo is far enough into view — a first report counts any overlap as "intersecting" */
export function inView(entries: readonly Pick<IntersectionObserverEntry, "isIntersecting" | "intersectionRatio">[]): boolean {
  return entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= IN_VIEW - 0.01);
}

/**
 * Seconds still to wait for the needle, from how far its resting movement
 * has run on its own clock (null: it has not started yet)
 */
export function restAfter(parked: number | null): number {
  return parked === null ? SHEEN_AFTER_STITCH : Math.max(0, SHEEN_AFTER_STITCH - parked);
}

/**
 * Seconds until the first stitch has come to rest — none if it is off the
 * screen (on a phone, scrolled up under the header by the time the logo
 * shows) or not moving at all (less motion). Read from the needle's own
 * animation, so a page opened in a background tab, or come back to, waits
 * for what the visitor actually sees.
 */
function stitchStillSewing(): number {
  const stitch = document.querySelector(".stitched");
  if (!stitch) return 0;
  const box = stitch.getBoundingClientRect();
  const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  if (box.bottom <= header || box.top >= window.innerHeight) return 0;
  const park = stitch
    .querySelector(".stitched-x")
    ?.getAnimations?.()
    .find((animation) => "animationName" in animation && animation.animationName === "bty-x-park");
  if (!park) return 0;
  const time = park.currentTime;
  return restAfter(typeof time === "number" ? time / 1000 : null);
}

/**
 * The gold of the logo catching the light: once, a warm light passes over
 * the letters of "Beautasy" — only the letters, through a mask cut from the
 * logo itself (scripts/logo-gold-mask.mjs) — the way gold leaf glints as it
 * turns. The figure and the wreath never move, and the logo underneath is
 * the picture as it always was, shown at once.
 *
 * It shines where it can be seen: when most of the logo is on screen, and,
 * if the needle is sewing beside it, once the needle is done. A logo that
 * leaves the screen before then waits for its next showing — on a phone it is
 * below the first screen, so it shines as it is scrolled to. Once each time
 * the page opens, like the stitch. The movement is CSS (.logo-sheen in
 * app/globals.css), so nothing moves for a visitor who asked for less motion.
 */
export default function LogoSheen() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const sheen = ref.current;
    if (!sheen || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watch = new IntersectionObserver(
      (entries) => {
        clearTimeout(timer);
        if (!inView(entries)) return;
        timer = setTimeout(() => {
          watch.disconnect();
          sheen.setAttribute("data-shine", "");
        }, Math.max(0.3, stitchStillSewing()) * 1000);
      },
      { threshold: IN_VIEW },
    );
    watch.observe(sheen);
    return () => {
      clearTimeout(timer);
      watch.disconnect();
    };
  }, []);

  return <span ref={ref} className="logo-sheen" aria-hidden="true" />;
}
