import type { CSSProperties, ReactNode } from "react";
import { TACKED_STITCHES, TIED_STITCHES } from "@/lib/stitchGeometry";

/**
 * A confirmation's heading with the work's last seam under it.
 *
 * Tied off, for a booking that holds its time: seven gold stitches run under
 * the words, the thread is knotted at their end and a pair of small snips
 * cuts it, leaving a short end. No needle — the work is done. Tacked, for a
 * request Kristina still answers by hand: long, loose lavender stitches and
 * no knot, as a seam is tacked before it is sewn.
 *
 * The words are sent as they were; the seam is decoration, hidden from screen
 * readers. The movement is CSS (.tied-off in app/globals.css) and starts as
 * the confirmation appears; what is drawn by default is the finished seam, so
 * nothing moves for a visitor who asked for less motion. No hooks, so it works
 * in a client or a server component.
 */
export default function TiedOff({ children, tacked = false }: { children: ReactNode; tacked?: boolean }) {
  const stitches = tacked ? TACKED_STITCHES : TIED_STITCHES;
  return (
    <span className={tacked ? "tied-off tied-off-tacked" : "tied-off"}>
      {children}
      <span className="tied-off-art" aria-hidden="true">
        <svg className="tied-off-seam" viewBox="0 0 1000 20" preserveAspectRatio="none" focusable="false">
          {stitches.map((s, i) => (
            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} style={{ "--i": i } as CSSProperties} />
          ))}
        </svg>
        {!tacked && (
          <>
            <span className="tied-off-knot" />
            <span className="tied-off-end" />
            <svg className="tied-off-snips" viewBox="0 0 20 20" focusable="false">
              <path className="tied-off-blade tied-off-blade-a" d="M0 14L14 2M14 2a3 3 0 1 1 4-1" />
              <path className="tied-off-blade tied-off-blade-b" d="M0 4L14 16M14 16a3 3 0 1 0 4 1" />
            </svg>
          </>
        )}
      </span>
    </span>
  );
}
