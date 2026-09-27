"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import type { ShownShowreel } from "@/lib/workMedia";

/**
 * The short film at the top of /work, in a phone's frame: hands at the cutting
 * table, on a loop, without sound.
 *
 * The page arrives with the film stopped and not yet downloading. It starts
 * once the browser has said it may — never for anyone who asked their phone
 * for less motion or to save data: they see its cover and a play button. The
 * pause button is always there, because anything that moves on its own for
 * longer than five seconds has to be stoppable (WCAG 2.2.2).
 */

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function stillOnly(): boolean {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  return window.matchMedia(REDUCED).matches || Boolean(saveData);
}

export default function Showreel({ showreel, label }: { showreel: ShownShowreel; label: string }) {
  // Until the browser answers, stillness: the page as the server sends it must
  // not start a film nobody may have wanted
  const still = useSyncExternalStore(subscribe, stillOnly, () => true);
  const ref = useRef<HTMLVideoElement>(null);
  // null while the visitor hasn't pressed the button: then the page decides
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const wanted = chosen ?? !still;

  // Plays while it can be seen and rests while it can't — scrolled away, or in
  // a tab in the background. Browsers pause a muted film in both cases and
  // don't all start it again on the way back (Android Chrome left it frozen),
  // so the page does both itself.
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (!wanted) {
      video.pause();
      return;
    }
    video.preload = "auto";
    let inView = false;
    const update = () => {
      if (inView && document.visibilityState === "visible") video.play().catch(() => {});
      else video.pause();
    };
    const watcher = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        update();
      },
      { threshold: 0.25 }
    );
    watcher.observe(video);
    document.addEventListener("visibilitychange", update);
    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [wanted]);

  // The button acts at once — the visitor's press is the permission a browser
  // wants — and its choice then holds while the film scrolls in and out
  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) {
      setChosen(true);
      video.play().catch(() => {});
    } else {
      setChosen(false);
      video.pause();
    }
  };

  return (
    <div className="relative mx-auto w-[230px] sm:w-[260px] lg:w-[290px]">
      <div className="pointer-events-none absolute -inset-10 rounded-full bg-lavender/40 blur-3xl" aria-hidden="true" />
      <div className="relative aspect-[9/16] overflow-hidden rounded-[2.4rem] border-[9px] border-charcoal bg-charcoal shadow-2xl shadow-charcoal/25">
        <video
          ref={ref}
          src={showreel.src}
          poster={showreel.poster ?? undefined}
          muted
          loop
          playsInline
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          aria-label={label}
          className="h-full w-full object-cover"
        />
        <span className="absolute top-2 left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-charcoal/80" aria-hidden="true" />
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause the film" : "Play the film"}
          className="absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender"
        >
          {playing ? (
            <Pause size={14} className="fill-current" aria-hidden="true" />
          ) : (
            <Play size={14} className="fill-current" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
