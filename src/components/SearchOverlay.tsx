"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Loader2 } from "lucide-react";
import Link from "next/link";
import { useIsClient } from "@/lib/useIsClient";
import { trackSearch } from "@/lib/analytics";
/* eslint-disable @next/next/no-img-element */

interface SearchResult {
  _id: string;
  name: string;
  href: string;
  price: number;
  label: string;
  image: string | null;
}

/**
 * Site search. The shop had none, so anyone arriving from an ad for a specific
 * piece had to guess which category it lived in.
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

  // Escape closes; focus lands in the field when it opens
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      clearTimeout(t);
    };
  }, [isOpen, close]);

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
            role="dialog"
            aria-modal="true"
            aria-label="Search the shop"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed top-0 left-0 right-0 z-[9999] bg-[#FDFBF7] shadow-xl"
          >
            <div className="max-w-2xl mx-auto px-6 py-6">
              <div className="flex items-center gap-3 border-b border-lavender-soft/60 pb-3">
                <Search size={20} className="text-charcoal-light shrink-0" />
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for a bralette, gift box, scrunchie…"
                  aria-label="Search products"
                  className="flex-1 min-w-0 bg-transparent text-lg text-charcoal placeholder:text-charcoal-light/60 focus:outline-none"
                />
                {loading && <Loader2 size={16} className="animate-spin text-lavender shrink-0" />}
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close search"
                  className="p-1 text-charcoal-light hover:text-charcoal transition-colors shrink-0"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto mt-3">
                {results.length > 0 ? (
                  <ul className="divide-y divide-lavender-soft/30">
                    {results.map((item) => (
                      <li key={item._id}>
                        <Link
                          href={item.href}
                          onClick={close}
                          className="flex items-center gap-4 py-3 group"
                        >
                          <div className="w-12 h-15 rounded-lg overflow-hidden bg-lavender-bg shrink-0">
                            {item.image && (
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-12 h-[60px] object-cover"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-serif text-base truncate group-hover:text-charcoal/70 transition-colors">
                              {item.name}
                            </p>
                            <p className="text-xs text-charcoal-light">{item.label}</p>
                          </div>
                          <p className="text-sm font-medium shrink-0">
                            £{(item.price / 100).toFixed(2)}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : searched && !loading ? (
                  <div className="py-8 text-center">
                    <p className="text-charcoal-light text-sm mb-3">
                      Nothing matched &ldquo;{query.trim()}&rdquo;.
                    </p>
                    <Link
                      href="/contact"
                      onClick={close}
                      className="text-sm text-charcoal underline underline-offset-2 hover:text-lavender transition-colors"
                    >
                      Ask us for a custom piece
                    </Link>
                  </div>
                ) : (
                  <p className="py-6 text-xs text-charcoal-light">
                    Type at least two letters — search covers products, collections and gift boxes.
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
        className={`p-1 text-charcoal/70 hover:text-charcoal transition-colors duration-300 ${className}`}
      >
        <Search size={20} />
      </button>
      {mounted && createPortal(overlay, document.body)}
    </>
  );
}
