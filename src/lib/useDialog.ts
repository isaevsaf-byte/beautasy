import { useEffect, useRef, type RefObject } from "react";

/**
 * The page behind an open panel stays still — however many panels are open.
 *
 * Each overlay used to set body overflow to hidden and, on closing, back to
 * "" — so closing the search over the open phone menu unfroze the page under
 * the menu. One count instead: the page scrolls again only when the last
 * panel closes. The scrollbar's width is kept as padding while locked, so a
 * desktop page does not jump sideways when the bag opens.
 */
let locks = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    if (locks === 0) {
      saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
      const bar = window.innerWidth - document.documentElement.clientWidth;
      body.style.overflow = "hidden";
      if (bar > 0) body.style.paddingRight = `${bar}px`;
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0 && saved) {
        body.style.overflow = saved.overflow;
        body.style.paddingRight = saved.paddingRight;
        saved = null;
      }
    };
  }, [active]);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest("[inert]") && el.getClientRects().length > 0
  );
}

/**
 * What a modal panel owes a keyboard or switch user: focus moves in when it
 * opens, Tab stays inside it, Escape closes it, and focus goes back to the
 * button that opened it. The phone menu in Header did this from the start;
 * the bag, the search, the photo viewer and the size panels did not, and
 * after closing them focus was left at the top of an empty page.
 *
 * Put the returned ref on the panel. `initialFocus` names the element to
 * focus first (the search field, the close button); otherwise the first
 * control in the panel.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>
): RefObject<T | null> {
  const panelRef = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;

    // A frame later: the panel may still be mounting, or sliding in
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = initialFocus?.current ?? focusables(panel)[0] ?? panel;
      if (first === panel && !panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
      first.focus({ preventScroll: true });
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = focusables(panel);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const here = document.activeElement;
      if (e.shiftKey && (here === first || !panel.contains(here))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (here === last || !panel.contains(here))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      // Back to the button that opened it, if it is still on the page
      if (opener && opener.isConnected && typeof opener.focus === "function") {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open, initialFocus]);

  return panelRef;
}
