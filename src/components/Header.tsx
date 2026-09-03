"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Gift, Crown, ChevronRight, Heart, Package } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import Cart, { CartDrawer } from "@/components/Cart";
import SearchOverlay from "@/components/SearchOverlay";
import { useIsClient } from "@/lib/useIsClient";
import { useWishlist } from "@/store/useWishlist";
import { UserButton, SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk";


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
      heading: "Collection",
      links: [
        { label: "All Collection", href: "/shop" },
        { label: "New Arrivals", href: "/shop?sort=new" },
        { label: "Gift Boxes", href: "/gift-boxes" },
        { label: "Gift Cards", href: "/gift-cards" },
      ],
    },
    {
      heading: "Lingerie",
      links: [
        { label: "Bras", href: "/shop/lingerie?category=bras" },
        { label: "Knickers", href: "/shop/lingerie?category=knickers" },
        { label: "Belts", href: "/shop/lingerie?category=belts" },
        { label: "Garters", href: "/shop/lingerie?category=garters" },
        { label: "Sleeping Masks", href: "/shop/lingerie?category=sleeping-masks" },
        { label: "Sets", href: "/shop/lingerie?category=sets" },
      ],
    },
    {
      heading: "Accessories & Bags",
      links: [
        { label: "Hair Accessories", href: "/shop/accessories?category=hair-accessories" },
        { label: "Pouches", href: "/shop/accessories?category=pouches" },
        { label: "Organisers", href: "/shop/accessories?category=organisers" },
      ],
    },
    {
      heading: "Home Decor",
      links: [
        { label: "Cushion Cover", href: "/shop/home?category=cushion-cover" },
        { label: "Table Runner", href: "/shop/home?category=table-runner" },
        { label: "Placemats", href: "/shop/home?category=placemats" },
        { label: "Napkins", href: "/shop/home?category=napkins" },
      ],
    },
  ],
};

const miniMenu: MegaMenuData = {
  columns: [
    {
      heading: "Mini Beautasy",
      links: [
        { label: "Kids' Underwear", href: "/shop/kids?category=underwear" },
        { label: "Pyjamas", href: "/shop/kids?category=pyjamas" },
        { label: "Blankets", href: "/shop/kids?category=blankets" },
        { label: "Muslin Cloths & Bibs", href: "/shop/kids?category=muslin-cloths" },
        { label: "Kids' Accessories", href: "/shop/kids?category=accessories" },
      ],
    },
  ],
};

const megaMenus: Record<string, MegaMenuData> = {
  Shop: shopMenu,
  Mini: miniMenu,
};

const navLinks = [
  { label: "Shop", href: "/shop" },
  { label: "Mini", href: "/shop/kids" },
  { label: "Gifts", href: "/gift-boxes" },
  { label: "Atelier", href: "/atelier" },
  { label: "Alterations", href: "/alterations" },
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

/* ── Announcement bar colour map ─────────────────────────────────── */
const barBgMap: Record<string, string> = {
  lavender: "bg-lavender text-charcoal",
  charcoal: "bg-[#4A4A4A] text-white",
  cream: "bg-cream-soft text-charcoal border-b border-lavender-soft/40",
};

interface AnnouncementBarData {
  enabled: boolean;
  text?: string;
  link?: string;
  bgColor?: "lavender" | "charcoal" | "cream";
}

export default function Header({
  freeShippingThreshold: propThreshold,
  announcementBar: propBar,
}: {
  freeShippingThreshold?: number;
  announcementBar?: AnnouncementBarData | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMega, setActiveMega] = useState<string | null>(null);
  const hydrated = useIsClient();
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wishlistCount = useWishlist((s) => s.items.length);
  // Announcement bar — fetched client-side when not passed from server
  const [bar, setBar] = useState<AnnouncementBarData | null>(propBar ?? null);


  // Fetch announcement bar from /api/site-settings when not provided as prop.
  // Uses sessionStorage so the bar data persists across client-side navigations.
  useEffect(() => {
    if (propBar !== undefined) return; // already provided by server
    let cancelled = false;

    // Off the synchronous path: a setState in the effect body cascades an extra
    // render (and React 19 lints against it).
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const cached = sessionStorage.getItem("beautasy-site-settings");
        if (cached) {
          const s = JSON.parse(cached);
          if (s?.announcementBar !== undefined) { setBar(s.announcementBar); return; }
        }
      } catch { /* ok */ }
      loadBar();
    });

    function loadBar() {
    fetch("/api/site-settings")
      .then((r) => r.json())
      .then((data) => {
        if (data?.announcementBar !== undefined) setBar(data.announcementBar);
        // The Footer also caches the full settings object — reuse it
        try { sessionStorage.setItem("beautasy-site-settings", JSON.stringify(data ?? {})); } catch { /* ok */ }
      })
      .catch(() => {});
    }

    return () => { cancelled = true; };
  }, [propBar]);

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

  const activeBar = hydrated && bar?.enabled && bar.text ? bar : null;

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[#FDFBF7]/90 border-b border-[#E6E6FA]/40"
      onMouseLeave={scheduleMegaClose}
    >
      {/* ── Announcement bar — lives inside the fixed header so it never
           bleeds through the header's glass background as a ghost ── */}
      {activeBar && (
        <div className={`${barBgMap[activeBar.bgColor ?? "lavender"]} flex items-center justify-center py-2`}>
          {activeBar.link ? (
            <a href={activeBar.link} className="block w-full text-center hover:opacity-80 transition-opacity">
              <p className="text-xs sm:text-sm tracking-wide font-medium px-4">{activeBar.text}</p>
            </a>
          ) : (
            <p className="text-xs sm:text-sm tracking-wide font-medium px-4 text-center">{activeBar.text}</p>
          )}
        </div>
      )}

      {/* ── Main nav row ── */}
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
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.slice(0, 3).map((link) => {
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
          <span className="block font-serif text-2xl md:text-3xl tracking-[0.3em] text-charcoal">
            BEAUTASY
          </span>
        </Link>

        {/* Nav right (desktop) */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.slice(3).map((link) => (
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
                >
                  <UserButton.MenuItems>
                    <UserButton.Link
                      label="My Orders"
                      href="/orders"
                      labelIcon={<Package size={14} />}
                    />
                  </UserButton.MenuItems>
                </UserButton>
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
          <SearchOverlay />
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
          <SearchOverlay />
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
            {clerkEnabled && (
              <div className="border-t border-lavender-soft/40 mt-3 pt-3">
                <SignedIn>
                  <Link
                    href="/orders"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 py-3 text-sm tracking-widest uppercase text-charcoal/70 hover:text-charcoal transition-colors"
                  >
                    <Package size={14} />
                    My Orders
                  </Link>
                  <div className="py-2">
                    <UserButton
                      afterSignOutUrl="/"
                      appearance={{ variables: { colorPrimary: "#DCD0FF" } }}
                    />
                  </div>
                </SignedIn>
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="block w-full text-left py-3 text-sm tracking-widest uppercase text-charcoal/70 hover:text-charcoal transition-colors">
                      Sign In
                    </button>
                  </SignInButton>
                </SignedOut>
              </div>
            )}
          </motion.nav>
        )}
      </AnimatePresence>
      {/* Single cart drawer for the whole page — both bag buttons open this one */}
      <CartDrawer freeShippingThreshold={propThreshold} />
    </motion.header>
  );
}
