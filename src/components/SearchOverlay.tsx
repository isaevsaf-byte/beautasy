"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useDialog, useScrollLock } from "@/lib/useDialog";
import { formatPence } from "@/lib/money";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Loader2, Scissors, CalendarCheck, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useIsClient } from "@/lib/useIsClient";
import { trackSearch } from "@/lib/analytics";
import { whatsappLink } from "@/lib/business";
/* eslint-disable @next/next/no-img-element */

/** A product or gift box from the shop, or one of the atelier's services (see @/lib/serviceSearch) */
interface SearchResult {
  _id: string;
  kind?: "service" | "product";
  name: string;
  href: string;
  /** Pence, for a product */
  price?: number;
  /** "from £8", for a service: as its page prints it */
  priceLabel?: string | null;
  label: string;
  image?: string | null;
}

/**
 * Site search. The shop had none, so anyone arriving from an ad for a specific
 * piece had to guess which category it lived in. It now answers the atelier's
 * words too — hem, zip, wedding — and those come first, because that is what
 * most people searching here are after.
 */
export default function SearchOverlay({ className = "" }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useIsClient();

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    setSearched(false);
  }, []);

  // The page behind stays still (the shared, counted lock: closing the search
  // over the open phone menu no longer unfreezes the page under the menu).
  // Focus lands in the field a frame after it opens, Tab stays in the panel,
  // Escape closes it and focus goes back to the search button.
  // On an iPhone that frame-later focus puts the caret in the field but does
  // not raise the keyboard — iOS only does that for a focus made inside the
  // tap itself, and the field does not exist yet at the tap. The 60ms timer
  // this replaces was no different; a visitor taps the field once.
  useScrollLock(isOpen);
  const panelRef = useDialog(isOpen, close, inputRef);

  // Debounced lookup — one request per pause in typing, not per keystroke
  useEffect(() => {
    const term = query.trim();
    const controller = new AbortController();

    const timer = setTimeout(() => {
      if (term.length < 2) {
        setResults([]);
        setSearched(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          setResults(data.results ?? []);
          setSearched(true);
          trackSearch(term);
        })
        .catch(() => {/* aborted or offline — keep the previous list */})
        .finally(() => setLoading(false));
    }, term.length < 2 ? 0 : 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const overlay = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[9998]"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Search Beautasy"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed top-0 left-0 right-0 z-[9999] bg-[#FDFBF7] shadow-xl"
          >
            <div className="max-w-2xl mx-auto px-6 py-6">
              {/* A search landmark, and a form so the keyboard's Search key
                  does something: results arrive as you type, so it puts the
                  keyboard away to show them instead of reloading the page */}
              <form
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  inputRef.current?.blur();
                }}
                className="flex items-center gap-3 border-b border-lavender-soft/60 pb-3"
              >
                <Search size={20} className="text-charcoal-light shrink-0" />
                <input
                  ref={inputRef}
                  type="search"
                  enterKeyHint="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="hem, zip, wedding dress, scrunchie…"
                  aria-label="Search alterations and the shop"
                  className="flex-1 min-w-0 bg-transparent text-lg text-charcoal placeholder:text-charcoal-light/60 focus:outline-none"
                />
                {loading && <Loader2 size={16} className="animate-spin text-lavender shrink-0" />}
                {/* A 44px target round the same cross; -m-2 keeps it in place */}
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close search"
                  className="size-11 -m-2 grid place-items-center text-charcoal-light hover:text-charcoal transition-colors shrink-0"
                >
                  <X size={20} />
                </button>
              </form>

              {/* svh, the screen with the browser's bars showing: with vh the
                  last results sat under Safari's toolbar */}
              <div className="max-h-[60svh] overflow-y-auto overscroll-contain mt-3">
                {results.length > 0 ? (
                  <ul className="divide-y divide-lavender-soft/30">
                    {results.map((item) => (
                      <li key={item._id}>
                        <Link
                          href={item.href}
                          onClick={close}
                          className="flex items-center gap-4 py-3 group"
                        >
                          <div className="w-12 h-15 rounded-lg overflow-hidden bg-lavender-bg shrink-0 flex items-center justify-center">
                            {item.kind === "service" ? (
                              <Scissors size={18} aria-hidden="true" className="text-charcoal" />
                            ) : item.image ? (
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-12 h-[60px] object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-serif text-base truncate group-hover:text-charcoal/70 transition-colors">
                              {item.name}
                            </p>
                            <p className="text-xs text-charcoal-light">{item.label}</p>
                          </div>
                          {item.priceLabel ? (
                            <p className="text-sm font-medium shrink-0 whitespace-nowrap">{item.priceLabel}</p>
                          ) : typeof item.price === "number" ? (
                            <p className="text-sm font-medium shrink-0 tabular-nums">
                              {formatPence(item.price)}
                            </p>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : searched && !loading ? (
                  <div className="py-8 text-center">
                    <p className="text-charcoal-light text-sm mb-1">
                      Nothing matched &ldquo;{query.trim()}&rdquo;.
                    </p>
                    {/* Most searches that find nothing are for a job, not a
                        product: the two ways to get one started */}
                    <p className="text-charcoal-light text-sm mb-5">
                      Kristina can usually tell from a photo what it needs.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Link
                        href="/atelier#book"
                        onClick={close}
                        className="topstitch inline-flex items-center justify-center gap-2 px-6 py-3 bg-lavender text-charcoal rounded-full text-sm font-medium hover:bg-[#CFC0F0] transition-colors"
                      >
                        <CalendarCheck size={16} aria-hidden="true" />
                        Choose a time
                      </Link>
                      <a
                        href={whatsappLink("Hi Kristina, here's a photo of something that needs altering:")}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={close}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-charcoal/20 text-charcoal rounded-full text-sm font-medium hover:border-lavender hover:bg-lavender/10 transition-colors"
                      >
                        <MessageCircle size={16} aria-hidden="true" />
                        Send a photo on WhatsApp
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="py-6 text-xs text-charcoal-light">
                    Type at least two letters — search covers alterations, the shop and gift boxes.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Search"
        className={`size-11 -m-2 grid place-items-center text-charcoal/70 hover:text-charcoal transition-colors duration-300 ${className}`}
      >
        <Search size={20} />
      </button>
      {mounted && createPortal(overlay, document.body)}
    </>
  );
}
