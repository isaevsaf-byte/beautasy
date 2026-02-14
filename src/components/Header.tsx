"use client";

import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import Cart from "@/components/Cart";

const navLinks = [
  { label: "Shop", href: "/shop" },
  { label: "Mini", href: "/shop/kids" },
  { label: "Atelier", href: "/atelier" },
  { label: "Alterations", href: "/alterations" },
  { label: "Contact", href: "/contact" },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[#FDFBF7]/80 border-b border-[#E6E6FA]/40"
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-charcoal p-1"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        {/* Nav left (desktop) */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.slice(0, 2).map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm tracking-widest uppercase text-charcoal/70 hover:text-charcoal transition-colors duration-300"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Logo center */}
        <Link href="/" className="absolute left-1/2 -translate-x-1/2">
          <h1 className="font-serif text-2xl md:text-3xl tracking-[0.3em] text-charcoal">
            BEAUTASY
          </h1>
        </Link>

        {/* Nav right (desktop) */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.slice(2).map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm tracking-widest uppercase text-charcoal/70 hover:text-charcoal transition-colors duration-300"
            >
              {link.label}
            </Link>
          ))}
          <Cart />
        </nav>

        {/* Cart for mobile */}
        <div className="md:hidden">
          <Cart />
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <motion.nav
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="md:hidden bg-cream border-t border-lavender-soft/40 px-6 pb-6"
        >
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block py-3 text-sm tracking-widest uppercase text-charcoal/70 hover:text-charcoal transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </motion.nav>
      )}
    </motion.header>
  );
}
