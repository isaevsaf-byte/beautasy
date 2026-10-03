"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Heart, Package, User, CalendarCheck, MessageCircle } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Cart, { CartDrawer } from "@/components/Cart";
import SearchOverlay from "@/components/SearchOverlay";
import { useIsClient } from "@/lib/useIsClient";
import { useWishlist } from "@/store/useWishlist";
import { UserButton, SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk";
import { whatsappLink } from "@/lib/business";
import { isCurrentPage } from "@/lib/currentPage";


/* ------------------------------------------------------------------ */
/*  The menu                                                           */
/* ------------------------------------------------------------------ */

type NavLink = { label: string; href: string; side: "left" | "right" };

/**
 * Six links, the atelier's first: it is what brings people in and pays.
 *
 * The phone menu used to open on 17 items, eleven of them shop shelves, with
 * "Gift Cards" twice, a "Mini" nobody could decode, and no way to book, read
 * the reviews or message Kristina. The shop's sections are chips on /shop
 * itself; the menu only has to get a person there.
 *
 * "Alterations & Prices" goes to /atelier, where the booking form is. The
 * /alterations overview stays as it is — which of the two Google should rank
 * waits on Search Console, not on the menu.
 */
const navLinks: NavLink[] = [
  { label: "Alterations & Prices", href: "/atelier", side: "left" },
  { label: "Our Work", href: "/work", side: "left" },
  { label: "Reviews", href: "/reviews", side: "left" },
  { label: "Shop", href: "/shop", side: "right" },
  { label: "Gift Cards", href: "/gift-cards", side: "right" },
  { label: "Contact", href: "/contact", side: "right" },
];

/** Where the menu's WhatsApp button opens the chat, with the first line typed */
const WHATSAPP_HELLO = "Hi Kristina! I'd love to ask about an alteration.";

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
  const hydrated = useIsClient();
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement>(null);
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
          // A visit that started before shelves were served has none cached:
          // read again, because the Footer takes its shelves from this copy
          if (s?.announcementBar !== undefined && s?.shelves !== undefined) {
            setBar(s.announcementBar);
            return;
          }
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

  // Escape closes the phone menu and puts focus back on the button that
  // opened it, so a keyboard or switch user is not left somewhere hidden
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMobileOpen(false);
      toggleRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // While the phone menu is open the page behind it stays still, so a swipe
  // moves the menu and not the page under it. The menu is hidden from lg up:
  // if the screen grows that wide (a tablet turned on its side) the menu
  // closes, rather than leave a page that looks normal but will not scroll.
  useEffect(() => {
    if (!mobileOpen) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const wide = window.matchMedia("(min-width: 64rem)");
    const onWide = () => {
      if (wide.matches) setMobileOpen(false);
    };
    wide.addEventListener("change", onWide);
    return () => {
      wide.removeEventListener("change", onWide);
      document.body.style.overflow = before;
    };
  }, [mobileOpen]);

  const activeBar = hydrated && bar?.enabled && bar.text ? bar : null;
  const current = (href: string) => (isCurrentPage(href, pathname) ? "page" : undefined);

  return (
    // A plain header, not one that fades in: it was sent from the server at
    // opacity 0 and stayed invisible until every script had loaded — four
    // seconds and more on a phone, on every page.
    // A column no taller than the screen: the open phone menu is the part
    // that gives way and scrolls, so its last buttons can always be reached
    // (on a phone on its side they were below the screen, out of reach).
    <header
      className="fixed top-0 left-0 right-0 z-50 flex flex-col max-h-dvh backdrop-blur-md bg-[#FDFBF7]/90 border-b border-[#E6E6FA]/40"
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

      {/* ── Main nav row ──
           Three columns rather than an absolutely-centred wordmark: the logo
           sits in the middle while both sides have room, and a wide side nav
           pushes it over instead of printing through it. */}
      {/* On a phone the row is the menu button, the logo and three icons, and
          at the desktop sizes they came to 399px: on a 375px iPhone the cart
          sat on the very edge, and at 320px (a small iPhone with Display Zoom
          on) it was pushed off the screen entirely, where nobody could tap it.
          The logo and the gaps now shrink with the screen instead. */}
      {/* Six links and the wordmark need a laptop's width, so a tablet gets
          the phone's menu rather than a row that collides with itself. */}
      {/* w-full because the header is a flex column, where mx-auto alone
          would shrink the row to its content and bunch it in the middle. */}
      <div className="w-full max-w-6xl mx-auto px-4 min-[360px]:px-6 py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 lg:gap-4">
        {/* Mobile menu button, with search beside it: two icons on each side
            of the logo keep it in the middle of a phone screen, where one on
            the left and three on the right pushed it well off centre. */}
        <div className="lg:hidden justify-self-start flex items-center gap-2">
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-charcoal p-1"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <SearchOverlay />
        </div>

        {/* Nav left (desktop) */}
        <nav aria-label="Atelier" className="hidden lg:flex justify-self-start items-center gap-5 xl:gap-6">
          {navLinks.filter((link) => link.side === "left").map((link) => (
            <Link
              key={link.label}
              href={link.href}
              aria-current={current(link.href)}
              className="text-[13px] xl:text-sm tracking-wider xl:tracking-widest uppercase whitespace-nowrap transition-colors duration-300 text-charcoal/70 hover:text-charcoal aria-[current=page]:text-charcoal"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Logo center */}
        <Link href="/" className="justify-self-center whitespace-nowrap" aria-current={pathname === "/" ? "page" : undefined}>
          <span className="block font-serif text-lg tracking-[0.22em] min-[360px]:text-xl min-[360px]:tracking-[0.25em] min-[400px]:text-2xl min-[400px]:tracking-[0.3em] md:text-3xl lg:text-2xl xl:text-3xl text-charcoal">
            BEAUTASY
          </span>
        </Link>

        {/* Nav right (desktop) */}
        <nav aria-label="Shop and contact" className="hidden lg:flex justify-self-end items-center gap-5 xl:gap-6">
          {navLinks.filter((link) => link.side === "right").map((link) => (
            <Link
              key={link.label}
              href={link.href}
              aria-current={current(link.href)}
              className="text-[13px] xl:text-sm tracking-wider xl:tracking-widest uppercase whitespace-nowrap text-charcoal/70 hover:text-charcoal aria-[current=page]:text-charcoal transition-colors duration-300"
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
                  <button
                    type="button"
                    aria-label="Sign in"
                    className="p-1 text-charcoal/70 hover:text-charcoal transition-colors duration-300"
                  >
                    <User size={20} />
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
        <div className="lg:hidden justify-self-end flex items-center gap-2">
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

      {/* Mobile nav. The animated box clips while it opens and is allowed to
          be shorter than its contents (min-h-0); the list inside it is what
          scrolls, and overscroll-contain keeps a swipe that reaches its end
          from carrying on into the page. */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            id="mobile-nav"
            aria-label="Menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden flex min-h-0 flex-col bg-cream border-t border-lavender-soft/40 px-6 overflow-hidden"
          >
            <div className="w-full max-w-xl mx-auto min-h-0 overflow-y-auto overscroll-contain pb-6">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  aria-current={current(link.href)}
                  onClick={() => setMobileOpen(false)}
                  className="block py-3 text-sm tracking-widest uppercase text-charcoal/70 hover:text-charcoal aria-[current=page]:text-charcoal aria-[current=page]:font-medium transition-colors"
                >
                  {link.label}
                </Link>
              ))}
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
              {/* The two things most people open the menu to do, as buttons
                  a thumb can't miss */}
              <div className="mt-5 grid gap-3">
                <Link
                  href="/atelier#book"
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center justify-center gap-2 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-colors"
                >
                  <CalendarCheck size={16} aria-hidden="true" />
                  Choose a time
                </Link>
                <a
                  href={whatsappLink(WHATSAPP_HELLO)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center justify-center gap-2 py-3.5 border border-[#075E54]/40 text-[#075E54] rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#075E54]/5 transition-colors"
                >
                  <MessageCircle size={16} aria-hidden="true" />
                  WhatsApp Kristina
                </a>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
      {/* Single cart drawer for the whole page — both bag buttons open this one */}
      <CartDrawer freeShippingThreshold={propThreshold} />
    </header>
  );
}
