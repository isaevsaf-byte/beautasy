"use client";

import { useEffect, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";

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
  const [shown, setShown] = useState(false);
  useEffect(() => followBookBar(window, heroId, bookId, setShown), [heroId, bookId]);

  return (
    // Phones only: the way to the booking form, while it is still below
    <div
      inert={!shown}
      className={`md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FDFBF7]/95 backdrop-blur-md border-t border-lavender-soft/40 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-3 transition-transform duration-300 ${
        shown ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <a
        href={`#${bookId}`}
        className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium"
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
