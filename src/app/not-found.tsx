import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-[#F5F0FF] flex items-center justify-center mx-auto mb-6">
          <Search size={32} className="text-[#DCD0FF]" />
        </div>

        <p className="text-sm tracking-[0.25em] uppercase text-[#6B6B6B] mb-3">
          404 — Not Found
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl mb-4 text-[#4A4A4A]">
          Page not found
        </h1>
        <p className="text-[#6B6B6B] leading-relaxed mb-8">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
          Head back to browse our handmade collections.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/shop"
            className="group inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-[#DCD0FF] text-[#4A4A4A] rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-[#DCD0FF]/30"
          >
            Browse the Shop
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 border border-[#4A4A4A]/20 text-[#4A4A4A] rounded-full text-sm tracking-wider uppercase font-medium hover:border-[#DCD0FF] hover:bg-[#DCD0FF]/10 transition-all duration-300"
          >
            Back Home
          </Link>
        </div>
      </div>
    </div>
  );
}
