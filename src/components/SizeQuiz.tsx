"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Ruler, X, Sparkles } from "lucide-react";
import { useIsClient } from "@/lib/useIsClient";
import {
  availableMeasures,
  suggestSize,
  MEASURE_LABELS,
  type Measure,
  type SizeGuideRow,
} from "@/lib/sizeMatch";

/**
 * "Find my size" — two or three numbers instead of reading a table.
 *
 * Sizing is the biggest hesitation when buying lingerie online, and the shop
 * only offered a raw measurement table. This reads the same table the product
 * already carries, so the answer always matches what Kristina actually sews.
 */
export default function SizeQuiz({
  rows,
  availableSizes,
  onPick,
}: {
  rows: SizeGuideRow[];
  availableSizes: string[];
  onPick: (size: string) => void;
}) {
  const isClient = useIsClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Partial<Record<Measure, string>>>({});

  const measures = availableMeasures(rows);
  if (measures.length === 0) return null;

  const numeric: Partial<Record<Measure, number>> = {};
  for (const measure of measures) {
    const parsed = parseFloat((values[measure] ?? "").replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) numeric[measure] = parsed;
  }

  const result = suggestSize(rows, numeric);
  const inStock = result.size ? availableSizes.includes(result.size) : false;

  const close = () => {
    setOpen(false);
    setValues({});
  };

  const modal = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Find your size"
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-0 flex items-end sm:items-center justify-center z-[9999] p-4"
            onClick={close}
          >
            <div
              className="bg-[#FDFBF7] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-lavender-soft/40">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-lavender" />
                  <h3 className="font-serif text-xl">Find your size</h3>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close size finder"
                  className="p-1.5 rounded-full text-charcoal-light hover:text-charcoal hover:bg-lavender-bg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-charcoal-light leading-relaxed">
                  Measure over bare skin with a soft tape, keeping it snug but not tight.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {measures.map((measure) => (
                    <label key={measure} className="block">
                      <span className="block text-[11px] tracking-wider uppercase text-charcoal-light mb-1">
                        {MEASURE_LABELS[measure]} (cm)
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={values[measure] ?? ""}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [measure]: e.target.value.slice(0, 6) }))
                        }
                        placeholder="e.g. 70"
                        className="w-full text-sm px-3 py-2.5 rounded-lg border border-lavender-soft/40 bg-white text-charcoal placeholder:text-charcoal/30 focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
                      />
                    </label>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  {result.size ? (
                    <motion.div
                      key={result.size + String(result.mixed)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="rounded-xl bg-lavender-bg/60 border border-lavender-soft/40 p-4"
                    >
                      <p className="text-sm text-charcoal">
                        Your size looks like{" "}
                        <strong className="font-serif text-lg">{result.size}</strong>
                      </p>
                      {result.mixed && (
                        <p className="text-xs text-charcoal-light mt-1.5 leading-relaxed">
                          Your measurements sit across two sizes, so we&apos;ve suggested the
                          larger one — a handmade piece that&apos;s a touch roomy still wears
                          beautifully.
                        </p>
                      )}
                      {!inStock && (
                        <p className="text-xs text-amber-700 mt-1.5">
                          That size isn&apos;t offered on this piece — message us and we&apos;ll
                          make it for you.
                        </p>
                      )}
                      {inStock && (
                        <button
                          type="button"
                          onClick={() => {
                            onPick(result.size as string);
                            close();
                          }}
                          className="mt-3 w-full py-2.5 rounded-full bg-lavender text-charcoal text-xs tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-colors"
                        >
                          Choose size {result.size}
                        </button>
                      )}
                    </motion.div>
                  ) : (
                    <p key="hint" className="text-xs text-charcoal-light">
                      Enter {measures.length > 1 ? "either measurement" : "your measurement"} to see
                      a recommendation.
                    </p>
                  )}
                </AnimatePresence>

                <p className="text-[11px] text-charcoal-light leading-relaxed">
                  Between sizes or somewhere in between entirely? Reply to any of our emails —
                  Kristina can cut this piece to your measurements.
                </p>
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
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-charcoal-light hover:text-charcoal transition-colors underline underline-offset-2"
      >
        <Ruler size={13} />
        Find my size
      </button>
      {isClient && createPortal(modal, document.body)}
    </>
  );
}
