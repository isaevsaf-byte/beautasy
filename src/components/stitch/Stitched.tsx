import type { CSSProperties, ReactNode } from "react";
import { LOOP, NEEDLE_EYE, NEEDLE_SHAPE, NEEDLE_SHINE, NEEDLE_TAIL, STITCHES } from "@/lib/stitchGeometry";

/**
 * Words with a hand-sewn seam under them: on a visitor's first page a needle
 * with gold thread sews eleven running stitches beneath them, pulls the
 * thread through, ties a knot and is left standing in the cloth.
 *
 * The words are sent exactly as they were; everything else is decoration,
 * hidden from screen readers and from the heading's text. Nothing here waits
 * for scripts: the movement is CSS (.stitched in app/globals.css) and starts
 * with the first paint, and what the page shows by default is the finished
 * seam, so a visitor who asked for less motion, a page already sewn this
 * visit, or a browser that runs no animation all see the same still picture.
 *
 * No hooks, so it renders in the home page's client component and in the
 * service pages on the server alike. One per page: the needle's steel is a
 * gradient with a fixed id.
 */
export default function Stitched({ children }: { children: ReactNode }) {
  return (
    <span className="stitched">
      {children}
      <span className="stitched-art" aria-hidden="true">
        <svg className="stitched-seam" viewBox="0 0 1000 20" preserveAspectRatio="none" focusable="false">
          {STITCHES.map((s, i) => (
            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} style={{ "--i": i } as CSSProperties} />
          ))}
        </svg>
        <span className="stitched-knot" />
        <svg className="stitched-loop" viewBox="0 0 140 90" focusable="false">
          <path d={LOOP} />
        </svg>
        <span className="stitched-needle">
          <span className="stitched-x">
            <span className="stitched-y">
              <span className="stitched-r">
                <svg className="stitched-pin" viewBox="-130 -40 140 160" focusable="false">
                  <defs>
                    <linearGradient id="stitched-steel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#8C8C8C" />
                      <stop offset=".45" stopColor="#3E3E3E" />
                      <stop offset="1" stopColor="#6E6E6E" />
                    </linearGradient>
                  </defs>
                  <path className="stitched-tail" d={NEEDLE_TAIL} />
                  <path d={NEEDLE_SHAPE} fill="url(#stitched-steel)" />
                  <line
                    x1={NEEDLE_SHINE.x1}
                    y1={NEEDLE_SHINE.y}
                    x2={NEEDLE_SHINE.x2}
                    y2={NEEDLE_SHINE.y}
                    stroke="rgba(255,255,255,.55)"
                    strokeWidth={NEEDLE_SHINE.width}
                    strokeLinecap="round"
                  />
                  <ellipse cx={NEEDLE_EYE.cx} cy="0" rx={NEEDLE_EYE.rx} ry={NEEDLE_EYE.ry} fill="#FDFBF7" />
                </svg>
              </span>
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}

/**
 * A heading that ends "in Southampton", with those words sewn. Any other
 * heading comes back as it was. The text is the same either way: what is
 * before, a space, then the words.
 */
export function stitchSouthampton(heading: string): ReactNode {
  const tail = " in Southampton";
  if (!heading.endsWith(tail)) return heading;
  return (
    <>
      {heading.slice(0, -tail.length)}{" "}
      <Stitched>in Southampton</Stitched>
    </>
  );
}
