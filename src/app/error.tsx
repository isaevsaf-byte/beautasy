"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to your error tracking service here if needed
    console.error(error);
  }, [error]);

  return (
    // svh, so on a phone the message is centred in what shows between
    // Safari's bars rather than in the taller screen behind them
    <div className="min-h-svh flex items-center justify-center bg-[#FDFBF7] px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full text-center"
      >
        <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-6">
          <AlertCircle size={32} className="text-rose-400" />
        </div>

        <h1 className="font-serif text-2xl sm:text-3xl mb-3 text-[#4A4A4A]">
          Something went wrong
        </h1>
        <p className="text-sm text-[#6B6B6B] leading-relaxed mb-8">
          We encountered an unexpected error. This has been noted and we&apos;ll
          look into it. In the meantime, you can try refreshing the page.
        </p>

        {/* .press carries the colour change and gives the press; the
            transition-all these had also animated anything else that moved */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="press inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#DCD0FF] text-[#4A4A4A] rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover"
          >
            <RefreshCw size={14} />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-[#4A4A4A]/20 text-[#4A4A4A] rounded-full text-sm tracking-wider uppercase font-medium hover:border-[#DCD0FF] hover:bg-[#DCD0FF]/10 transition-[border-color,background-color] duration-300"
          >
            <ArrowLeft size={14} />
            Back Home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
