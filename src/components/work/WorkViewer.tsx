"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, MessageCircle, ShoppingBag, X } from "lucide-react";
import type { ShownPhoto, ShownPiece, ShownVideo } from "@/lib/workMedia";
import { ATELIER_CATEGORIES, shelfCta } from "@/lib/work";
import { placeLink } from "@/lib/shelves";
import { useShelves } from "@/lib/useShelves";
import { useIsClient } from "@/lib/useIsClient";
import { whatsappLink } from "@/lib/business";
import { sameFraming } from "./layout";

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

const WIDE = "(min-width: 640px)";

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function PairSlide({ before, after }: { before: ShownPhoto; after: ShownPhoto }) {
  // On a phone the two side by side would each be a sliver; one at a time, a
  // tap apart. Only the layout on screen is drawn: a hidden one would still
  // download its pictures.
  const wide = useSyncExternalStore(subscribeToWidth, () => window.matchMedia(WIDE).matches, () => true);
  const [showing, setShowing] = useState<"before" | "after">("before");

  if (wide) {
    return (
      <div className="grid grid-cols-2 gap-3 h-full w-full max-w-5xl">
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
                // dvh, the height actually showing: on a phone 100vh counts the
                // address bar too, and the bottom of the photo went under it
                className="max-h-[calc(100dvh-4rem)] lg:max-h-[calc(100dvh-6rem)] w-auto object-contain rounded-xl shadow-2xl"
              />
              <Label tone={tone}>{label}</Label>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center gap-3">
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
      {/* Both photos are drawn, one over the other, so the hidden one is
          already downloaded when the button is tapped (the extra file is only
          ever a pair's). A size container: the photo's box is worked out from
          the space left under the buttons, in cqw and cqh. */}
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]">
        {sameFraming(before, after) ? (
          <Shutter before={before} after={after} showAfter={showing === "after"} />
        ) : (
          <Crossfade before={before} after={after} showAfter={showing === "after"} />
        )}
      </div>
    </div>
  );
}

/**
 * The wipe's pace, shared by the photo and the chalk line so the line stays on
 * the edge all the way across. A transition, not keyframes: tapped back half
 * way, it turns round from where it is instead of starting again.
 */
const SHUTTER = "duration-[450ms] ease-in-out motion-reduce:duration-150";

type PairProps = { before: ShownPhoto; after: ShownPhoto; showAfter: boolean };

/**
 * A pair photographed the same way round: the "after" is drawn across the
 * "before" from the left, like a blind, with a line of tailor's chalk riding
 * its edge — the mark Kristina draws before she cuts. Holding the same
 * framing, the eye sees exactly what changed and nothing else.
 */
function Shutter({ before, after, showAfter }: PairProps) {
  return (
    <div
      className="relative overflow-hidden rounded-xl shadow-2xl"
      // The before photo's shape, as large as fits both ways. Within 3% the
      // after shares it; object-cover trims the sliver of difference.
      style={{
        aspectRatio: `${before.width} / ${before.height}`,
        width: `min(100cqw, 100cqh * ${before.width / before.height})`,
      }}
    >
      <img
        src={before.full}
        srcSet={before.srcSet}
        sizes={VIEWER_SIZES}
        alt={before.alt}
        aria-hidden={showAfter}
        width={before.width}
        height={before.height}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <img
        src={after.full}
        srcSet={after.srcSet}
        sizes={VIEWER_SIZES}
        alt={after.alt}
        aria-hidden={!showAfter}
        width={after.width}
        height={after.height}
        // Asked for less motion, the after simply fades in over the before
        className={`absolute inset-0 h-full w-full object-cover transition-[clip-path,opacity] ${SHUTTER} motion-reduce:[clip-path:none] ${
          showAfter ? "[clip-path:inset(0)]" : "[clip-path:inset(0_100%_0_0)] motion-reduce:opacity-0"
        }`}
      />
      {/* The chalk line: a strip one line wider than the photo slides across
          it, the line hanging just off its left edge. At rest the line is past
          one side of the photo or the other and the box's overflow hides it;
          only the wipe brings it into sight. Moved by transform alone. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 w-[calc(100%+2px)] transition-transform ${SHUTTER} motion-reduce:hidden`}
        style={{ transform: showAfter ? "translateX(100%)" : "translateX(0)" }}
      >
        <span className="absolute inset-y-0 -left-[2px] w-[2px] bg-lavender-on-dark shadow-[0_0_6px_rgba(220,208,255,0.6)]" />
      </div>
    </div>
  );
}

/**
 * A pair framed differently — a portrait and a landscape, say — can't be
 * wiped across itself without one photo poking out past the other, so the two
 * cross-fade, each at its own shape, softening for the moment they overlap.
 */
function Crossfade({ before, after, showAfter }: PairProps) {
  return (
    <>
      {(
        [
          [before, !showAfter],
          [after, showAfter],
        ] as const
      ).map(([photo, shown]) => (
        <img
          key={photo.key}
          src={photo.full}
          srcSet={photo.srcSet}
          sizes={VIEWER_SIZES}
          alt={photo.alt}
          aria-hidden={!shown}
          width={photo.width}
          height={photo.height}
          // Centred in the space by inset-0 and auto margins, as large as fits
          className={`absolute inset-0 m-auto h-auto max-h-[100cqh] w-auto max-w-[100cqw] rounded-xl object-contain shadow-2xl transition-[opacity,filter] duration-200 ease-out motion-reduce:duration-150 motion-reduce:filter-none ${
            shown ? "opacity-100" : "opacity-0 blur-[2px]"
          }`}
        />
      ))}
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

/** A thumbnail's picture: the smallest the browser can use for a 56px square */
function thumbOf(slide: Slide): { src: string; srcSet: string | undefined } | null {
  if (slide.kind === "pair") return { src: slide.after.src, srcSet: slide.after.srcSet };
  if (slide.kind === "photo") return { src: slide.src, srcSet: slide.srcSet };
  return slide.poster ? { src: slide.poster, srcSet: slide.posterSrcSet ?? undefined } : null;
}

export default function WorkViewer({
  pieces,
  index,
  startAtEnd,
  arriving,
  onMove,
  onClose,
}: {
  pieces: ShownPiece[];
  index: number;
  /** Open on the piece's last picture: arriving from the piece after it with "previous" */
  startAtEnd?: boolean;
  /**
   * Opened from a tile on the page, so the dark viewer fades in over the cream
   * rather than slamming down. Not when moving to the next piece: the viewer
   * is drawn afresh for each piece, and the fade would blink the whole screen.
   */
  arriving?: boolean;
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
      // The fade is switched on by data-arriving. @starting-style (Tailwind's
      // starting:) gives the first frame it is drawn in; from there it
      // transitions to fully shown. Browsers without it simply show the viewer
      // at once. Closing stays instant: it is the back button, and the page
      // underneath should be there the moment it's asked for.
      className="fixed inset-0 z-[9999] flex flex-col lg:flex-row bg-[#1f1b24] text-white data-arriving:transition-opacity data-arriving:duration-200 data-arriving:ease-out data-arriving:starting:opacity-0 motion-reduce:data-arriving:duration-[120ms]"
      data-arriving={arriving ? "" : undefined}
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

      {/* The pictures. svh, the height with the phone's address bar showing:
          vh is measured with it hidden, so the pictures took more than their
          share and pushed the story below the bottom of the screen */}
      <div
        className="relative flex h-[62svh] shrink-0 items-center justify-center px-4 pt-16 pb-4 sm:px-16 lg:h-full lg:flex-1 lg:py-10"
        onTouchStart={(e) => {
          // Not a swipe: two fingers (a pinch), a zoomed-in page, or a drag
          // along the video's own controls
          const zoomed = (window.visualViewport?.scale ?? 1) > 1.01;
          const onVideo = (e.target as HTMLElement).closest("video") !== null;
          touch.current =
            e.touches.length === 1 && !zoomed && !onVideo
              ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
              : null;
        }}
        onTouchMove={(e) => {
          if (e.touches.length > 1) touch.current = null;
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
        <div key={`${piece.id}-${current.key}`} className="flex h-full w-full items-center justify-center animate-[workFade_0.25s_ease-out] motion-reduce:animate-none">
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

      {/* The story. Its scroll stays its own: at the end of a long caption a
          phone used to carry on scrolling the page behind the viewer */}
      <aside className="flex-1 overflow-y-auto overscroll-contain border-t border-white/10 px-6 py-6 sm:px-8 lg:h-full lg:w-[400px] lg:flex-none lg:border-t-0 lg:border-l lg:py-16">
        {/* Not text-lavender: that is repainted dark for cream pages (globals.css) and is 3:1 here */}
        <p className="mb-2 text-[11px] tracking-[0.25em] uppercase text-lavender-on-dark">{piece.categoryLabel}</p>
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
                  className={`relative h-14 w-14 overflow-hidden rounded-lg border-2 transition-[border-color,opacity] ${
                    i === slide ? "border-lavender" : "border-white/15 opacity-70 hover:opacity-100"
                  }`}
                >
                  {thumb ? (
                    <img
                      src={thumb.src}
                      srcSet={thumb.srcSet}
                      sizes="56px"
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
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
              {/* No onClose on these links: closing steps history back, and that
                  cancels the page they were opening. Leaving /work closes the
                  viewer anyway, and Back from there reopens the piece. */}
              <Link
                href="/atelier#book"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-lavender px-6 py-3 text-sm font-medium tracking-wider text-charcoal uppercase transition-colors hover:bg-lavender-hover"
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
              className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium tracking-wider uppercase transition-colors ${
                atelier
                  ? "border border-white/25 hover:border-lavender hover:bg-white/5"
                  : "bg-lavender text-charcoal hover:bg-lavender-hover"
              }`}
            >
              <ShoppingBag size={15} aria-hidden="true" />
              {shopCta}
            </Link>
          )}
          {piece.service && (
            <Link
              href={`/alterations/${piece.service.slug}`}
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
