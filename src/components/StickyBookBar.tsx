"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import { readConsent, subscribeToConsent } from "@/lib/consent";

/**
 * Whether the phone's booking bar shows: once the first "Choose a time" has
 * scrolled off the top, and only while the booking form is still below the
 * screen — never over the form, or over the footer after it.
 */
export function bookBarShown({
  heroBottom,
  bookTop,
  viewportHeight,
}: {
  /** Where the bottom of the first booking button is, from the top of the screen */
  heroBottom: number;
  /** Where the top of the booking form is, from the top of the screen */
  bookTop: number;
  viewportHeight: number;
}): boolean {
  return heroBottom < 0 && bookTop > viewportHeight;
}

/** What the bar needs from the browser: where things are on the page, the screen's height, and its scrolling */
export interface BookBarWindow {
  document: { getElementById(id: string): { getBoundingClientRect(): { top: number; bottom: number } } | null };
  innerHeight: number;
  addEventListener(type: "scroll" | "resize", listener: () => void, options?: { passive?: boolean }): void;
  removeEventListener(type: "scroll" | "resize", listener: () => void): void;
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(handle: number): void;
}

/**
 * Tells `show` whether the bar should be up — once the page has drawn, then on
 * every scroll and resize — until the function it returns is called.
 *
 * Worked out from where things are on every scroll, not remembered from
 * crossings: a jump from the footer back up the page crosses nothing, and an
 * observer that only hears about crossings would leave the bar hidden. The
 * form's top edge is the one that counts: the bar goes as soon as the form
 * starts to show, so it never covers its fields or its button.
 */
export function followBookBar(
  win: BookBarWindow,
  heroId: string,
  bookId: string,
  show: (shown: boolean) => void
): () => void {
  const place = () => {
    const hero = win.document.getElementById(heroId);
    const book = win.document.getElementById(bookId);
    if (!hero || !book) return;
    show(
      bookBarShown({
        heroBottom: hero.getBoundingClientRect().bottom,
        bookTop: book.getBoundingClientRect().top,
        viewportHeight: win.innerHeight,
      })
    );
  };
  const frame = win.requestAnimationFrame(place);
  win.addEventListener("scroll", place, { passive: true });
  win.addEventListener("resize", place);
  return () => {
    win.cancelAnimationFrame(frame);
    win.removeEventListener("scroll", place);
    win.removeEventListener("resize", place);
  };
}

/**
 * The way to the booking form on a phone, kept in reach while it is still
 * several screens down: on /atelier, and on every service page, where people
 * arrive from Google and the form is at the very bottom.
 *
 * `heroId` is the first "Choose a time" on the page, `bookId` the form's
 * section. Both are looked up by id rather than handed over as refs, so a
 * server-rendered page can use the bar too.
 */
export default function StickyBookBar({
  heroId,
  bookId = "book",
  whatsapp,
}: {
  heroId: string;
  bookId?: string;
  /** The WhatsApp link, with its first line already typed */
  whatsapp: string;
}) {
  const [scrolledPast, setScrolledPast] = useState(false);
  useEffect(() => followBookBar(window, heroId, bookId, setScrolledPast), [heroId, bookId]);
  // On a first visit the cookie banner owns the bottom of the screen, and the
  // bar slid up underneath it, half hidden, with both asking for a tap. The
  // bar waits until the banner has been answered.
  const consentAnswered = useSyncExternalStore(
    subscribeToConsent,
    () => readConsent() !== null,
    () => false
  );
  const shown = scrolledPast && consentAnswered;

  return (
    // Phones only: the way to the booking form, while it is still below.
    // The inset has a 0px fallback, so a browser without it keeps the 0.75rem
    // rather than dropping the whole padding. It slides in a quarter second on
    // the site's strong ease-out: on the default curve, which starts slowly,
    // it seemed to hesitate before coming up. With less motion asked for, the
    // bar appears and goes without sliding. On a touch screen it is a
    // near-solid cream with no blur: a blur under a fixed bar is redrawn on
    // every frame of every scroll, which a phone pays for in battery.
    <div
      inert={!shown}
      className={`md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FDFBF7]/95 backdrop-blur-md pointer-coarse:backdrop-blur-none pointer-coarse:bg-[#FDFBF7]/[0.97] border-t border-lavender-soft/40 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex items-center gap-3 transition-transform duration-250 ease-out motion-reduce:transition-none ${
        shown ? "translate-y-0" : "translate-y-full"
      }`}
    >
      {/* A long press on the button is a press, not a text selection or
          iOS's link preview. Top-stitched, so no .press. */}
      <a
        href={`#${bookId}`}
        className="topstitch flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium select-none [-webkit-touch-callout:none]"
      >
        Choose a time
        <ArrowRight size={16} aria-hidden="true" />
      </a>
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Send Kristina a photo on WhatsApp"
        className="w-12 h-12 shrink-0 rounded-full border border-charcoal/15 flex items-center justify-center text-charcoal"
      >
        <MessageCircle size={18} aria-hidden="true" />
      </a>
    </div>
  );
}
