"use client";

import { CalendarCheck, Clock, Heart, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import NewsletterSignup from "@/components/NewsletterSignup";
import { PRIVACY_HREF, TERMS_HREF } from "@/components/TermsNote";
import { reopenConsent } from "@/lib/consent";
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
  // The terms a booking or a payment says it agrees to (see TermsNote): a
  // page those lines point at has to be findable from every page too
  { label: "Terms & Conditions", href: TERMS_HREF },
  { label: "Privacy Policy", href: PRIVACY_HREF },
  // Contact is under Quick Links; it was listed here as well
];

/* ── Payment marks ──
   The ways to pay, each in the mark its own brand draws: the paths are
   Simple Icons' (simpleicons.org, 16.34.0, CC0), each viewBox cropped to the
   mark so they line up by height. The ones before were the names typed in
   Arial inside coloured rectangles. Drawn in the footer's grey rather than in
   six brand colours, which were the loudest thing on a cream page that is
   otherwise ink and lavender. */
const PAYMENT_MARKS = {
  visa: {
    label: "Visa",
    viewBox: "0 8.124 24 7.751",
    d: "M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z",
  },
  mastercard: {
    label: "Mastercard",
    viewBox: "0 4.584 24 14.831",
    d: "M11.343 18.031c.058.049.12.098.181.146-1.177.783-2.59 1.238-4.107 1.238C3.32 19.416 0 16.096 0 12c0-4.095 3.32-7.416 7.416-7.416 1.518 0 2.931.456 4.105 1.238-.06.051-.12.098-.165.15C9.6 7.489 8.595 9.688 8.595 12c0 2.311 1.001 4.51 2.748 6.031zm5.241-13.447c-1.52 0-2.931.456-4.105 1.238.06.051.12.098.165.15C14.4 7.489 15.405 9.688 15.405 12c0 2.31-1.001 4.507-2.748 6.031-.058.049-.12.098-.181.146 1.177.783 2.588 1.238 4.107 1.238C20.68 19.416 24 16.096 24 12c0-4.094-3.32-7.416-7.416-7.416zM12 6.174c-.096.075-.189.15-.28.231C10.156 7.764 9.169 9.765 9.169 12c0 2.236.987 4.236 2.551 5.595.09.08.185.158.28.232.096-.074.189-.152.28-.232 1.563-1.359 2.551-3.359 2.551-5.595 0-2.235-.987-4.236-2.551-5.595-.09-.08-.184-.156-.28-.231z",
  },
  paypal: {
    label: "PayPal",
    viewBox: "1.82 0 20.358 24",
    d: "M15.607 4.653H8.941L6.645 19.251H1.82L4.862 0h7.995c3.754 0 6.375 2.294 6.473 5.513-.648-.478-2.105-.86-3.722-.86m6.57 5.546c0 3.41-3.01 6.853-6.958 6.853h-2.493L11.595 24H6.74l1.845-11.538h3.592c4.208 0 7.346-3.634 7.153-6.949a5.24 5.24 0 0 1 2.848 4.686M9.653 5.546h6.408c.907 0 1.942.222 2.363.541-.195 2.741-2.655 5.483-6.441 5.483H8.714Z",
  },
  applepay: {
    label: "Apple Pay",
    viewBox: "0 4.317 24 15.365",
    d: "M2.15 4.318a42.16 42.16 0 0 0-.454.003c-.15.005-.303.013-.452.04a1.44 1.44 0 0 0-1.06.772c-.07.138-.114.278-.14.43-.028.148-.037.3-.04.45A10.2 10.2 0 0 0 0 6.222v11.557c0 .07.002.138.003.207.004.15.013.303.04.452.027.15.072.291.142.429a1.436 1.436 0 0 0 .63.63c.138.07.278.115.43.142.148.027.3.036.45.04l.208.003h20.194l.207-.003c.15-.004.303-.013.452-.04.15-.027.291-.071.428-.141a1.432 1.432 0 0 0 .631-.631c.07-.138.115-.278.141-.43.027-.148.036-.3.04-.45.002-.07.003-.138.003-.208l.001-.246V6.221c0-.07-.002-.138-.004-.207a2.995 2.995 0 0 0-.04-.452 1.446 1.446 0 0 0-1.2-1.201 3.022 3.022 0 0 0-.452-.04 10.448 10.448 0 0 0-.453-.003zm0 .512h19.942c.066 0 .131.002.197.003.115.004.25.01.375.032.109.02.2.05.287.094a.927.927 0 0 1 .407.407.997.997 0 0 1 .094.288c.022.123.028.258.031.374.002.065.003.13.003.197v11.552c0 .065 0 .13-.003.196-.003.115-.009.25-.032.375a.927.927 0 0 1-.5.693 1.002 1.002 0 0 1-.286.094 2.598 2.598 0 0 1-.373.032l-.2.003H1.906c-.066 0-.133-.002-.196-.003a2.61 2.61 0 0 1-.375-.032c-.109-.02-.2-.05-.288-.094a.918.918 0 0 1-.406-.407 1.006 1.006 0 0 1-.094-.288 2.531 2.531 0 0 1-.032-.373 9.588 9.588 0 0 1-.002-.197V6.224c0-.065 0-.131.002-.197.004-.114.01-.248.032-.375.02-.108.05-.199.094-.287a.925.925 0 0 1 .407-.406 1.03 1.03 0 0 1 .287-.094c.125-.022.26-.029.375-.032.065-.002.131-.002.196-.003zm4.71 3.7c-.3.016-.668.199-.88.456-.191.22-.36.58-.316.918.338.03.675-.169.888-.418.205-.258.345-.603.308-.955zm2.207.42v5.493h.852v-1.877h1.18c1.078 0 1.835-.739 1.835-1.812 0-1.07-.742-1.805-1.808-1.805zm.852.719h.982c.739 0 1.161.396 1.161 1.089 0 .692-.422 1.092-1.164 1.092h-.979zm-3.154.3c-.45.01-.83.28-1.05.28-.235 0-.593-.264-.981-.257a1.446 1.446 0 0 0-1.23.747c-.527.908-.139 2.255.374 2.995.249.366.549.769.944.754.373-.014.52-.242.973-.242.454 0 .586.242.98.235.41-.007.667-.366.915-.733.286-.417.403-.82.41-.841-.007-.008-.79-.308-.797-1.209-.008-.754.615-1.113.644-1.135-.352-.52-.9-.578-1.09-.593a1.123 1.123 0 0 0-.092-.002zm8.204.397c-.99 0-1.606.533-1.652 1.256h.777c.072-.358.369-.586.845-.586.502 0 .803.266.803.711v.309l-1.097.064c-.951.054-1.488.484-1.488 1.184 0 .72.548 1.207 1.332 1.207.526 0 1.032-.281 1.264-.727h.019v.659h.788v-2.76c0-.803-.62-1.317-1.591-1.317zm1.94.072l1.446 4.009c0 .003-.073.24-.073.247-.125.41-.33.571-.711.571-.069 0-.206 0-.267-.015v.666c.06.011.267.019.335.019.83 0 1.226-.312 1.568-1.283l1.5-4.214h-.868l-1.012 3.259h-.015l-1.013-3.26zm-1.167 2.189v.316c0 .521-.45.917-1.024.917-.442 0-.731-.228-.731-.579 0-.342.278-.56.769-.593z",
  },
  googlepay: {
    label: "Google Pay",
    viewBox: "0 7.235 24 9.531",
    d: "M3.963 7.235A3.963 3.963 0 00.422 9.419a3.963 3.963 0 000 3.559 3.963 3.963 0 003.541 2.184c1.07 0 1.97-.352 2.627-.957.748-.69 1.18-1.71 1.18-2.916a4.722 4.722 0 00-.07-.806H3.964v1.526h2.14a1.835 1.835 0 01-.79 1.205c-.356.241-.814.379-1.35.379-1.034 0-1.911-.697-2.225-1.636a2.375 2.375 0 010-1.517c.314-.94 1.191-1.636 2.225-1.636a2.152 2.152 0 011.52.594l1.132-1.13a3.808 3.808 0 00-2.652-1.033zm6.501.55v6.9h.886V11.89h1.465c.603 0 1.11-.196 1.522-.588a1.911 1.911 0 00.635-1.464 1.92 1.92 0 00-.635-1.456 2.125 2.125 0 00-1.522-.598zm2.427.85a1.156 1.156 0 01.823.365 1.176 1.176 0 010 1.686 1.171 1.171 0 01-.877.357H11.35V8.635h1.487a1.156 1.156 0 01.054 0zm4.124 1.175c-.842 0-1.477.308-1.907.925l.781.491c.288-.417.68-.626 1.175-.626a1.255 1.255 0 01.856.323 1.009 1.009 0 01.366.785v.202c-.34-.193-.774-.289-1.3-.289-.617 0-1.11.145-1.479.434-.37.288-.554.677-.554 1.165a1.476 1.476 0 00.525 1.156c.35.308.785.463 1.305.463.61 0 1.098-.27 1.465-.81h.038v.655h.848v-2.909c0-.61-.19-1.09-.568-1.44-.38-.35-.896-.525-1.551-.525zm2.263.154l1.946 4.422-1.098 2.38h.915L24 9.963h-.965l-1.368 3.391h-.02l-1.406-3.39zm-2.146 2.368c.494 0 .88.11 1.156.33 0 .372-.147.696-.44.973a1.413 1.413 0 01-.997.414 1.081 1.081 0 01-.69-.232.708.708 0 01-.293-.578c0-.257.12-.47.363-.647.24-.173.54-.26.9-.26Z",
  },
  americanexpress: {
    label: "American Express",
    viewBox: "0 0 24 24",
    d: "M16.015 14.378c0-.32-.135-.496-.344-.622-.21-.12-.464-.135-.81-.135h-1.543v2.82h.675v-1.027h.72c.24 0 .39.024.478.125.12.13.104.38.104.55v.35h.66v-.555c-.002-.25-.017-.376-.108-.516-.06-.08-.18-.18-.33-.234l.02-.008c.18-.072.48-.297.48-.747zm-.87.407l-.028-.002c-.09.053-.195.058-.33.058h-.81v-.63h.824c.12 0 .24 0 .33.05.098.048.156.147.15.255 0 .12-.045.215-.134.27zM20.297 15.837H19v.6h1.304c.676 0 1.05-.278 1.05-.884 0-.28-.066-.448-.187-.582-.153-.133-.392-.193-.73-.207l-.376-.015c-.104 0-.18 0-.255-.03-.09-.03-.15-.105-.15-.21 0-.09.017-.166.09-.21.083-.046.177-.066.272-.06h1.23v-.602h-1.35c-.704 0-.958.437-.958.84 0 .9.776.855 1.407.87.104 0 .18.015.225.06.046.03.082.106.082.18 0 .077-.035.15-.08.18-.06.053-.15.07-.277.07zM0 0v10.096L.81 8.22h1.75l.225.464V8.22h2.043l.45 1.02.437-1.013h6.502c.295 0 .56.057.756.236v-.23h1.787v.23c.307-.17.686-.23 1.12-.23h2.606l.24.466v-.466h1.918l.254.465v-.466h1.858v3.948H20.87l-.36-.6v.585h-2.353l-.256-.63h-.583l-.27.614h-1.213c-.48 0-.84-.104-1.08-.24v.24h-2.89v-.884c0-.12-.03-.12-.105-.135h-.105v1.036H6.067v-.48l-.21.48H4.69l-.202-.48v.465H2.235l-.256-.624H1.4l-.256.624H0V24h23.786v-7.108c-.27.135-.613.18-.973.18H21.09v-.255c-.21.165-.57.255-.914.255H14.71v-.9c0-.12-.018-.12-.12-.12h-.075v1.022h-1.8v-1.066c-.298.136-.643.15-.928.136h-.214v.915h-2.18l-.54-.617-.57.6H4.742v-3.93h3.61l.518.602.554-.6h2.412c.28 0 .74.03.942.225v-.24h2.177c.202 0 .644.045.903.225v-.24h3.265v.24c.163-.164.508-.24.803-.24h1.89v.24c.194-.15.464-.24.84-.24h1.176V0H0zM21.156 14.955c.004.005.006.012.01.016.01.01.024.01.032.02l-.042-.035zM23.828 13.082h.065v.555h-.065zM23.865 15.03v-.005c-.03-.025-.046-.048-.075-.07-.15-.153-.39-.215-.764-.225l-.36-.012c-.12 0-.194-.007-.27-.03-.09-.03-.15-.105-.15-.21 0-.09.03-.16.09-.204.076-.045.15-.05.27-.05h1.223v-.588h-1.283c-.69 0-.96.437-.96.84 0 .9.78.855 1.41.87.104 0 .18.015.224.06.046.03.076.106.076.18 0 .07-.034.138-.09.18-.045.056-.136.07-.27.07h-1.288v.605h1.287c.42 0 .734-.118.9-.36h.03c.09-.134.135-.3.135-.523 0-.24-.045-.39-.135-.526zM18.597 14.208v-.583h-2.235V16.458h2.235v-.585h-1.57v-.57h1.533v-.584h-1.532v-.51M13.51 8.787h.685V11.6h-.684zM13.126 9.543l-.007.006c0-.314-.13-.5-.34-.624-.217-.125-.47-.135-.81-.135H10.43v2.82h.674v-1.034h.72c.24 0 .39.03.487.12.122.136.107.378.107.548v.354h.677v-.553c0-.25-.016-.375-.11-.516-.09-.107-.202-.19-.33-.237.172-.07.472-.3.472-.75zm-.855.396h-.015c-.09.054-.195.056-.33.056H11.1v-.623h.825c.12 0 .24.004.33.05.09.04.15.128.15.25s-.047.22-.134.266zM15.92 9.373h.632v-.6h-.644c-.464 0-.804.105-1.02.33-.286.3-.362.69-.362 1.11 0 .512.123.833.36 1.074.232.238.645.31.97.31h.78l.255-.627h1.39l.262.627h1.36v-2.11l1.272 2.11h.95l.002.002V8.786h-.684v1.963l-1.18-1.96h-1.02V11.4L18.11 8.744h-1.004l-.943 2.22h-.3c-.177 0-.362-.03-.468-.134-.125-.15-.186-.36-.186-.662 0-.285.08-.51.194-.63.133-.135.272-.165.516-.165zm1.668-.108l.464 1.118v.002h-.93l.466-1.12zM2.38 10.97l.254.628H4V9.393l.972 2.205h.584l.973-2.202.015 2.202h.69v-2.81H6.118l-.807 1.904-.876-1.905H3.343v2.663L2.205 8.787h-.997L.01 11.597h.72l.26-.626h1.39zm-.688-1.705l.46 1.118-.003.002h-.915l.457-1.12zM11.856 13.62H9.714l-.85.923-.825-.922H5.346v2.82H8l.855-.932.824.93h1.302v-.94h.838c.6 0 1.17-.164 1.17-.945l-.006-.003c0-.78-.598-.93-1.128-.93zM7.67 15.853l-.014-.002H6.02v-.557h1.47v-.574H6.02v-.51H7.7l.733.82-.764.824zm2.642.33l-1.03-1.147 1.03-1.108v2.253zm1.553-1.258h-.885v-.717h.885c.24 0 .42.098.42.344 0 .243-.15.372-.42.372zM9.967 9.373v-.586H7.73V11.6h2.237v-.58H8.4v-.564h1.527V9.88H8.4v-.507",
  },
} as const;

function PaymentMark({ mark }: { mark: keyof typeof PAYMENT_MARKS }) {
  const { label, viewBox, d } = PAYMENT_MARKS[mark];
  return (
    <svg viewBox={viewBox} role="img" aria-label={label} fill="currentColor" className="h-5 w-9">
      <path d={d} />
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
            {/* Social Links. Each icon is 20px and was a 20px target; p-3
                makes the target 44px and -m-3 takes the room back, so the
                row looks as it did */}
            {hasSocial && (
              <div className="flex items-center gap-3 mt-4">
                {social.instagram && (
                  <a
                    href={social.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="-m-3 p-3 text-charcoal-light hover:text-charcoal transition-colors"
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
                    className="-m-3 p-3 text-charcoal-light hover:text-charcoal transition-colors"
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
                    className="-m-3 p-3 text-charcoal-light hover:text-charcoal transition-colors"
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
              Quick links
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
          <div className="flex items-center gap-x-4 gap-y-3 flex-wrap mb-8 text-charcoal/60">
            {icons.showVisa && <PaymentMark mark="visa" />}
            {icons.showMastercard && <PaymentMark mark="mastercard" />}
            {icons.showPaypal && <PaymentMark mark="paypal" />}
            {icons.showApplePay && <PaymentMark mark="applepay" />}
            {icons.showGooglePay && <PaymentMark mark="googlepay" />}
            {icons.showAmex && <PaymentMark mark="americanexpress" />}
          </div>
        )}

        {/* Bottom */}
        <div className="border-t border-lavender-soft/30 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-charcoal-light">
            © {new Date().getFullYear()} Beautasy. All rights reserved.
            {/* Where a cookie yes is taken back; the privacy policy sends people here */}
            <button
              type="button"
              onClick={reopenConsent}
              className="ml-3 underline underline-offset-2 hover:text-charcoal transition-colors"
            >
              Cookie settings
            </button>
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
