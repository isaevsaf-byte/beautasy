"use client";

import { useEffect, useState } from "react";
import type { Shelves } from "./shelves";

/** Where the header and footer keep this visit's site settings */
const CACHE = "beautasy-site-settings";

/**
 * The shop's shelves, for a page rendered in the browser: from this visit's
 * cached site settings, or read once from /api/site-settings — the same answer
 * the header and footer read and keep. Null until known; callers then show
 * their links as written (see `placeLink` in @/lib/shelves).
 */
export function useShelves(): Shelves | null {
  const [shelves, setShelves] = useState<Shelves | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Off the synchronous path, as the header does: a setState in the effect
    // body cascades an extra render
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const cached = JSON.parse(sessionStorage.getItem(CACHE) ?? "null");
        if (cached?.shelves !== undefined) {
          setShelves(cached.shelves);
          return;
        }
      } catch {
        /* sessionStorage unavailable */
      }
      fetch("/api/site-settings")
        .then((response) => response.json())
        .then((data) => {
          if (cancelled) return;
          setShelves(data?.shelves ?? null);
          try {
            sessionStorage.setItem(CACHE, JSON.stringify(data ?? {}));
          } catch {
            /* ok */
          }
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return shelves;
}
