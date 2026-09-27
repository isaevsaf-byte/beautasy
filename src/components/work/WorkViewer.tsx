"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, MessageCircle, ShoppingBag, X } from "lucide-react";
import type { ShownPhoto, ShownPiece, ShownVideo } from "@/lib/workMedia";
import { ATELIER_CATEGORIES, shelfCta } from "@/lib/work";
import { placeLink } from "@/lib/shelves";
import { useShelves } from "@/lib/useShelves";
import { useIsClient } from "@/lib/useIsClient";
import { whatsappLink } from "@/lib/business";

/**
 * One piece at full size: its pictures and videos one after another, the story
 * beside them, and the way to book the same job or buy the same thing.
 *
 * "Next" runs through the piece's own pictures and then on into the next
 * piece, so the whole gallery can be read with one arrow, one key or one swipe.
 */

type Slide =
  | { kind: "pair"; key: string; before: ShownPhoto; after: ShownPhoto }
  | ShownPhoto
  | ShownVideo;

export function slidesOf(piece: ShownPiece): Slide[] {
  const [first, ...rest] = piece.media;
  if (piece.before && first?.kind === "photo") {
    return [{ kind: "pair", key: `${first.key}-pair`, before: piece.before, after: first }, ...rest];
  }
  return piece.media;
}

const VIEWER_SIZES = "(min-width: 1024px) calc(100vw - 400px), 100vw";

function Label({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span className={`absolute top-3 left-3 rounded-full px-3 py-1 text-[11px] font-medium tracking-[0.18em] uppercase ${tone}`}>
      {children}
    </span>
  );
}

function PhotoSlide({ photo }: { photo: ShownPhoto }) {
  return (
    <img
      src={photo.full}
      srcSet={photo.srcSet}
      sizes={VIEWER_SIZES}
      alt={photo.alt}
      width={photo.width}
      height={photo.height}
      className="max-h-full max-w-full w-auto h-auto object-contain rounded-xl shadow-2xl"
    />
  );
}

function PairSlide({ before, after }: { before: ShownPhoto; after: ShownPhoto }) {
  // On a phone the two side by side would each be a sliver; one at a time, a tap apart
  const [showing, setShowing] = useState<"before" | "after">("before");
  return (
    <>
      <div className="hidden sm:grid grid-cols-2 gap-3 h-full w-full max-w-5xl">
        {(
          [
            ["Before", before, "bg-white/90 text-charcoal"],
            ["After", after, "bg-lavender text-charcoal"],
          ] as const
        ).map(([label, photo, tone]) => (
          <div key={label} className="relative flex min-h-0 items-center justify-center">
            <div className="relative max-h-full">
              <img
                src={photo.full}
                srcSet={photo.srcSet}
                sizes="(min-width: 1024px) calc(50vw - 200px), 50vw"
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                className="max-h-[calc(100vh-4rem)] lg:max-h-[calc(100vh-6rem)] w-auto object-contain rounded-xl shadow-2xl"
              />
              <Label tone={tone}>{label}</Label>
            </div>
          </div>
        ))}
      </div>
      <div className="sm:hidden flex h-full w-full flex-col items-center gap-3">
        <div className="inline-flex rounded-full bg-white/10 p-1" role="group" aria-label="Before or after">
          {(["before", "after"] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowing(side);
              }}
              aria-pressed={showing === side}
              className={`rounded-full px-4 py-1.5 text-xs tracking-[0.16em] uppercase transition-colors ${
                showing === side ? "bg-lavender text-charcoal" : "text-white/75"
              }`}
            >
              {side}
            </button>
          ))}
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <PhotoSlide photo={showing === "before" ? before : after} />
        </div>
      </div>
    </>
  );
}

function VideoSlide({ video }: { video: ShownVideo }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // With sound where the browser allows it — the click that opened this
    // counts — and silently where it doesn't (iPhone), rather than not at all
    element.muted = false;
    element.play().catch(() => {
      element.muted = true;
      element.play().catch(() => {});
    });
  }, []);
  return (
    <video
      ref={ref}
      src={video.src}
      poster={video.poster ?? undefined}
      controls
      playsInline
      preload="metadata"
      aria-label={video.alt}
      width={video.width}
      height={video.height}
      className="max-h-full max-w-full w-auto h-auto rounded-xl bg-black shadow-2xl"
    />
  );
}

function thumbOf(slide: Slide): string | null {
  if (slide.kind === "pair") return slide.after.src;
  if (slide.kind === "photo") return slide.src;
  return slide.poster;
}

export default function WorkViewer({
  pieces,
  index,
  startAtEnd,
  onMove,
  onClose,
}: {
  pieces: ShownPiece[];
  index: number;
  /** Open on the piece's last picture: arriving from the piece after it with "previous" */
  startAtEnd?: boolean;
  onMove: (index: number, fromEnd: boolean) => void;
  onClose: () => void;
}) {
  const isClient = useIsClient();
  const shelves = useShelves();
  const piece = pieces[index];
  const slides = slidesOf(piece);
  const [slide, setSlide] = useState(startAtEnd ? slides.length - 1 : 0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const next = useCallback(() => {
    if (slide < slides.length - 1) setSlide(slide + 1);
    else onMove((index + 1) % pieces.length, false);
  }, [slide, slides.length, index, pieces.length, onMove]);

  const previous = useCallback(() => {
    if (slide > 0) setSlide(slide - 1);
    else onMove((index - 1 + pieces.length) % pieces.length, true);
  }, [slide, index, pieces.length, onMove]);

  useEffect(() => {
    closeRef.current?.focus();
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = scroll;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") previous();
      else if (e.key === "Tab" && dialogRef.current) {
        // Keep the keyboard inside the viewer while it is open
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, previous, onClose]);

  if (!isClient) return null;

  const current = slides[Math.min(slide, slides.length - 1)];
  const atelier = ATELIER_CATEGORIES.includes(piece.category);
  const shop = piece.shelf ? placeLink(piece.shelf, shelves) : null;
  const shopCta = piece.shelf ? shelfCta(piece.shelf) : null;
  const multi = slides.length > 1 || pieces.length > 1;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="work-viewer-title"
      className="fixed inset-0 z-[9999] flex flex-col lg:flex-row bg-[#1f1b24] text-white"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
      >
        <X size={22} />
      </button>

      {/* The pictures */}
      <div
        className="relative flex h-[62vh] shrink-0 items-center justify-center px-4 pt-16 pb-4 sm:px-16 lg:h-full lg:flex-1 lg:py-10"
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dy) < 60) (dx < 0 ? next : previous)();
        }}
      >
        <div key={`${piece.id}-${current.key}`} className="flex h-full w-full items-center justify-center animate-[workFade_0.25s_ease-out]">
          {current.kind === "pair" ? (
            <PairSlide before={current.before} after={current.after} />
          ) : current.kind === "video" ? (
            <VideoSlide video={current} />
          ) : (
            <PhotoSlide photo={current} />
          )}
        </div>

        {multi && (
          <>
            <button
              type="button"
              onClick={previous}
              aria-label="Previous"
              className="absolute left-2 sm:left-4 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/20 sm:flex"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next"
              className="absolute right-2 sm:right-4 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/20 sm:flex"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>

      {/* The story */}
      <aside className="flex-1 overflow-y-auto border-t border-white/10 px-6 py-6 sm:px-8 lg:h-full lg:w-[400px] lg:flex-none lg:border-t-0 lg:border-l lg:py-16">
        <p className="mb-2 text-[11px] tracking-[0.25em] uppercase text-lavender">{piece.categoryLabel}</p>
        <h2 id="work-viewer-title" className="mb-3 font-serif text-2xl leading-snug sm:text-3xl">
          {piece.title}
        </h2>
        {piece.caption && <p className="mb-6 text-[15px] leading-relaxed text-white/75">{piece.caption}</p>}

        {slides.length > 1 && (
          <div className="mb-7 flex flex-wrap gap-2">
            {slides.map((s, i) => {
              const thumb = thumbOf(s);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSlide(i)}
                  aria-label={`Show ${s.kind === "pair" ? "before and after" : s.kind === "video" ? "the video" : `picture ${i + 1}`}`}
                  aria-current={i === slide}
                  className={`relative h-14 w-14 overflow-hidden rounded-lg border-2 transition-all ${
                    i === slide ? "border-lavender" : "border-white/15 opacity-70 hover:opacity-100"
                  }`}
                >
                  {thumb ? (
                    <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 bg-white/10" />
                  )}
                  {s.kind === "video" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-[10px] tracking-wider uppercase">
                      Play
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {atelier && (
            <>
              <Link
                href="/atelier#book"
                onClick={onClose}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-lavender px-6 py-3 text-sm font-medium tracking-wider text-charcoal uppercase transition-colors hover:bg-[#CFC0F0]"
              >
                Book a fitting
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
              <a
                href={whatsappLink(`Hi Kristina, I saw “${piece.title}” on your site. Could you do something like it for me?`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-medium tracking-wider uppercase transition-colors hover:border-lavender hover:bg-white/5"
              >
                <MessageCircle size={15} aria-hidden="true" />
                Ask on WhatsApp
              </a>
            </>
          )}
          {shop && shopCta && (
            <Link
              href={shop}
              onClick={onClose}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium tracking-wider uppercase transition-colors ${
                atelier
                  ? "border border-white/25 hover:border-lavender hover:bg-white/5"
                  : "bg-lavender text-charcoal hover:bg-[#CFC0F0]"
              }`}
            >
              <ShoppingBag size={15} aria-hidden="true" />
              {shopCta}
            </Link>
          )}
          {piece.service && (
            <Link
              href={`/alterations/${piece.service.slug}`}
              onClick={onClose}
              className="mt-1 inline-flex items-center gap-1.5 text-sm text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              {piece.service.title}: prices and how it works
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>

        {pieces.length > 1 && (
          <p className="mt-8 text-xs tracking-[0.2em] uppercase text-white/40 tabular-nums">
            {index + 1} of {pieces.length}
          </p>
        )}
      </aside>
    </div>,
    document.body
  );
}
