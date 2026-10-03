"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { availability } from "@/lib/availability";
import { DELIVERY_TIMES, withoutQuotedDays } from "@/lib/delivery";
import {
  EMPTY_MEASUREMENTS,
  bagBlockers,
  bagButtonLabel,
  bagLines,
  isBlocked,
  listMeasurements,
  measurementFieldsFor,
  missingMeasurements,
  requiredMeasurementsFor,
  type Measurements,
} from "@/lib/productBag";
import { CARD, THUMB, sizedImageUrl } from "@/lib/shopImages";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Gift,
  Truck,
  Sparkles,
  Package,
  Search,
  Ruler,
  Bell,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { PortableText } from "@portabletext/react";
import WishlistButton from "@/components/WishlistButton";
import { wishlistEntry } from "@/store/useWishlist";
import ReviewList, { type Review } from "@/components/ReviewList";
import Lightbox from "@/components/Lightbox";
import SizeQuiz from "@/components/SizeQuiz";
import { useCart } from "@/store/useCart";
import { useCartUI } from "@/store/useCartUI";
import { trackViewItem, trackAddToCart } from "@/lib/analytics";
import { fadeUp, stagger } from "@/components/animations";

/* eslint-disable @next/next/no-img-element */

/* ─── Types ─── */
interface SizePrice {
  size: string;
  price: number;
}

interface SizeStock {
  size: string;
  quantity: number;
}

interface SizeGuideRow {
  size?: string;
  uk?: string;
  eu?: string;
  bust?: string;
  waist?: string;
  hips?: string;
}

interface SizeGuide {
  name: string;
  notes?: string;
  rows?: SizeGuideRow[];
}

interface ColorOption {
  name: string;
  hex?: string;
  variantImage?: string; // resolved URL from Sanity
}

interface ProductProps {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  description: unknown[];
  category: string;
  stock: number;
  productBadges: string[];
  handmadeDisclaimer?: string;
  productionTime?: string;
  availableSizes: string[];
  sizePrices: SizePrice[];
  sizeStock: SizeStock[];
  availableColors: ColorOption[];
  careInstructions: unknown[] | null;
  shippingInfo: unknown[] | null;
  packagingInfo: unknown[] | null;
  giftBoxAvailable: boolean;
  giftBoxPrice: number;
  madeToMeasureAvailable?: boolean;
  madeToMeasurePrice?: number;
  giftCardPlaceholder?: string;
  collection?: { name: string; slug: string; season?: string } | null;
  sizeGuide?: SizeGuide | null;
}

const BADGE_LABELS: Record<string, { label: string; className: string }> = {
  "new-in": { label: "New In", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  "best-seller": { label: "Best Seller", className: "bg-amber-100 text-amber-700 border-amber-200" },
  "limited-edition": { label: "Limited Edition", className: "bg-rose-100 text-rose-700 border-rose-200" },
};

const GIFT_MESSAGE_MAX = 200;

/* ─── Back-in-stock notify form ─── */
function StockAlertForm({ productId, size }: { productId: string; size?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/stock-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, email, size }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p className="flex items-center gap-2 text-xs text-green-600 font-medium mt-2">
        <CheckCircle2 size={14} />
        We&apos;ll email you when ready-made stock is available.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email"
        className="flex-1 min-w-0 text-xs px-3 py-2 rounded-lg border border-lavender-soft/50 bg-white focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-lavender/20 hover:bg-lavender/30 text-charcoal rounded-lg text-xs font-medium transition-colors disabled:opacity-60"
      >
        {status === "loading" ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
        Notify Me
      </button>
      {status === "error" && (
        <span className="text-[10px] text-red-500">Try again</span>
      )}
    </form>
  );
}

/* ─── Accordion Component ─── */
function Accordion({
  title,
  icon,
  content,
  lead,
}: {
  title: string;
  icon: React.ReactNode;
  content: unknown[] | null;
  /** Lines the site says itself, above whatever was written in the Studio */
  lead?: readonly string[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  const hasContent = !!content && content.length > 0;
  if (!hasContent && !(lead && lead.length > 0)) return null;

  return (
    <div className="border-t border-lavender-soft/40">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4 text-left group"
      >
        <span className="flex items-center gap-3 text-sm tracking-wider uppercase font-medium text-charcoal group-hover:text-charcoal/80 transition-colors">
          {icon}
          {title}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <ChevronDown size={16} className="text-charcoal-light" />
        </motion.span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pb-5 text-sm text-charcoal-light leading-relaxed prose prose-sm max-w-none">
              {lead?.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {hasContent && (
                <PortableText value={content as Parameters<typeof PortableText>[0]["value"]} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Category label mapping ─── */
const categorySlugMap: Record<string, string> = {
  Lingerie: "lingerie",
  Kids: "kids",
  Accessories: "accessories",
  Home: "home",
};

interface RelatedProduct {
  _id: string;
  name: string;
  slug: string;
  price: number;
  image: string;
  category: string;
}

/* ─── Main Component ─── */
export default function ProductDetail({
  product,
  relatedProducts = [],
  reviews = [],
  averageRating = 0,
}: {
  product: ProductProps;
  relatedProducts?: RelatedProduct[];
  /** Approved reviews, fetched on the server so they land in the HTML */
  reviews?: Review[];
  averageRating?: number;
}) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [giftBoxChecked, setGiftBoxChecked] = useState(false);
  const [madeToMeasure, setMadeToMeasure] = useState(false);
  const [measurements, setMeasurements] = useState<Measurements>(EMPTY_MEASUREMENTS);
  // Set when an add was stopped for a missing measurement; the message stays
  // until the fields are filled, rather than flashing past
  const [measurementsError, setMeasurementsError] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState(false);
  const [colorError, setColorError] = useState(false);
  const addItem = useCart((state) => state.addItem);
  const openCart = useCartUI((state) => state.openCart);
  // Lets the sticky mobile bar send the customer back up to the size/colour picker
  const optionsRef = useRef<HTMLDivElement | null>(null);
  // …and to the measurement fields, when one of those is what's missing
  const measurementsRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);

  const hasSizes = product.availableSizes && product.availableSizes.length > 0;
  const hasColors =
    product.availableColors && product.availableColors.length > 0;

  const sizePriceMap: Record<string, number> = {};
  for (const sp of product.sizePrices ?? []) {
    sizePriceMap[sp.size] = sp.price;
  }
  const currentPrice: number =
    selectedSize != null && sizePriceMap[selectedSize] != null
      ? sizePriceMap[selectedSize]
      : product.price;

  // Per-size stock is optional — when tracked, a sold-out size is disabled
  // even while the product's overall stock (or other sizes) remain available.
  const hasSizeStock = product.sizeStock && product.sizeStock.length > 0;
  const sizeStockMap: Record<string, number> = {};
  for (const ss of product.sizeStock ?? []) {
    sizeStockMap[ss.size] = ss.quantity;
  }
  const currentStock: number =
    hasSizeStock && selectedSize != null
      ? sizeStockMap[selectedSize] ?? 0
      : product.stock;

  const mtmPrice = product.madeToMeasurePrice ?? 0;
  const mtmOffered = !!product.madeToMeasureAvailable && mtmPrice > 0;
  // Ticked, on a piece that offers it: the only state in which the +£10 is owed
  const measuring = madeToMeasure && mtmOffered;
  // Children's pieces are cut from waist, hips and height (see @/lib/productBag)
  const forChild = product.category === "Kids";
  const measurementFields = measurementFieldsFor(product.category);
  const requiredMeasurements = requiredMeasurementsFor(product.category);
  const measurementsMissing = missingMeasurements(measurements, product.category);

  // One answer to "can this go in the bag yet?", shared by the main button and
  // the phone's sticky bar, so neither can add what the other would refuse
  const blockers = bagBlockers({
    hasSizes: !!hasSizes,
    size: selectedSize,
    hasColors: !!hasColors,
    color: selectedColor,
    madeToMeasure: measuring,
    measurementsMissing,
  });
  const bagTotal =
    currentPrice +
    (giftBoxChecked && product.giftBoxAvailable ? product.giftBoxPrice : 0) +
    (measuring ? mtmPrice : 0);

  // Ships now or made for you: one answer, from the same helper as the grid
  const avail = availability(
    {
      stock: product.stock,
      sizeStock: product.sizeStock,
      availableSizes: product.availableSizes,
      productionTime: product.productionTime,
    },
    { size: selectedSize, madeToMeasure: measuring }
  );

  const images = product.images;
  // If the selected colour has a variant image, show that instead of the gallery index
  const activeColorVariant =
    selectedColor != null
      ? product.availableColors.find((c) => c.name === selectedColor)?.variantImage
      : undefined;
  const activeImage = activeColorVariant ?? images[activeImageIndex] ?? images[0];
  const categorySlug = categorySlugMap[product.category] || "lingerie";

  const goNext = useCallback(() => {
    setActiveImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  const goPrev = useCallback(() => {
    setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  // Report the product view once per product, for GA4 funnels and remarketing
  useEffect(() => {
    trackViewItem({
      id: product._id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      category: product.category,
    });
  }, [product._id, product.name, product.slug, product.price, product.category]);

  function handleAddToCart() {
    if (blockers.size || blockers.colour) {
      // On a phone this is pressed from the sticky bar, far below the choices
      optionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (blockers.size) {
        setSizeError(true);
        setTimeout(() => setSizeError(false), 2500);
      }
      if (blockers.colour) {
        setColorError(true);
        setTimeout(() => setColorError(false), 2500);
      }
      return;
    }
    if (blockers.measurements) {
      // Never the standard piece instead: she ticked made to measure, and
      // that is what she expects to pay for and receive
      setMeasurementsError(true);
      measurementsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      measurementsRef.current
        ?.querySelector<HTMLInputElement>(`input[name="${measurementsMissing[0]}"]`)
        ?.focus({ preventScroll: true });
      return;
    }

    // The piece, then the gift box and the made-to-measure line when chosen
    const lines = bagLines({
      product: { _id: product._id, name: product.name, slug: product.slug },
      price: currentPrice,
      image: activeImage,
      size: selectedSize,
      color: selectedColor,
      giftBox:
        giftBoxChecked && product.giftBoxAvailable
          ? { price: product.giftBoxPrice, message: giftMessage }
          : null,
      madeToMeasure: measuring ? { price: mtmPrice, measurements } : null,
    });
    for (const line of lines) addItem(line);

    trackAddToCart([
      {
        id: product._id,
        name: product.name,
        slug: product.slug,
        price: currentPrice,
        quantity: 1,
        category: product.category,
        variant: [selectedSize, selectedColor].filter(Boolean).join(" / ") || undefined,
      },
    ]);

    // Show the customer what just happened — the bag icon is usually scrolled
    // out of view here, so adding silently reads as a broken button.
    openCart();
  }

  return (
    <>
      <main className="pt-28 pb-24 md:pb-0">
        {/* ── Breadcrumb ── */}
        <div className="max-w-6xl mx-auto px-6 py-6">
          <nav className="flex items-center gap-2 text-sm text-charcoal-light">
            <Link
              href="/shop"
              className="hover:text-charcoal transition-colors"
            >
              Shop
            </Link>
            <span>/</span>
            <Link
              href={`/shop/${categorySlug}`}
              className="hover:text-charcoal transition-colors"
            >
              {product.category}
            </Link>
            <span>/</span>
            <span className="text-charcoal">{product.name}</span>
          </nav>
        </div>

        {/* ── Product Layout ── */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
          {/* initial={false}: painted as it is, not faded in. The photo is the
              page's largest paint, and fading it in from opacity 0 kept it
              invisible until every script had loaded — measured on a phone, 6.3
              seconds after the picture itself had arrived. The name, price and
              Add to Bag beside it waited the same way, 5.5–6 seconds on a
              throttled phone, so the whole layout now starts visible; its
              children inherit that. */}
          <motion.div
            initial={false}
            animate="visible"
            variants={stagger}
            className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16"
          >
            {/* ──── Left: Image Gallery ──── */}
            <motion.div variants={fadeUp} custom={0}>
              {/* Main Image */}
              <div
                className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-white/60 mb-4"
                onTouchStart={(e) => {
                  touchStartX.current = e.changedTouches[0].clientX;
                }}
                onTouchEnd={(e) => {
                  // Swipe through the gallery on touch devices; the arrows are
                  // fiddly on a phone and everyone expects a swipe here.
                  if (touchStartX.current == null || images.length < 2) return;
                  const dx = e.changedTouches[0].clientX - touchStartX.current;
                  if (Math.abs(dx) > 45) (dx < 0 ? goNext : goPrev)();
                  touchStartX.current = null;
                }}
              >
                {/* The LCP element on a product page: sized per device and
                    fetched with priority so it is not queued behind scripts. */}
                <Image
                  src={activeImage}
                  alt={product.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                  preload
                  fetchPriority="high"
                />
                {/* Zoom button */}
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-charcoal hover:bg-white transition-colors shadow-md"
                  aria-label="Zoom image"
                >
                  <Search size={18} />
                </button>

                {/* Nav arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={goPrev}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/70 backdrop-blur-sm flex items-center justify-center text-charcoal hover:bg-white transition-colors"
                      aria-label="Previous image"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/70 backdrop-blur-sm flex items-center justify-center text-charcoal hover:bg-white transition-colors"
                      aria-label="Next image"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((image, i) => (
                    <button
                      key={`thumb-${i}`}
                      type="button"
                      onClick={() => setActiveImageIndex(i)}
                      className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                        i === activeImageIndex
                          ? "border-lavender shadow-md"
                          : "border-transparent hover:border-lavender/40"
                      }`}
                      aria-label={`Show image ${i + 1}`}
                    >
                      {/* A small copy, fetched when needed (see @/lib/shopImages) */}
                      <img
                        src={sizedImageUrl(image, THUMB)}
                        alt={`${product.name} thumbnail ${i + 1}`}
                        width={64}
                        height={64}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </motion.div>

            {/* ──── Right: Product Info ──── */}
            <motion.div variants={fadeUp} custom={1} className="flex flex-col">
              {/* Category + Stock + Badges */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="px-3 py-1 bg-lavender-bg rounded-full text-xs tracking-wider uppercase text-charcoal-light">
                  {product.category}
                </span>
                {product.collection && (
                  <Link
                    href={`/shop/collection/${product.collection.slug}`}
                    className="px-3 py-1 bg-lavender/25 hover:bg-lavender/40 rounded-full text-xs font-medium text-charcoal transition-colors"
                  >
                    {product.collection.name}
                    {product.collection.season && (
                      <span className="text-charcoal-light ml-1">· {product.collection.season}</span>
                    )}
                  </Link>
                )}
                {/* One availability line, not a stock chip beside a "Made in"
                    chip: the two used to say "only 4 left" and "made in 3–5
                    days" at once. The colours are dark enough to read at this
                    size (4.5:1 or more on the cream page). */}
                <span
                  className={`flex items-center gap-1 text-xs font-medium ${
                    avail.kind === "made-to-order" ? "text-charcoal-light" : "text-emerald-700"
                  }`}
                >
                  <Package size={12} className="text-lavender" aria-hidden="true" />
                  {avail.label}
                </span>
                {avail.fewLeft !== null && (
                  <span className="text-xs text-rose-700 font-medium">
                    Only {avail.fewLeft} left ready-made{selectedSize && hasSizeStock ? ` in size ${selectedSize}` : ""}
                  </span>
                )}
                {product.productBadges?.map((badge) => {
                  const b = BADGE_LABELS[badge];
                  return b ? (
                    <span
                      key={badge}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${b.className}`}
                    >
                      {b.label}
                    </span>
                  ) : null;
                })}
              </div>

              {/* Name + Price */}
              <h1 className="font-serif text-3xl sm:text-4xl mb-2">
                {product.name}
              </h1>
              <p className="font-serif text-2xl text-charcoal mb-6">
                £{(currentPrice / 100).toFixed(2)}
              </p>

              {/* Description */}
              {product.description && product.description.length > 0 && (
                <div className="text-charcoal-light leading-relaxed mb-8 prose prose-sm max-w-none">
                  <PortableText value={product.description as Parameters<typeof PortableText>[0]["value"]} />
                </div>
              )}

              {/* ── Size Selector ── */}
              <div ref={optionsRef} />
              {hasSizes && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm tracking-wider uppercase font-medium text-charcoal">
                      Size
                      {selectedSize && (
                        <span className="ml-2 font-normal text-charcoal-light normal-case tracking-normal">
                          — {selectedSize}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-3">
                      {product.sizeGuide?.rows && product.sizeGuide.rows.length > 0 && (
                        <SizeQuiz
                          rows={product.sizeGuide.rows}
                          availableSizes={product.availableSizes}
                          onPick={(size) => {
                            setSelectedSize(size);
                            setSizeError(false);
                          }}
                        />
                      )}
                      {product.sizeGuide && (
                        <button
                          type="button"
                          onClick={() => setSizeGuideOpen(true)}
                          className="flex items-center gap-1.5 text-xs text-charcoal-light hover:text-charcoal transition-colors underline underline-offset-2"
                        >
                          <Ruler size={13} />
                          Size Guide
                        </button>
                      )}
                      {sizeError && (
                        <motion.p
                          initial={{ opacity: 0, x: 6 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-xs text-rose-500 font-medium"
                        >
                          Please select a size
                        </motion.p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {product.availableSizes.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => {
                          setSelectedSize(size);
                          setSizeError(false);
                        }}
                        className={`min-w-[52px] px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${
                          selectedSize === size
                            ? "bg-lavender border-lavender text-charcoal shadow-sm scale-105"
                            : sizeError
                            ? "bg-white border-rose-300 text-charcoal hover:border-lavender"
                            : "bg-white border-lavender-soft/50 text-charcoal hover:border-lavender hover:bg-lavender/10"
                        }`}
                        aria-pressed={selectedSize === size}
                        aria-label={`Size ${size}`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Colour Selector ── */}
              {hasColors && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm tracking-wider uppercase font-medium text-charcoal">
                      Colour
                      {selectedColor && (
                        <span className="ml-2 font-normal text-charcoal-light normal-case tracking-normal">
                          — {selectedColor}
                        </span>
                      )}
                    </p>
                    {colorError && (
                      <motion.p
                        initial={{ opacity: 0, x: 6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-rose-500 font-medium"
                      >
                        Please select a colour
                      </motion.p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {product.availableColors.map((color) => {
                      const active = selectedColor === color.name;
                      return (
                        <button
                          key={color.name}
                          type="button"
                          onClick={() => {
                            setSelectedColor(color.name);
                            setColorError(false);
                          }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-full border text-sm font-medium transition-all duration-200 ${
                            active
                              ? "bg-lavender border-lavender text-charcoal shadow-sm scale-105"
                              : colorError
                              ? "bg-white border-rose-300 text-charcoal hover:border-lavender"
                              : "bg-white border-lavender-soft/50 text-charcoal hover:border-lavender hover:bg-lavender/10"
                          }`}
                          aria-pressed={active}
                          aria-label={`Colour ${color.name}`}
                        >
                          {color.hex && (
                            <span
                              className="inline-block w-4 h-4 rounded-full border border-charcoal/15 shadow-sm"
                              style={{ backgroundColor: color.hex }}
                            />
                          )}
                          {color.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Made to measure ── */}
              {/* The atelier already sews to order; this sells that properly
                  instead of leaving it on a separate page nobody links to. */}
              {mtmOffered && (
                <div className="mb-6" ref={measurementsRef}>
                  <label className="flex items-center gap-3 p-4 rounded-xl bg-lavender-bg/50 border border-lavender-soft/30 cursor-pointer group hover:bg-lavender-bg transition-colors">
                    <input
                      type="checkbox"
                      checked={madeToMeasure}
                      onChange={(e) => {
                        setMadeToMeasure(e.target.checked);
                        setMeasurementsError(false);
                      }}
                      className="w-4 h-4 rounded accent-lavender"
                    />
                    <Ruler size={18} className="text-lavender shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-charcoal">
                        {forChild ? "Made to their measurements" : "Made to your measurements"}
                      </p>
                      <p className="text-xs text-charcoal-light">
                        {forChild
                          ? "Cut to fit your child, in our Southampton atelier"
                          : "Cut for you in our Southampton atelier"}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-charcoal">
                      +£{(mtmPrice / 100).toFixed(2)}
                    </span>
                  </label>

                  <AnimatePresence>
                    {madeToMeasure && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 p-4 rounded-xl bg-white border border-lavender-soft/40 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            {measurementFields.map(([field, label]) => (
                              <label key={field} className="block">
                                <span className="block text-[11px] tracking-wider uppercase text-charcoal-light mb-1">
                                  {label}
                                  {requiredMeasurements.includes(field) && (
                                    <span className="text-rose-700" aria-hidden="true"> *</span>
                                  )}
                                </span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  name={field}
                                  aria-required={requiredMeasurements.includes(field)}
                                  aria-invalid={measurementsError && measurementsMissing.includes(field)}
                                  value={measurements[field]}
                                  onChange={(e) =>
                                    setMeasurements((m) => ({ ...m, [field]: e.target.value.slice(0, 12) }))
                                  }
                                  placeholder="e.g. 86cm"
                                  className="w-full text-sm px-3 py-2 rounded-lg border border-lavender-soft/40 bg-cream-soft/50 text-charcoal placeholder:text-charcoal/30 focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
                                />
                              </label>
                            ))}
                          </div>
                          <label className="block">
                            <span className="block text-[11px] tracking-wider uppercase text-charcoal-light mb-1">
                              Anything else we should know?
                            </span>
                            <textarea
                              rows={2}
                              value={measurements.notes}
                              onChange={(e) =>
                                setMeasurements((m) => ({ ...m, notes: e.target.value.slice(0, 200) }))
                              }
                              placeholder="Longer straps, a little more room at the back…"
                              className="w-full text-sm px-3 py-2 rounded-lg border border-lavender-soft/40 bg-cream-soft/50 text-charcoal placeholder:text-charcoal/30 resize-none focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
                            />
                          </label>
                          {/* Said where the missing fields are, after an add was
                              stopped for them — never a standard size instead */}
                          {measurementsError && measurementsMissing.length > 0 && (
                            <p role="alert" className="text-xs text-rose-700 font-medium leading-relaxed">
                              {forChild ? "Add their" : "Add your"} {listMeasurements(measurementsMissing)} so
                              Kristina can cut it, or untick made to measure for a standard size.
                            </p>
                          )}
                          {/* "Waist and hips" for a child's piece, which asks no bust */}
                          <p className="text-[11px] text-charcoal-light leading-relaxed first-letter:uppercase">
                            {listMeasurements(requiredMeasurements)} are needed. Not sure how to measure? Reply to your
                            order email and Kristina will talk you through it.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Gift Box Option */}
              {product.giftBoxAvailable && product.giftBoxPrice > 0 && (
                <div className="mb-6">
                  <label className="flex items-center gap-3 p-4 rounded-xl bg-lavender-bg/50 border border-lavender-soft/30 cursor-pointer group hover:bg-lavender-bg transition-colors">
                    <input
                      type="checkbox"
                      checked={giftBoxChecked}
                      onChange={(e) => setGiftBoxChecked(e.target.checked)}
                      className="w-4 h-4 rounded accent-lavender"
                    />
                    <Gift size={18} className="text-lavender shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-charcoal">
                        Add Gift Box
                      </p>
                      <p className="text-xs text-charcoal-light">
                        Beautifully wrapped in a Beautasy gift box
                      </p>
                    </div>
                    <span className="text-sm font-medium text-charcoal">
                      +£{(product.giftBoxPrice / 100).toFixed(2)}
                    </span>
                  </label>

                  <AnimatePresence>
                    {giftBoxChecked && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 p-4 rounded-xl bg-white border border-lavender-soft/40">
                          <label
                            htmlFor="gift-message"
                            className="block text-xs tracking-wider uppercase font-medium text-charcoal mb-2"
                          >
                            Gift card message{" "}
                            <span className="text-charcoal-light normal-case tracking-normal font-normal">
                              (optional)
                            </span>
                          </label>
                          <textarea
                            id="gift-message"
                            value={giftMessage}
                            onChange={(e) =>
                              setGiftMessage(
                                e.target.value.slice(0, GIFT_MESSAGE_MAX)
                              )
                            }
                            rows={3}
                            placeholder={product.giftCardPlaceholder || "Write a short note to include with the gift card…"}
                            className="w-full text-sm text-charcoal bg-cream-soft/50 rounded-lg border border-lavender-soft/40 px-3 py-2 focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20 resize-none"
                          />
                          <p className="text-[11px] text-charcoal-light mt-1.5 text-right">
                            {giftMessage.length} / {GIFT_MESSAGE_MAX}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Add to Cart + Wishlist */}
              <div className="flex items-center gap-3 mb-8">
                {/* aria-disabled rather than disabled: a disabled button
                    swallows the tap, and the tap is what shows the customer
                    what is still missing. handleAddToCart refuses the add. */}
                <button
                  type="button"
                  onClick={handleAddToCart}
                  aria-disabled={isBlocked(blockers)}
                  className={`flex-1 group inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full text-sm tracking-wider uppercase font-medium transition-all duration-300 ${
                    isBlocked(blockers)
                      ? "bg-lavender/40 text-charcoal/50 cursor-not-allowed"
                      : "bg-lavender text-charcoal hover:bg-[#CFC0F0] hover:shadow-lg hover:shadow-lavender/30"
                  }`}
                >
                  {bagButtonLabel(blockers, bagTotal)}
                </button>
                <WishlistButton
                  product={wishlistEntry(
                    { ...product, colorCount: product.availableColors?.length ?? 0 },
                    images[0]
                  )}
                />
              </div>

              {/* When it leaves the atelier, in a sentence. Kristina's handmade
                  note says "ready to dispatch within 3–5 business days", which
                  is only true of a piece made to order — beside ready-made stock
                  it was a second, slower promise — so it stands in for the
                  sentence on that branch alone. */}
              <p className="text-xs text-charcoal-light leading-relaxed mb-6 flex items-start gap-2">
                <Sparkles size={13} className="text-lavender shrink-0 mt-0.5" aria-hidden="true" />
                {avail.kind === "made-to-order" && !measuring && product.handmadeDisclaimer
                  ? product.handmadeDisclaimer
                  : avail.detail}
              </p>

              {/* Back-in-stock signup — only once we know there's no ready-made stock
                  for the current selection (or the product as a whole, when sizes
                  aren't stock-tracked individually) */}
              {(hasSizeStock ? selectedSize && currentStock === 0 : currentStock === 0) && (
                <div className="mb-6 p-4 rounded-xl bg-lavender-bg/40 border border-lavender-soft/30">
                  <p className="flex items-center gap-1.5 text-xs tracking-wider uppercase font-medium text-charcoal">
                    <Bell size={13} className="text-lavender" />
                    Prefer ready-made stock{selectedSize ? ` in size ${selectedSize}` : ""}?
                  </p>
                  <StockAlertForm productId={product._id} size={selectedSize ?? undefined} />
                </div>
              )}

              {/* Accordion Sections */}
              <div className="border-b border-lavender-soft/40">
                <Accordion
                  title="Care Instructions"
                  icon={<Sparkles size={16} />}
                  content={product.careInstructions}
                />
                {/* Delivery times are the ones Stripe shows at payment (see
                    @/lib/delivery); the Studio text keeps everything else */}
                <Accordion
                  title="Shipping"
                  icon={<Truck size={16} />}
                  lead={DELIVERY_TIMES}
                  content={withoutQuotedDays(product.shippingInfo)}
                />
                <Accordion
                  title="Packaging & Gifting"
                  icon={<Package size={16} />}
                  content={product.packagingInfo}
                />
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* ── You Might Also Like ── */}
        {relatedProducts.length > 0 && (
          <section className="max-w-6xl mx-auto px-6 pb-20">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
            >
              <motion.h3
                variants={fadeUp}
                custom={0}
                className="font-serif text-2xl mb-6"
              >
                You Might Also Like
              </motion.h3>
              <motion.div
                variants={stagger}
                className="grid grid-cols-2 sm:grid-cols-4 gap-6"
              >
                {relatedProducts.map((rp, i) => (
                  <motion.div key={rp._id} variants={fadeUp} custom={i + 1}>
                    <Link href={`/shop/${rp.slug}`} className="group block">
                      <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-white/60 mb-3">
                        {/* A 4:5 card a few hundred pixels wide, below the fold:
                            a 400px copy, fetched once it is near the screen */}
                        <img
                          src={sizedImageUrl(rp.image, CARD)}
                          alt={rp.name}
                          width={CARD.width}
                          height={CARD.height}
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                        />
                        <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-300" />
                      </div>
                      <h4 className="font-serif text-sm mb-1 group-hover:text-charcoal/70 transition-colors line-clamp-2">
                        {rp.name}
                      </h4>
                      <p className="text-xs text-charcoal-light">
                        £{(rp.price / 100).toFixed(2)}
                      </p>
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </section>
        )}

        {/* ── Reviews ── */}
        <section className="max-w-6xl mx-auto px-6 pb-16">
          <div className="py-16 border-t border-lavender-soft/40">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h2 className="font-serif text-2xl">Customer Reviews</h2>
              {/* The same form as /reviews, with this piece filled in: no account,
                  and Kristina approves it before it shows here. It replaced a
                  form that asked people to sign in first — nobody ever did. */}
              <Link
                href={`/reviews?product=${encodeURIComponent(product._id)}&piece=${encodeURIComponent(product.name)}#write`}
                className="inline-flex items-center px-6 py-2.5 rounded-full border border-lavender text-charcoal text-xs tracking-wider uppercase font-medium hover:bg-lavender transition-colors duration-300"
              >
                Write a review
              </Link>
            </div>
            <ReviewList reviews={reviews} averageRating={averageRating} />
          </div>
        </section>
      </main>

      {/* ──── Sticky mobile buy bar ──── */}
      {/* On a phone the price and the button sit well below the gallery, so the
          main call to action was off-screen for most of the page. It asks the
          same questions as the main button, through the same handler: it once
          skipped the measurements and added a standard size instead. */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FDFBF7]/95 backdrop-blur-md border-t border-lavender-soft/40 px-4 py-3 flex items-center gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-charcoal-light truncate">{product.name}</p>
          <p className="font-serif text-lg leading-tight">£{(bagTotal / 100).toFixed(2)}</p>
          {measuring && (
            <p className="text-[11px] text-charcoal-light truncate">
              incl. +£{(mtmPrice / 100).toFixed(2)} made to measure
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleAddToCart}
          aria-disabled={isBlocked(blockers)}
          className="flex-1 py-3 rounded-full bg-lavender text-charcoal text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-colors"
        >
          {bagButtonLabel(blockers)}
        </button>
      </div>

      <Lightbox
        images={images}
        alt={product.name}
        index={activeImageIndex}
        onIndexChange={setActiveImageIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />

      {/* ──── Size Guide Modal ──── */}
      <AnimatePresence>
        {sizeGuideOpen && product.sizeGuide && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSizeGuideOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998]"
            />
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.97 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed inset-0 flex items-end sm:items-center justify-center z-[9999] p-4"
              onClick={() => setSizeGuideOpen(false)}
            >
              <div
                className="bg-[#FDFBF7] rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-lavender-soft/40 shrink-0">
                  <div className="flex items-center gap-2">
                    <Ruler size={18} className="text-lavender" />
                    <h3 className="font-serif text-xl">{product.sizeGuide.name}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSizeGuideOpen(false)}
                    className="p-1.5 rounded-full text-charcoal-light hover:text-charcoal hover:bg-lavender-bg transition-colors"
                    aria-label="Close size guide"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Table */}
                <div className="overflow-auto flex-1 px-6 py-5">
                  {product.sizeGuide.rows && product.sizeGuide.rows.length > 0 ? (() => {
                    const rows = product.sizeGuide!.rows!;
                    // Only show columns that have at least one non-empty value
                    const hasUk   = rows.some((r) => r.uk);
                    const hasEu   = rows.some((r) => r.eu);
                    const hasBust = rows.some((r) => r.bust);
                    const hasWaist = rows.some((r) => r.waist);
                    const hasHips  = rows.some((r) => r.hips);

                    return (
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="text-left">
                            <th className="pb-3 pr-4 text-xs tracking-wider uppercase text-charcoal-light font-medium">Size</th>
                            {hasUk    && <th className="pb-3 pr-4 text-xs tracking-wider uppercase text-charcoal-light font-medium">UK</th>}
                            {hasEu    && <th className="pb-3 pr-4 text-xs tracking-wider uppercase text-charcoal-light font-medium">EU</th>}
                            {hasBust  && <th className="pb-3 pr-4 text-xs tracking-wider uppercase text-charcoal-light font-medium">Bust</th>}
                            {hasWaist && <th className="pb-3 pr-4 text-xs tracking-wider uppercase text-charcoal-light font-medium">Waist</th>}
                            {hasHips  && <th className="pb-3 pr-4 text-xs tracking-wider uppercase text-charcoal-light font-medium">Hips</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, i) => (
                            <tr
                              key={i}
                              className={`border-t border-lavender-soft/30 ${i % 2 === 0 ? "bg-lavender-bg/30" : ""}`}
                            >
                              <td className="py-3 pr-4 font-medium text-charcoal">{row.size ?? "—"}</td>
                              {hasUk    && <td className="py-3 pr-4 text-charcoal-light">{row.uk    || "—"}</td>}
                              {hasEu    && <td className="py-3 pr-4 text-charcoal-light">{row.eu    || "—"}</td>}
                              {hasBust  && <td className="py-3 pr-4 text-charcoal-light">{row.bust  || "—"}</td>}
                              {hasWaist && <td className="py-3 pr-4 text-charcoal-light">{row.waist || "—"}</td>}
                              {hasHips  && <td className="py-3 pr-4 text-charcoal-light">{row.hips  || "—"}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })() : (
                    <p className="text-sm text-charcoal-light">No size data available.</p>
                  )}

                  {product.sizeGuide.notes && (
                    <p className="mt-5 text-xs text-charcoal-light leading-relaxed bg-lavender-bg/50 rounded-xl px-4 py-3 border border-lavender-soft/40">
                      💡 {product.sizeGuide.notes}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </>
  );
}
