"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Gift, Crown, ChevronRight, Heart } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import Cart from "@/components/Cart";
import { useWishlist } from "@/store/useWishlist";
import { UserButton, SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/* ------------------------------------------------------------------ */
/*  Mega-menu data                                                     */
/* ------------------------------------------------------------------ */

type MegaMenuColumn = {
  heading: string;
  links: { label: string; href: string; highlight?: boolean }[];
};

type MegaMenuData = {
  columns: MegaMenuColumn[];
  featured?: { label: string; href: string; description: string; icon: React.ReactNode };
};

const shopMenu: MegaMenuData = {
  columns: [
    {
      heading: "Collections",
      links: [
        { label: "New Arrivals", href: "/shop" },
        { label: "Best Sellers", href: "/shop" },
        { label: "Seasonal Edits", href: "/shop" },
        { label: "Gift Finder", href: "/shop" },
      ],
    },
    {
      heading: "Categories",
      links: [
        { label: "Lingerie", href: "/shop/lingerie" },
        { label: "Accessories & Bags", href: "/shop/accessories" },
        { label: "Home & Living", href: "/shop/home" },
      ],
    },
    {
      heading: "Special",
      links: [
        {
          label: "Liberty of London Exclusive",
          href: "/shop",
          highlight: true,
        },
        {
          label: "Gift Boxes",
          href: "/gift-boxes",
        },
      ],
    },
  ],
  featured: {
    label: "Gift Finder",
    href: "/gift-boxes",
    description: "Find the perfect handmade gift for someone special.",
    icon: <Gift size={20} />,
  },
};

const miniMenu: MegaMenuData = {
  columns: [
    {
      heading: "Collections",
      links: [
        { label: "New In", href: "/shop/kids" },
        { label: "Best Sellers", href: "/shop/kids" },
      ],
    },
    {
      heading: "Categories",
      links: [
        { label: "Girls", href: "/shop/kids" },
        { label: "Boys", href: "/shop/kids" },
        { label: "Baby", href: "/shop/kids" },
      ],
    },
    {
      heading: "Special",
      links: [
        {
          label: "Liberty of London Exclusive",
          href: "/shop/kids",
          highlight: true,
        },
      ],
    },
  ],
  featured: {
    label: "Gift Finder",
    href: "/shop/kids",
    description: "Discover charming gifts for little ones.",
    icon: <Gift size={20} />,
  },
};

const megaMenus: Record<string, MegaMenuData> = {
  Shop: shopMenu,
  Mini: miniMenu,
};

const navLinks = [
  { label: "Shop", href: "/shop" },
  { label: "Mini", href: "/shop/kids" },
  { label: "Gift Boxes", href: "/gift-boxes" },
  { label: "Atelier", href: "/atelier" },
  { label: "Contact", href: "/contact" },
];

/* ------------------------------------------------------------------ */
/*  Mega Menu component                                                */
/* ------------------------------------------------------------------ */

function MegaMenu({ data }: { data: MegaMenuData }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="absolute top-full left-0 right-0 z-40 border-b border-lavender-soft/40"
    >
      {/* Subtle top accent line */}
      <div className="h-px bg-gradient-to-r from-transparent via-lavender to-transparent" />

      <div className="bg-[#FDFBF7]/95 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid grid-cols-4 gap-8">
            {/* Columns */}
            {data.columns.map((col) => (
              <div key={col.heading}>
                <h3 className="font-serif text-xs tracking-[0.25em] uppercase text-charcoal/40 mb-4">
                  {col.heading}
                </h3>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className={
                          link.highlight
                            ? "group flex items-center gap-2 text-sm text-charcoal font-medium transition-colors duration-200"
                            : "text-sm text-charcoal/60 hover:text-charcoal transition-colors duration-200"
                        }
                      >
                        {link.highlight && (
                          <Crown
                            size={14}
                            className="text-lavender shrink-0"
                          />
                        )}
                        <span
                          className={
                            link.highlight
                              ? "bg-gradient-to-r from-[#9B7FD4] to-[#C4A8FF] bg-clip-text text-transparent group-hover:from-charcoal group-hover:to-charcoal transition-all duration-300"
                              : ""
                          }
                        >
                          {link.label}
                        </span>
                        {link.highlight && (
                          <ChevronRight
                            size={12}
                            className="text-lavender opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                          />
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Featured card */}
            {data.featured && (
              <Link href={data.featured.href} className="group">
                <div className="rounded-2xl bg-lavender-bg/60 border border-lavender-soft/40 p-5 h-full flex flex-col justify-between hover:bg-lavender-bg transition-colors duration-300">
                  <div>
                    <div className="w-9 h-9 rounded-full bg-lavender/30 flex items-center justify-center text-charcoal/60 mb-3">
                      {data.featured.icon}
                    </div>
                    <h4 className="font-serif text-base text-charcoal mb-1.5">
                      {data.featured.label}
                    </h4>
                    <p className="text-xs text-charcoal/50 leading-relaxed">
                      {data.featured.description}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 mt-4 text-xs tracking-wide uppercase text-charcoal/40 group-hover:text-charcoal/70 transition-colors duration-200">
                    Explore
                    <ChevronRight
                      size={12}
                      className="group-hover:translate-x-0.5 transition-transform duration-200"
                    />
                  </span>
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Header                                                             */
/* ------------------------------------------------------------------ */

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMega, setActiveMega] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wishlistCount = useWishlist((s) => s.items.length);

  useEffect(() => setHydrated(true), []);

  const openMega = useCallback((label: string) => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    setActiveMega(label);
  }, []);

  const scheduleMegaClose = useCallback(() => {
    closeTimeout.current = setTimeout(() => setActiveMega(null), 150);
  }, []);

  const cancelMegaClose = useCallback(() => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[#FDFBF7]/80 border-b border-[#E6E6FA]/40"
      onMouseLeave={scheduleMegaClose}
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
          {navLinks.slice(0, 2).map((link) => {
            const hasMega = link.label in megaMenus;
            return (
              <div
                key={link.label}
                onMouseEnter={() => hasMega && openMega(link.label)}
                onMouseLeave={scheduleMegaClose}
                className="relative"
              >
                <Link
                  href={link.href}
                  className={`text-sm tracking-widest uppercase transition-colors duration-300 ${
                    activeMega === link.label
                      ? "text-charcoal"
                      : "text-charcoal/70 hover:text-charcoal"
                  }`}
                >
                  {link.label}
                </Link>
                {/* Active indicator dot */}
                {activeMega === link.label && (
                  <motion.span
                    layoutId="megaDot"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-lavender"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </div>
            );
          })}
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
              onMouseEnter={() => setActiveMega(null)}
              className="text-sm tracking-widest uppercase text-charcoal/70 hover:text-charcoal transition-colors duration-300"
            >
              {link.label}
            </Link>
          ))}
          {clerkEnabled && (
            <>
              <SignedIn>
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{ variables: { colorPrimary: "#DCD0FF" } }}
                />
              </SignedIn>
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="text-sm tracking-widest uppercase text-charcoal/70 hover:text-charcoal transition-colors duration-300">
                    Sign In
                  </button>
                </SignInButton>
              </SignedOut>
            </>
          )}
          <Link
            href="/wishlist"
            className="relative p-1 text-charcoal/70 hover:text-charcoal transition-colors duration-300"
            aria-label="Wishlist"
          >
            <Heart size={20} />
            {hydrated && wishlistCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-lavender text-charcoal text-[10px] font-medium rounded-full flex items-center justify-center"
              >
                {wishlistCount}
              </motion.span>
            )}
          </Link>
          <Cart />
        </nav>

        {/* Cart + Wishlist for mobile */}
        <div className="md:hidden flex items-center gap-3">
          <Link
            href="/wishlist"
            className="relative p-1 text-charcoal/70 hover:text-charcoal transition-colors"
            aria-label="Wishlist"
          >
            <Heart size={18} />
            {hydrated && wishlistCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-lavender text-charcoal text-[9px] font-medium rounded-full flex items-center justify-center"
              >
                {wishlistCount}
              </motion.span>
            )}
          </Link>
          <Cart />
        </div>
      </div>

      {/* Desktop Mega Menu */}
      <AnimatePresence>
        {activeMega && megaMenus[activeMega] && (
          <div onMouseEnter={cancelMegaClose} onMouseLeave={scheduleMegaClose}>
            <MegaMenu data={megaMenus[activeMega]} />
          </div>
        )}
      </AnimatePresence>

      {/* Mobile nav */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-cream border-t border-lavender-soft/40 px-6 pb-6 overflow-hidden"
          >
            {navLinks.map((link) => {
              const mega = megaMenus[link.label];
              return (
                <div key={link.label}>
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="block py-3 text-sm tracking-widest uppercase text-charcoal/70 hover:text-charcoal transition-colors"
                  >
                    {link.label}
                  </Link>
                  {/* Mobile sub-links for mega menu items */}
                  {mega && (
                    <div className="pl-4 pb-2 space-y-1.5">
                      {mega.columns.flatMap((col) =>
                        col.links.map((sub) => (
                          <Link
                            key={sub.label}
                            href={sub.href}
                            onClick={() => setMobileOpen(false)}
                            className={
                              sub.highlight
                                ? "flex items-center gap-1.5 py-1 text-xs tracking-wide text-[#9B7FD4] font-medium"
                                : "block py-1 text-xs tracking-wide text-charcoal/50 hover:text-charcoal/80 transition-colors"
                            }
                          >
                            {sub.highlight && <Crown size={11} />}
                            {sub.label}
                          </Link>
                        ))
                      )}
                      {mega.featured && (
                        <Link
                          href={mega.featured.href}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-1.5 py-1 text-xs tracking-wide text-charcoal/50 hover:text-charcoal/80 transition-colors"
                        >
                          <Gift size={11} />
                          {mega.featured.label}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
