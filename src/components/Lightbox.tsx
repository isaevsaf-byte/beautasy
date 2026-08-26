"use client";

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useIsClient } from "@/lib/useIsClient";

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

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, goNext, goPrev]);

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
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
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

          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative max-w-[90vw] max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={images[index]}
              alt={`${alt} — image ${index + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
            {images.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-1.5">
                <p className="text-white text-xs tracking-wider">
                  {index + 1} / {images.length}
                </p>
              </div>
            )}
          </motion.div>

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
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">
              {images.map((image, i) => (
                <button
                  key={`lightbox-thumb-${i}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onIndexChange(i);
                  }}
                  aria-label={`Show image ${i + 1}`}
                  className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                    i === index
                      ? "border-white scale-110 shadow-lg"
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
