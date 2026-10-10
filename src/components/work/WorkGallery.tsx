"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ShownPiece } from "@/lib/workMedia";
import { categoriesIn, type WorkCategory } from "@/lib/work";
import TileFace from "./TileFace";
import WorkViewer from "./WorkViewer";
import { columnsFor, tileRatio } from "./layout";

/**
 * The gallery on /work: filters, the tiles, and the viewer.
 *
 * Which piece is open lives in the address — /work#doorway-curtains — so a
 * piece can be sent to someone on WhatsApp and opens for them, and the phone's
 * back gesture closes the viewer instead of leaving the page.
 */

const HASH_EVENT = "beautasy:work-hash";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener(HASH_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(HASH_EVENT, onChange);
  };
}

function readHash(): string {
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return "";
  }
}

/** pushState and replaceState announce nothing, so the gallery is told directly */
function writeHash(anchor: string | null, push: boolean) {
  const url = anchor ? `#${encodeURIComponent(anchor)}` : `${window.location.pathname}${window.location.search}`;
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(HASH_EVENT));
}

/**
 * One `sizes` for both layouts: the two grids hold the same pictures, and the
 * same hint makes the browser pick the same file for both — one download each.
 */
const SIZES = "(min-width: 1024px) 31vw, 48vw";

export default function WorkGallery({ pieces }: { pieces: ShownPiece[] }) {
  const [filter, setFilter] = useState<WorkCategory | "all">("all");
  const [fromEnd, setFromEnd] = useState(false);
  // Opened from a tile, so the viewer fades in; moving piece to piece, it doesn't
  const [arriving, setArriving] = useState(false);
  const pushed = useRef(false);
  // The piece whose tile gets the keyboard back when the viewer closes
  const returnTo = useRef<string | null>(null);
  const hash = useSyncExternalStore(subscribe, readHash, () => "");

  const categories = useMemo(() => categoriesIn(pieces), [pieces]);
  const shown = useMemo(
    () => (filter === "all" ? pieces : pieces.filter((p) => p.category === filter)),
    [pieces, filter]
  );
  const layouts = useMemo(
    () => ({ two: columnsFor(shown, 2, tileRatio), three: columnsFor(shown, 3, tileRatio) }),
    [shown]
  );

  // A shared link may name a piece the chosen filter hides: then the viewer
  // browses everything
  const inShown = hash ? shown.findIndex((p) => p.anchor === hash) : -1;
  const browsing = inShown >= 0 ? shown : pieces;
  const openIndex = inShown >= 0 ? inShown : hash ? pieces.findIndex((p) => p.anchor === hash) : -1;

  const open = (anchor: string) => {
    pushed.current = true;
    setFromEnd(false);
    setArriving(true);
    writeHash(anchor, true);
  };

  // Focus goes back where the reader was — the tile of the piece they last
  // looked at, in whichever of the two layouts is on screen — however the
  // viewer closed: the button, Escape or the phone's back gesture
  const openAnchor = openIndex >= 0 ? browsing[openIndex].anchor : null;
  useEffect(() => {
    if (openAnchor) {
      returnTo.current = openAnchor;
      return;
    }
    if (!returnTo.current) return;
    const anchor = returnTo.current;
    returnTo.current = null;
    const tile = Array.from(document.querySelectorAll<HTMLElement>("[data-work-tile]")).find(
      (element) => element.dataset.workTile === anchor && element.offsetParent !== null
    );
    tile?.focus();
  }, [openAnchor]);

  const close = () => {
    // Opened from here: step back, so the back gesture and the close button
    // leave the same history. Opened from a shared link: just clear it.
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      writeHash(null, false);
    }
  };

  const move = (index: number, end: boolean) => {
    setFromEnd(end);
    // Before the address changes, so the next piece is never drawn still "arriving"
    setArriving(false);
    writeHash(browsing[index].anchor, false);
  };

  // Lazy throughout: the grid starts below the fold on every screen
  const tile = (piece: ShownPiece) => (
    <button
      key={piece.id}
      type="button"
      onClick={() => open(piece.anchor)}
      data-work-tile={piece.anchor}
      aria-label={`Open “${piece.title}”`}
      className="group block w-full rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender focus-visible:ring-offset-4 focus-visible:ring-offset-cream"
    >
      <TileFace piece={piece} sizes={SIZES} />
    </button>
  );

  return (
    <>
      {categories.length > 1 && (
        // One row that scrolls sideways on a phone, where six filters would stack four deep
        <div
          className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:mb-10 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Show only"
        >
          {[{ value: "all" as const, label: "All", count: pieces.length }, ...categories].map((c) => {
            const active = filter === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setFilter(c.value)}
                aria-pressed={active}
                className={`shrink-0 whitespace-nowrap rounded-chip border px-4 py-2 text-xs tracking-[0.16em] uppercase transition-colors ${
                  active
                    ? "border-charcoal bg-charcoal text-white"
                    : "border-charcoal/15 text-charcoal-light hover:border-lavender hover:text-charcoal"
                }`}
              >
                {c.label}
                <span className="ml-1.5 tabular-nums opacity-60">{c.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Two layouts, one shown at a time: worked out in advance, so neither jumps */}
      <div className="grid grid-cols-2 gap-x-3 sm:gap-x-5 lg:hidden">
        {layouts.two.map((column, c) => (
          <div key={c} className="flex flex-col gap-y-7">
            {column.map(tile)}
          </div>
        ))}
      </div>
      <div className="hidden grid-cols-3 gap-x-6 lg:grid">
        {layouts.three.map((column, c) => (
          <div key={c} className="flex flex-col gap-y-9">
            {column.map(tile)}
          </div>
        ))}
      </div>

      {openIndex >= 0 && (
        <WorkViewer
          key={browsing[openIndex].id}
          pieces={browsing}
          index={openIndex}
          startAtEnd={fromEnd}
          arriving={arriving}
          onMove={move}
          onClose={close}
        />
      )}
    </>
  );
}
