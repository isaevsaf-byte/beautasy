"use client";

import { CalendarCheck, Clock, Heart, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import NewsletterSignup from "@/components/NewsletterSignup";
import { stockedLinks, type Shelves } from "@/lib/shelves";
import { BUSINESS, whatsappLink } from "@/lib/business";

/* ── Types ── */
export interface FooterSettings {
  socialLinks?: {
    instagram?: string;
    tiktok?: string;
    pinterest?: string;
  };
  paymentIcons?: {
    showVisa?: boolean;
    showMastercard?: boolean;
    showPaypal?: boolean;
    showApplePay?: boolean;
    showGooglePay?: boolean;
    showAmex?: boolean;
  };
  shipping?: {
    ukRate?: number;
    internationalRate?: number;
    freeShippingThreshold?: number;
  };
  /** Which sections of the shop have anything in them — see @/lib/shelves */
  shelves?: Shelves | null;
}

/** The atelier first, as in the menu; "Kids" where it said "Mini", which nobody could decode */
const navLinks = [
  { label: "Atelier", href: "/atelier" },
  { label: "Alterations", href: "/alterations" },
  { label: "Our Work", href: "/work" },
  { label: "Reviews", href: "/reviews" },
  { label: "Shop", href: "/shop" },
  { label: "Kids", href: "/shop/kids" },
  { label: "Gift Boxes", href: "/gift-boxes" },
  { label: "Contact", href: "/contact" },
];

/**
 * What the footer prints before the shop's settings arrive, and what a page
 * without JavaScript keeps. The same numbers as the DEFAULT_* constants in
 * @/lib/siteSettings, which this client file cannot import — that module
 * brings the Sanity client with it. A test holds the two in step: the footer
 * said "UK: £3.00" for months after the real rate went to £3.50.
 */
const FALLBACK_UK_RATE = 350;
const FALLBACK_INT_RATE = 1200;
const FALLBACK_FREE_THRESHOLD = 5000;

/** Pounds as a price list prints them: £3.50, £12 */
function poundsLabel(pence: number): string {
  return pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`;
}

/** The first line of the chat, typed for them */
const WHATSAPP_HELLO = "Hi Kristina! I'd love to ask about an alteration.";

const legalLinks = [
  { label: "About Us", href: "/pages/about-us" },
  { label: "Gift Cards", href: "/gift-cards" },
  { label: "Give £5, get £5", href: "/refer" },
  { label: "Delivery & Returns", href: "/pages/delivery-and-returns" },
  { label: "Privacy Policy", href: "/pages/privacy-policy" },
  { label: "Contact", href: "/contact" },
];

/* ── Simple SVG payment icons ── */
function VisaIcon() {
  return (
    <svg viewBox="0 0 38 24" className="h-6 w-auto" aria-label="Visa">
      <rect width="38" height="24" rx="4" fill="#1A1F71" />
      <text x="19" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial">VISA</text>
    </svg>
  );
}
function MastercardIcon() {
  return (
    <svg viewBox="0 0 38 24" className="h-6 w-auto" aria-label="Mastercard">
      <rect width="38" height="24" rx="4" fill="#252525" />
      <circle cx="15" cy="12" r="7" fill="#EB001B" />
      <circle cx="23" cy="12" r="7" fill="#F79E1B" />
      <path d="M19 6.8a7 7 0 0 1 0 10.4A7 7 0 0 1 19 6.8z" fill="#FF5F00" />
    </svg>
  );
}
function PaypalIcon() {
  return (
    <svg viewBox="0 0 38 24" className="h-6 w-auto" aria-label="PayPal">
      <rect width="38" height="24" rx="4" fill="#003087" />
      <text x="19" y="16" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial">PayPal</text>
    </svg>
  );
}
function ApplePayIcon() {
  return (
    <svg viewBox="0 0 38 24" className="h-6 w-auto" aria-label="Apple Pay">
      <rect width="38" height="24" rx="4" fill="#000" />
      <text x="19" y="16" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial"> Pay</text>
    </svg>
  );
}
function GooglePayIcon() {
  return (
    <svg viewBox="0 0 38 24" className="h-6 w-auto" aria-label="Google Pay">
      <rect width="38" height="24" rx="4" fill="#fff" stroke="#e0e0e0" strokeWidth="1" />
      <text x="19" y="16" textAnchor="middle" fill="#5f6368" fontSize="7.5" fontWeight="bold" fontFamily="Arial">G Pay</text>
    </svg>
  );
}
function AmexIcon() {
  return (
    <svg viewBox="0 0 38 24" className="h-6 w-auto" aria-label="American Express">
      <rect width="38" height="24" rx="4" fill="#2E77BC" />
      <text x="19" y="16" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="Arial">AMEX</text>
    </svg>
  );
}

const DEFAULT_ICONS = {
  showVisa: true,
  showMastercard: true,
  showPaypal: true,
  showApplePay: true,
  showGooglePay: false,
  showAmex: false,
} as const;

export default function Footer({ settings: propSettings }: { settings?: FooterSettings }) {
  const [fetchedSettings, setFetchedSettings] = useState<FooterSettings | null>(null);

  // If no settings were passed from a server wrapper, fetch them from the API
  // so that Sanity-configured social links & payment icons are always shown.
  // sessionStorage caching means subsequent navigations are instant (no ghost/flash).
  useEffect(() => {
    if (propSettings !== undefined) return; // already have server-side settings
    let cancelled = false;

    // Read the cache off the synchronous path: setting state directly in an
    // effect body cascades an extra render (and React 19 lints against it).
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const cached = sessionStorage.getItem("beautasy-site-settings");
        if (cached) { setFetchedSettings(JSON.parse(cached)); return; }
      } catch { /* sessionStorage unavailable */ }
      loadSettings();
    });

    function loadSettings() {
    fetch("/api/site-settings")
      .then((r) => r.json())
      .then((data) => {
        const s = data ?? {};
        setFetchedSettings(s);
        try { sessionStorage.setItem("beautasy-site-settings", JSON.stringify(s)); } catch { /* ok */ }
      })
      .catch(() => {/* keep defaults */});
    }

    return () => { cancelled = true; };
  }, [propSettings]);

  const settings = propSettings ?? fetchedSettings ?? {};
  const social = settings?.socialLinks ?? {};
  const icons = settings?.paymentIcons ?? DEFAULT_ICONS as NonNullable<FooterSettings["paymentIcons"]>;
  const shipping = settings?.shipping;
  const ukLabel = poundsLabel(shipping?.ukRate ?? FALLBACK_UK_RATE);
  const intLabel = poundsLabel(shipping?.internationalRate ?? FALLBACK_INT_RATE);
  const threshold = shipping?.freeShippingThreshold ?? FALLBACK_FREE_THRESHOLD;

  const hasSocial = social.instagram || social.tiktok || social.pinterest;
  const hasPaymentIcons = Object.values(icons).some(Boolean);

  return (
    <footer className="py-16 md:py-20 border-t border-lavender-soft/40">
      <div className="max-w-6xl mx-auto px-6">
        {/* Top row */}
        {/* Newsletter — the shop's only way to reach someone who didn't buy today */}
        <div className="mb-14 pb-14 border-b border-lavender-soft/40">
          <NewsletterSignup source="footer" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div className="md:col-span-1">
            {/* The wordmark, not a heading: as an h4 it came before every
                other heading in the footer, and on most pages straight after
                an h2, which a screen reader announces as a skipped level */}
            <p className="font-serif text-2xl tracking-[0.2em] mb-4">BEAUTASY</p>
            <p className="text-sm text-charcoal-light leading-relaxed max-w-xs mb-4">
              Alterations and repairs by appointment in Southampton, and a small shop
              of handmade lingerie, kids&apos; pieces and accessories from the same
              workroom.
            </p>
            {/* Social Links */}
            {hasSocial && (
              <div className="flex items-center gap-3 mt-4">
                {social.instagram && (
                  <a
                    href={social.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-charcoal-light hover:text-charcoal transition-colors"
                    aria-label="Instagram"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </a>
                )}
                {social.tiktok && (
                  <a
                    href={social.tiktok}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-charcoal-light hover:text-charcoal transition-colors"
                    aria-label="TikTok"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.77a4.85 4.85 0 0 1-1.01-.08z"/>
                    </svg>
                  </a>
                )}
                {social.pinterest && (
                  <a
                    href={social.pinterest}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-charcoal-light hover:text-charcoal transition-colors"
                    aria-label="Pinterest"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
                    </svg>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div>
            <h2 className="text-sm tracking-[0.2em] uppercase font-medium mb-4">
              Quick Links
            </h2>
            <ul className="space-y-3">
              {stockedLinks(navLinks, settings?.shelves).map((link) => (
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

          {/* The atelier: how to reach Kristina, and when. Every page used to
              end on "Worldwide Shipping" with no phone number, no WhatsApp and
              no hours, for a business whose money comes from people nearby
              asking about a hem. */}
          <div>
            <h2 className="text-sm tracking-[0.2em] uppercase font-medium mb-4">
              Atelier
            </h2>
            <ul className="space-y-3 text-sm text-charcoal-light">
              <li>
                <a href={BUSINESS.telephoneHref} className="inline-flex items-center gap-3 hover:text-charcoal transition-colors">
                  <Phone size={16} aria-hidden="true" className="text-lavender flex-shrink-0" />
                  {BUSINESS.telephone}
                </a>
              </li>
              <li>
                <a
                  href={whatsappLink(WHATSAPP_HELLO)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 hover:text-charcoal transition-colors"
                >
                  <MessageCircle size={16} aria-hidden="true" className="text-lavender flex-shrink-0" />
                  WhatsApp Kristina
                </a>
              </li>
              <li>
                <a href={`mailto:${BUSINESS.email}`} className="inline-flex items-center gap-3 hover:text-charcoal transition-colors break-all">
                  <Mail size={16} aria-hidden="true" className="text-lavender flex-shrink-0" />
                  {BUSINESS.email}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Clock size={16} aria-hidden="true" className="text-lavender flex-shrink-0 mt-0.5" />
                {/* One block of days per line, as Google Maps shows them */}
                <span>
                  {BUSINESS.hours.label.split(" · ").map((days) => (
                    <span key={days} className="block">{days}</span>
                  ))}
                </span>
              </li>
              <li className="flex items-center gap-3">
                <MapPin size={16} aria-hidden="true" className="text-lavender flex-shrink-0" />
                Southampton · by appointment
              </li>
              <li>
                <Link
                  href="/atelier#book"
                  className="inline-flex items-center gap-3 font-medium text-charcoal underline underline-offset-4 decoration-charcoal/30 hover:decoration-charcoal transition-colors"
                >
                  <CalendarCheck size={16} aria-hidden="true" className="text-lavender flex-shrink-0" />
                  Choose a time
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h2 className="text-sm tracking-[0.2em] uppercase font-medium mb-4">
              Information
            </h2>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
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
            {/* The shop's delivery, in one line: it is the smaller business */}
            <p className="mt-6 text-xs text-charcoal-light leading-relaxed">
              Shop delivery: UK {ukLabel} · international {intLabel}
              {threshold > 0 && <> · free in the UK over {poundsLabel(threshold)}</>}
            </p>
          </div>
        </div>

        {/* Payment icons */}
        {hasPaymentIcons && (
          <div className="flex items-center gap-2 flex-wrap mb-8">
            {icons.showVisa && <VisaIcon />}
            {icons.showMastercard && <MastercardIcon />}
            {icons.showPaypal && <PaypalIcon />}
            {icons.showApplePay && <ApplePayIcon />}
            {icons.showGooglePay && <GooglePayIcon />}
            {icons.showAmex && <AmexIcon />}
          </div>
        )}

        {/* Bottom */}
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
