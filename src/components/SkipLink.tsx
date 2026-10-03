"use client";

import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";

/**
 * "Skip to content": the first thing a keyboard reaches on every page, hidden
 * until it is focused. Without it, someone tabbing through the site went past
 * the whole menu — six links, search, wishlist, bag — on every page before
 * reaching what they came for.
 *
 * It points at #main, which works with no script at all on pages whose <main>
 * carries that id. Once the page is running it finds the <main> itself, so a
 * page that never got the id still works. The Studio has no use for it.
 */
export default function SkipLink() {
  const pathname = usePathname();
  if (pathname?.startsWith("/studio")) return null;

  function skip(event: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById("main") ?? document.querySelector("main");
    if (!target) return;
    event.preventDefault();
    // A <main> takes focus only when told it may; -1 keeps it out of the tab order
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus();
  }

  return (
    <a
      href="#main"
      onClick={skip}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[10000] focus:rounded-full focus:bg-charcoal focus:px-5 focus:py-3 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
    >
      Skip to content
    </a>
  );
}
