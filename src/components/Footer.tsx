"use client";

import { Globe, MapPin, Package, Heart } from "lucide-react";
import Link from "next/link";

const navLinks = [
  { label: "Shop", href: "/shop" },
  { label: "Mini", href: "/mini" },
  { label: "Atelier", href: "/atelier" },
  { label: "Contact", href: "/contact" },
];

export default function Footer() {
  return (
    <footer className="py-16 md:py-20 border-t border-lavender-soft/40">
      <div className="max-w-6xl mx-auto px-6">
        {/* Top row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
          {/* Brand */}
          <div>
            <h4 className="font-serif text-2xl tracking-[0.2em] mb-4">BEAUTASY</h4>
            <p className="text-sm text-charcoal-light leading-relaxed max-w-xs">
              Handmade lingerie, kids&apos; clothing, and accessories crafted with love in
              Southampton, UK.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h5 className="text-sm tracking-[0.2em] uppercase font-medium mb-4">
              Quick Links
            </h5>
            <ul className="space-y-3">
              {navLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-charcoal-light hover:text-charcoal transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Shipping Info */}
          <div>
            <h5 className="text-sm tracking-[0.2em] uppercase font-medium mb-4">
              Delivery
            </h5>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Globe size={16} className="text-lavender flex-shrink-0" />
                <p className="text-sm text-charcoal-light">Worldwide Shipping</p>
              </div>
              <div className="flex items-center gap-3">
                <MapPin size={16} className="text-lavender flex-shrink-0" />
                <p className="text-sm text-charcoal-light">Local Pickup Available</p>
              </div>
              <div className="flex items-center gap-3">
                <Package size={16} className="text-lavender flex-shrink-0" />
                <p className="text-sm text-charcoal-light">Careful Gift Packaging</p>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-lavender-soft/30 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-charcoal-light">
            © {new Date().getFullYear()} Beautasy. All rights reserved.
          </p>
          <p className="text-xs text-charcoal-light flex items-center gap-1">
            Made with <Heart size={12} className="text-lavender fill-lavender" /> in
            Southampton
          </p>
        </div>
      </div>
    </footer>
  );
}
