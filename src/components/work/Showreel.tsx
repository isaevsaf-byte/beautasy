"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ShownShowreel } from "@/lib/workMedia";

/**
 * The short film at the top of /work, in a phone's frame: hands at the cutting
 * table, on a loop, without sound. Anyone who asked their phone for less motion
 * or to save data gets its cover picture instead — a film that plays itself is
 * exactly what those settings are for.
 */

function subscribe(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function stillOnly(): boolean {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches || Boolean(saveData);
}

export default function Showreel({ showreel, label }: { showreel: ShownShowreel; label: string }) {
  const still = useSyncExternalStore(subscribe, stillOnly, () => false);
  const ref = useRef<HTMLVideoElement>(null);

  // Plays while it can be seen and rests while it can't. Phones pause a muted
  // film that scrolls away and don't all start it again when it comes back —
  // Android Chrome left it frozen — so the page does both itself.
  useEffect(() => {
    const video = ref.current;
    if (!video || still) return;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.25 }
    );
    watcher.observe(video);
    return () => watcher.disconnect();
  }, [still]);

  return (
    <div className="relative mx-auto w-[230px] sm:w-[260px] lg:w-[290px]">
      <div className="pointer-events-none absolute -inset-10 rounded-full bg-lavender/40 blur-3xl" aria-hidden="true" />
      <div className="relative aspect-[9/16] overflow-hidden rounded-[2.4rem] border-[9px] border-charcoal bg-charcoal shadow-2xl shadow-charcoal/25">
        {still && showreel.poster ? (
          <img src={showreel.poster} alt={label} className="h-full w-full object-cover" />
        ) : (
          <video
            ref={ref}
            src={showreel.src}
            poster={showreel.poster ?? undefined}
            autoPlay={!still}
            muted
            loop
            playsInline
            preload={still ? "none" : "auto"}
            aria-label={label}
            className="h-full w-full object-cover"
          />
        )}
        <span className="absolute top-2 left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-charcoal/80" aria-hidden="true" />
      </div>
    </div>
  );
}
