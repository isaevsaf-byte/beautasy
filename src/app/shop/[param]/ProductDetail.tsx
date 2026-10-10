"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence, animate, useMotionValue, useReducedMotion } from "framer-motion";
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
  Lightbulb,
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
import { EASE_OUT, fadeUp, stagger } from "@/components/animations";
import { formatPence } from "@/lib/money";
import { useDialog, useScrollLock } from "@/lib/useDialog";
import { startingPrice, type SizePrice } from "../startingPrice";

/* eslint-disable @next/next/no-img-element */

/* ─── Types ─── */
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
      <p className="flex items-center gap-2 text-xs text-green-700 font-medium mt-2">
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
        autoComplete="email"
        enterKeyHint="send"
        className="flex-1 min-w-0 text-xs px-3 py-2 rounded-field border border-lavender-soft/50 bg-white focus:outline-none focus:border-lavender-ink focus:ring-2 focus:ring-lavender-ink/25"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-lavender/20 hover:bg-lavender/30 text-charcoal rounded-field text-xs font-medium transition-colors disabled:opacity-60"
      >
        {status === "loading" ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
        Notify Me
      </button>
      {status === "error" && (
        <span className="text-[10px] text-rose-700">Try again</span>
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

/* ─── Chalk under a choice still to make ─── */
/**
 * The booking form's tailor's chalk (components/AtelierBookingForm.tsx, .chalk
 * in globals.css), drawn under "Size" or "Colour" when Add to Bag finds it
 * empty, with "choose one first" at the end of the stroke. Its parent must be
 * positioned. Each press draws a fresh stroke (the key); a choice brushes it
 * off. `late` holds the stroke back while the page is still scrolling up to
 * it from the sticky bar, so it is drawn where the visitor can see it.
 */
function Chalk({ mark, late, className }: { mark: number; late: boolean; className?: string }) {
  return (
    <AnimatePresence>
      {mark > 0 && (
        <motion.span
          key={mark}
          className={className ? `chalk ${className}` : "chalk"}
          aria-hidden="true"
          exit={{ opacity: 0, filter: "blur(1px)" }}
          transition={{ duration: 0.25 }}
        >
          <span className="chalk-mark" style={late ? { animationDelay: "0.3s" } : undefined} />
          <span
            className="chalk-note font-serif italic normal-case tracking-normal text-sm text-lavender-ink"
            style={late ? { animationDelay: "0.6s" } : undefined}
          >
            choose one<span className="chalk-note-tail"> first</span>
          </span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/* ─── The main photo, which follows a finger ─── */

/** Which way the gallery last turned by a swipe: 1 to the next photo, -1 back, 0 not by a swipe */
type Turn = -1 | 0 | 1;

/** A swipe turns the photo past a fifth of its width, or on a flick (px/s) */
const COMMIT_SHARE = 0.2;
const COMMIT_VELOCITY = 400;

/** A swipe let go too early settles back with a small give, like cloth */
const SETTLE_BACK = { type: "spring", duration: 0.4, bounce: 0.15 } as const;

const turnVariants = {
  // Turned by a swipe the new photo comes in from a little way off (30%),
  // not from the edge: the old one is already on its way out under the
  // finger. Turned by an arrow or a thumbnail it is simply there.
  enter: (turn: Turn) => ({ x: turn === 0 ? "0%" : turn > 0 ? "30%" : "-30%" }),
  center: { x: "0%" },
  exit: (turn: Turn) =>
    turn === 0
      ? { x: "0%", transition: { duration: 0 } }
      : { x: turn > 0 ? "-100%" : "100%" },
};

/**
 * One photo in the gallery. It moves with the finger (held back, so it reads
 * as a pull rather than a slide) and, let go past a fifth of its width or on
 * a flick, hands over to the next one; otherwise it settles back. Each photo
 * owns its x, so the one leaving and the one arriving never share a position.
 * Transform only, never opacity: the first of these is the page's largest
 * paint and must not fade (AnimatePresence initial={false} in the caller).
 */
function GallerySlide({
  src,
  alt,
  turn,
  draggable,
  reduceMotion,
  onTurn,
  onLoad,
}: {
  src: string;
  alt: string;
  turn: Turn;
  draggable: boolean;
  reduceMotion: boolean;
  onTurn: (turn: 1 | -1) => void;
  onLoad: () => void;
}) {
  const x = useMotionValue(0);
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <motion.div
      ref={ref}
      custom={turn}
      variants={turnVariants}
      initial="enter"
      animate="center"
      exit="exit"
      // Reduced motion: the photo still follows the finger, which is the
      // finger's own movement, but the turn itself is a cut
      transition={turn === 0 || reduceMotion ? { duration: 0 } : { duration: 0.22, ease: EASE_OUT }}
      style={{ x }}
      // framer sets touch-action: pan-y for a sideways drag, so the page
      // still scrolls under a vertical stroke
      drag={draggable ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      // 1: the photo moves exactly with the finger. With both constraints at
      // 0 every pixel of a drag is "past the edge", so 0.2 let it travel a
      // fifth of the way and it felt like pulling against a rope. The gallery
      // wraps round, so there is always a next photo to pull towards.
      dragElastic={1}
      dragMomentum={false}
      onDragEnd={(_, info) => {
        const width = ref.current?.offsetWidth ?? 1;
        const { offset, velocity } = info;
        const flicked = Math.abs(velocity.x) > COMMIT_VELOCITY && Math.sign(velocity.x) === Math.sign(offset.x);
        if (offset.x !== 0 && (Math.abs(offset.x) > width * COMMIT_SHARE || flicked)) {
          onTurn(offset.x < 0 ? 1 : -1);
        } else {
          animate(x, 0, reduceMotion ? { duration: 0 } : SETTLE_BACK);
        }
      }}
      className="absolute inset-0 touch-pan-y"
    >
      {/* The LCP element on a product page: sized per device and fetched
          with priority so it is not queued behind scripts. */}
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 50vw"
        className="object-cover pointer-events-none"
        draggable={false}
        preload
        fetchPriority="high"
        onLoad={onLoad}
      />
    </motion.div>
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
  // Add to Bag pressed with no size (or colour) chosen: a stroke of tailor's
  // chalk under "Size", as in the booking form (.chalk in globals.css), one
  // more for each press, brushed off when one is picked. It used to be red
  // words that rubbed themselves out after 2.5 seconds — often before a
  // visitor sent up from the sticky bar had even scrolled to them.
  const [sizeChalk, setSizeChalk] = useState(0);
  const [colorChalk, setColorChalk] = useState(0);
  // Sent up from far below, the stroke waits for the page to arrive
  const [chalkLate, setChalkLate] = useState(false);
  const addItem = useCart((state) => state.addItem);
  const openCart = useCartUI((state) => state.openCart);
  // Lets the sticky mobile bar send the customer back up to the size/colour picker
  const optionsRef = useRef<HTMLDivElement | null>(null);
  // …and to the measurement fields, when one of those is what's missing
  const measurementsRef = useRef<HTMLDivElement | null>(null);
  // The photo a swipe turned to, and which way. Only that photo slides in:
  // one reached by an arrow, a thumbnail or a colour is simply there.
  const [swipe, setSwipe] = useState<{ to: string; turn: 1 | -1 } | null>(null);
  const reduceMotion = useReducedMotion() ?? false;
  // The photos either side are fetched once the first has arrived, so a
  // swipe never turns to an empty frame and nothing competes with the first
  const [firstPhotoIn, setFirstPhotoIn] = useState(false);
  // The size guide is a real dialog: Escape closes it, Tab stays inside,
  // focus goes back to "Size Guide", and the page behind it holds still
  const closeSizeGuide = useCallback(() => setSizeGuideOpen(false), []);
  const sizeGuideRef = useDialog<HTMLDivElement>(sizeGuideOpen, closeSizeGuide);
  useScrollLock(sizeGuideOpen);

  const hasSizes = product.availableSizes && product.availableSizes.length > 0;
  // "Find my size" (the quiz, which needs the guide's rows) and "Size Guide"
  // both sit beside "Size"
  const bothSizeHelpers = !!product.sizeGuide?.rows && product.sizeGuide.rows.length > 0;
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
  // Until a size is chosen, a piece whose sizes cost different amounts is
  // priced "from" its cheapest size, as on its card in the shop
  const start = startingPrice(product);
  const fromPrice = selectedSize == null && start.varies;
  const shownPrice = fromPrice ? start.pence : currentPrice;

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

  // Which photo is showing, as the gallery tells them apart: by place, so a
  // photo used twice still turns; a colour's own photo is its own
  const photoKey = activeColorVariant ? `colour:${activeImage}` : `${activeImageIndex}:${activeImage}`;
  const turn: Turn = swipe?.to === photoKey ? swipe.turn : 0;
  const swipeTo = (direction: 1 | -1) => {
    const next = (activeImageIndex + direction + images.length) % images.length;
    setSwipe({ to: `${next}:${images[next]}`, turn: direction });
    setActiveImageIndex(next);
  };
  const neighbours =
    images.length > 1 && !activeColorVariant
      ? [...new Set([
          images[(activeImageIndex + 1) % images.length],
          images[(activeImageIndex - 1 + images.length) % images.length],
        ])].filter((src) => src !== activeImage)
      : [];

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
      const top = optionsRef.current?.getBoundingClientRect().top;
      setChalkLate(top !== undefined && (top < 0 || top > window.innerHeight - 120));
      optionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (blockers.size) setSizeChalk((n) => n + 1);
      if (blockers.colour) setColorChalk((n) => n + 1);
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
          {/* On one line however long the name: the links keep their words
              and the name gives way, ending in "…" with the whole of it on hover */}
          <nav className="flex items-center gap-2 text-sm text-charcoal-light">
            <Link
              href="/shop"
              className="shrink-0 whitespace-nowrap hover:text-charcoal transition-colors"
            >
              Shop
            </Link>
            <span aria-hidden="true">/</span>
            <Link
              href={`/shop/${categorySlug}`}
              className="shrink-0 whitespace-nowrap hover:text-charcoal transition-colors"
            >
              {product.category}
            </Link>
            <span aria-hidden="true">/</span>
            <span className="min-w-0 truncate text-charcoal" title={product.name}>
              {product.name}
            </span>
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
              <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-white/60 mb-4 select-none [-webkit-touch-callout:none]">
                {/* Swipe through the gallery on touch devices; the arrows are
                    fiddly on a phone and everyone expects a swipe here. The
                    photo now follows the finger and turns past a fifth of its
                    width (GallerySlide). Only a sideways stroke moves it: a
                    scroll down the page stays a scroll. initial={false}: the
                    first photo is painted as it is, never slid in. */}
                <AnimatePresence initial={false} custom={turn}>
                  <GallerySlide
                    key={photoKey}
                    src={activeImage}
                    alt={product.name}
                    turn={turn}
                    draggable={images.length > 1 && !activeColorVariant}
                    reduceMotion={reduceMotion}
                    onTurn={swipeTo}
                    onLoad={() => setFirstPhotoIn(true)}
                  />
                </AnimatePresence>
                {/* The photos either side, fetched at the size the gallery
                    will ask for, once the first is in, and never shown */}
                {firstPhotoIn &&
                  neighbours.map((src) => (
                    <Image
                      key={`next-${src}`}
                      src={src}
                      alt=""
                      aria-hidden="true"
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      loading="eager"
                      fetchPriority="low"
                      className="invisible"
                    />
                  ))}
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
                // p-1: room inside the scrolling strip for the chosen one's ring
                <div className="flex gap-2 overflow-x-auto snap-x snap-proximity overscroll-x-contain p-1 -m-1">
                  {images.map((image, i) => (
                    <button
                      key={`thumb-${i}`}
                      type="button"
                      onClick={() => setActiveImageIndex(i)}
                      aria-current={i === activeImageIndex ? "true" : undefined}
                      className={`relative w-16 h-16 shrink-0 snap-start rounded-lg overflow-hidden border-2 transition-[border-color,box-shadow] duration-200 ${
                        i === activeImageIndex
                          ? "border-transparent ring-2 ring-lavender-ink ring-offset-2 ring-offset-cream"
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
                <span className="px-3 py-1 bg-lavender-bg rounded-full text-xs tracking-eyebrow uppercase text-charcoal-light">
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
              <p className="font-serif text-2xl text-charcoal mb-6 tabular-nums">
                {fromPrice && "from "}
                {formatPence(shownPrice)}
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
                  <div className="flex items-center justify-between gap-x-3 mb-3">
                    {/* flex-1, so the chalk runs from "Size" to the links and
                        its note sits at the end of the stroke, by the links */}
                    <p className="relative flex-1 text-sm tracking-eyebrow uppercase font-medium text-charcoal">
                      Size
                      {selectedSize && (
                        <span className="ml-2 font-normal text-charcoal-light normal-case tracking-normal">
                          — {selectedSize}
                        </span>
                      )}
                      <Chalk
                        mark={sizeChalk}
                        late={chalkLate}
                        className={bothSizeHelpers ? "max-sm:hidden" : undefined}
                      />
                    </p>
                    {/* Wraps under itself rather than squeezing "Size" on a 320px phone */}
                    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                      {product.sizeGuide?.rows && product.sizeGuide.rows.length > 0 && (
                        <SizeQuiz
                          rows={product.sizeGuide.rows}
                          availableSizes={product.availableSizes}
                          onPick={(size) => {
                            setSelectedSize(size);
                            setSizeChalk(0);
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
                    </div>
                  </div>
                  {/* With "Find my size" and "Size Guide" both beside it, "Size"
                      is left about 130px on a 320–375px phone, and the chalk's
                      container query rightly drops its words there. On those
                      phones the chalk takes a line of its own under the row,
                      the full width, so "choose one first" is still written;
                      from sm up it stays beside "Size". text-sm, as the label:
                      the note's widths are measured in its em. */}
                  {bothSizeHelpers && (
                    <AnimatePresence>
                      {sizeChalk > 0 && (
                        <motion.div
                          key="chalk-line"
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="sm:hidden relative h-5 -mt-1 mb-3 text-sm"
                        >
                          <Chalk mark={sizeChalk} late={chalkLate} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                  {/* The chalk's words, for a screen reader; a new press says them again */}
                  {sizeChalk > 0 && (
                    <span key={sizeChalk} role="alert" className="sr-only">
                      Please select a size
                    </span>
                  )}
                  {/* The chosen size is filled and ringed, not grown: grown, it
                      nudged its neighbours and blurred its own letters */}
                  <div className="flex flex-wrap gap-2">
                    {product.availableSizes.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => {
                          setSelectedSize(size);
                          setSizeChalk(0);
                        }}
                        className={`min-w-[52px] min-h-11 px-3 py-2 rounded-chip border text-sm font-medium transition-[background-color,border-color,box-shadow] duration-200 ${
                          selectedSize === size
                            ? "bg-lavender border-lavender text-charcoal ring-2 ring-lavender-ink ring-offset-2 ring-offset-cream"
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
                  <div className="flex items-center mb-3">
                    <p className="relative flex-1 text-sm tracking-eyebrow uppercase font-medium text-charcoal">
                      Colour
                      {selectedColor && (
                        <span className="ml-2 font-normal text-charcoal-light normal-case tracking-normal">
                          — {selectedColor}
                        </span>
                      )}
                      <Chalk mark={colorChalk} late={chalkLate} />
                    </p>
                  </div>
                  {colorChalk > 0 && (
                    <span key={colorChalk} role="alert" className="sr-only">
                      Please select a colour
                    </span>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {product.availableColors.map((color) => {
                      const active = selectedColor === color.name;
                      return (
                        <button
                          key={color.name}
                          type="button"
                          onClick={() => {
                            setSelectedColor(color.name);
                            setColorChalk(0);
                          }}
                          className={`flex items-center gap-2 min-h-11 px-3 py-2 rounded-chip border text-sm font-medium transition-[background-color,border-color,box-shadow] duration-200 ${
                            active
                              ? "bg-lavender border-lavender text-charcoal ring-2 ring-lavender-ink ring-offset-2 ring-offset-cream"
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
                    <span className="text-sm font-medium text-charcoal tabular-nums">
                      +{formatPence(mtmPrice)}
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
                                <span className="block text-[11px] tracking-caps-sm uppercase text-charcoal-light mb-1">
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
                                  className="w-full text-sm px-3 py-2 rounded-field border border-lavender-soft/40 bg-cream-soft/50 text-charcoal placeholder:text-charcoal/30 focus:outline-none focus:border-lavender-ink focus:ring-2 focus:ring-lavender-ink/25"
                                />
                              </label>
                            ))}
                          </div>
                          <label className="block">
                            <span className="block text-[11px] tracking-caps-sm uppercase text-charcoal-light mb-1">
                              Anything else we should know?
                            </span>
                            <textarea
                              rows={2}
                              value={measurements.notes}
                              onChange={(e) =>
                                setMeasurements((m) => ({ ...m, notes: e.target.value.slice(0, 200) }))
                              }
                              placeholder="Longer straps, a little more room at the back…"
                              className="w-full text-sm px-3 py-2 rounded-field border border-lavender-soft/40 bg-cream-soft/50 text-charcoal placeholder:text-charcoal/30 resize-none focus:outline-none focus:border-lavender-ink focus:ring-2 focus:ring-lavender-ink/25"
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
                    <span className="text-sm font-medium text-charcoal tabular-nums">
                      +{formatPence(product.giftBoxPrice)}
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
                            className="block text-xs tracking-eyebrow uppercase font-medium text-charcoal mb-2"
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
                            className="w-full text-sm text-charcoal bg-cream-soft/50 rounded-field border border-lavender-soft/40 px-3 py-2 focus:outline-none focus:border-lavender-ink focus:ring-2 focus:ring-lavender-ink/25 resize-none"
                          />
                          <p className="text-[11px] text-charcoal-light mt-1.5 text-right tabular-nums">
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
                    what is still missing. handleAddToCart refuses the add. So
                    it keeps the pointer and readable words — paler, not
                    greyed out as if nothing would happen. */}
                <button
                  type="button"
                  onClick={handleAddToCart}
                  aria-disabled={isBlocked(blockers)}
                  className={`press flex-1 group inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full text-sm tracking-wider uppercase font-medium ${
                    isBlocked(blockers)
                      ? "bg-lavender/50 text-charcoal"
                      : "bg-lavender text-charcoal hover:bg-lavender-hover hover:shadow-lg hover:shadow-lavender/30"
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
                  <p className="flex items-center gap-1.5 text-xs tracking-eyebrow uppercase font-medium text-charcoal">
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
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ease-out"
                        />
                        <div className="absolute inset-0 bg-lavender/0 group-hover:bg-lavender/10 transition-colors duration-300" />
                      </div>
                      <h4 className="font-serif text-sm mb-1 group-hover:text-charcoal/70 transition-colors line-clamp-2">
                        {rp.name}
                      </h4>
                      <p className="text-xs text-charcoal-light">
                        {formatPence(rp.price)}
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
      {/* The name takes the room and gives way ("…"); the button keeps its
          words on one line. With the button as flex-1, a long name squeezed it
          down to its longest word. The bottom padding clears the iPhone's
          home bar now that the page runs edge to edge. On a touch screen
          the bar is a near-solid cream with no blur: a blur under a fixed bar
          is redrawn on every frame of every scroll, which costs a phone
          battery. */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FDFBF7]/95 backdrop-blur-md pointer-coarse:backdrop-blur-none pointer-coarse:bg-[#FDFBF7]/[0.97] border-t border-lavender-soft/40 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-charcoal-light truncate">{product.name}</p>
          <p className="font-serif text-lg leading-tight tabular-nums">
            {fromPrice && "from "}
            {formatPence(bagTotal - currentPrice + shownPrice)}
          </p>
          {measuring && (
            <p className="text-[11px] text-charcoal-light truncate">
              incl. +{formatPence(mtmPrice)} made to measure
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleAddToCart}
          aria-disabled={isBlocked(blockers)}
          className="press shrink-0 px-5 py-3 whitespace-nowrap rounded-full bg-lavender text-charcoal text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover"
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
            {/* Backdrop: a plain tint, a shade darker than it was blurred.
                A blur behind a fading layer is redrawn over the whole page
                on every frame of the fade. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSizeGuideOpen(false)}
              className="fixed inset-0 bg-black/45 z-[9998]"
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
              {/* dvh, not vh: on a phone 85vh counts the address bar's room
                  too, and the foot of the table went under it */}
              <div
                ref={sizeGuideRef}
                role="dialog"
                aria-modal="true"
                aria-label={product.sizeGuide.name}
                className="bg-[#FDFBF7] rounded-3xl shadow-2xl w-full max-w-lg max-h-[85dvh] pb-[env(safe-area-inset-bottom,0px)] flex flex-col overflow-hidden outline-none"
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
                {/* overscroll-contain: reaching the end of the table does not
                    start scrolling the page behind it */}
                <div className="overflow-auto overscroll-contain flex-1 px-6 py-5">
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
                            <th className="pb-3 pr-4 text-xs tracking-eyebrow uppercase text-charcoal-light font-medium">Size</th>
                            {hasUk    && <th className="pb-3 pr-4 text-xs tracking-eyebrow uppercase text-charcoal-light font-medium">UK</th>}
                            {hasEu    && <th className="pb-3 pr-4 text-xs tracking-eyebrow uppercase text-charcoal-light font-medium">EU</th>}
                            {hasBust  && <th className="pb-3 pr-4 text-xs tracking-eyebrow uppercase text-charcoal-light font-medium">Bust</th>}
                            {hasWaist && <th className="pb-3 pr-4 text-xs tracking-eyebrow uppercase text-charcoal-light font-medium">Waist</th>}
                            {hasHips  && <th className="pb-3 pr-4 text-xs tracking-eyebrow uppercase text-charcoal-light font-medium">Hips</th>}
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

                  {/* The tip's bulb is drawn in the brand's colour rather than
                      the emoji, which each phone's font draws its own way */}
                  {product.sizeGuide.notes && (
                    <p className="mt-5 flex items-start gap-2 text-xs text-charcoal-light leading-relaxed bg-lavender-bg/50 rounded-xl px-4 py-3 border border-lavender-soft/40">
                      <Lightbulb size={14} aria-hidden="true" className="text-lavender-ink shrink-0 mt-px" />
                      <span>{product.sizeGuide.notes}</span>
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
