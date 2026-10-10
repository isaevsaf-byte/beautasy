"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useIsClient } from "@/lib/useIsClient";
import { useDialog, useScrollLock } from "@/lib/useDialog";

/* eslint-disable @next/next/no-img-element */

/**
 * Full-screen image viewer, shared by the product page, the shop grid and the
 * gift box page — which each had their own copy of this, about three hundred
 * duplicated lines that had to be fixed three times over.
 */
export default function Lightbox({
  images,
  alt,
  index,
  onIndexChange,
  open,
  onClose,
}: {
  images: string[];
  alt: string;
  index: number;
  onIndexChange: (next: number) => void;
  open: boolean;
  onClose: () => void;
}) {
  const isClient = useIsClient();

  const goNext = useCallback(() => {
    onIndexChange(index < images.length - 1 ? index + 1 : 0);
  }, [index, images.length, onIndexChange]);

  const goPrev = useCallback(() => {
    onIndexChange(index > 0 ? index - 1 : images.length - 1);
  }, [index, images.length, onIndexChange]);

  // Focus moves in, Tab stays in, Escape closes and focus goes back to the
  // photo that opened it (@/lib/useDialog); the arrows are this viewer's own
  const panelRef = useDialog<HTMLDivElement>(open, onClose);
  useScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, goNext, goPrev]);

  // A swipe on a phone turns the page, as in the work viewer: only a clearly
  // sideways stroke with one finger, so scrolling and pinching stay what they are
  const touch = useRef<{ x: number; y: number } | null>(null);

  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} — image viewer`}
          ref={panelRef}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm outline-none"
          onClick={onClose}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/25 transition-colors"
          >
            <X size={22} />
          </button>

          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              aria-label="Previous image"
              className="absolute left-4 sm:left-6 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/25 transition-colors"
            >
              <ChevronLeft size={22} />
            </button>
          )}

          {/* The next photo is simply there. Each one used to be remounted and
              zoomed up from 92%, so paging through five photos was five small
              entrances for something the visitor had already asked to see. */}
          <div
            className="relative max-w-[90vw] max-h-[85dvh] touch-pan-y"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              const zoomed = (window.visualViewport?.scale ?? 1) > 1.01;
              touch.current =
                e.touches.length === 1 && !zoomed ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
            }}
            onTouchMove={(e) => {
              if (e.touches.length > 1) touch.current = null;
            }}
            onTouchEnd={(e) => {
              const start = touch.current;
              touch.current = null;
              if (!start || images.length < 2) return;
              const dx = e.changedTouches[0].clientX - start.x;
              const dy = e.changedTouches[0].clientY - start.y;
              if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? goNext : goPrev)();
            }}
          >
            <img
              src={images[index]}
              alt={`${alt} — image ${index + 1}`}
              draggable={false}
              className="max-w-full max-h-[85dvh] object-contain rounded-xl shadow-2xl select-none"
            />
          </div>

          {/* Which photo this is, up by the close button: at the foot of the
              photo it sat on top of the thumbnails on a phone */}
          {images.length > 1 && (
            <div className="absolute top-6 left-5 z-10 bg-black/50 backdrop-blur-sm rounded-full px-4 py-1.5 pointer-events-none">
              <p className="text-white text-xs tracking-wider tabular-nums">
                {index + 1} / {images.length}
              </p>
            </div>
          )}

          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              aria-label="Next image"
              className="absolute right-4 sm:right-6 z-10 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/25 transition-colors"
            >
              <ChevronRight size={22} />
            </button>
          )}

          {images.length > 1 && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 max-w-[calc(100vw-2rem)] overflow-x-auto overscroll-x-contain p-1">
              {images.map((image, i) => (
                <button
                  key={`lightbox-thumb-${i}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onIndexChange(i);
                  }}
                  aria-label={`Show image ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  // Marked by its white edge, not grown: grown, it was cut off
                  // by the strip once the strip scrolls on a narrow phone
                  className={`relative w-12 h-12 shrink-0 rounded-lg overflow-hidden border-2 transition-colors duration-200 ${
                    i === index
                      ? "border-white shadow-lg"
                      : "border-white/30 hover:border-white/60"
                  }`}
                >
                  <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!isClient) return null;
  return createPortal(content, document.body);
}
