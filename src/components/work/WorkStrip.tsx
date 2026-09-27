import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ShownPiece } from "@/lib/workMedia";
import TileFace from "./TileFace";

/**
 * A row of finished jobs for a page that sells the service: the atelier page
 * shows the newest, a service page shows the ones done for that service. Each
 * tile opens the piece in the gallery at /work.
 *
 * Nothing at all when there is nothing to show — a heading over an empty row
 * says the opposite of what the section is for.
 */
export default function WorkStrip({
  pieces,
  eyebrow,
  heading,
  className = "",
}: {
  pieces: ShownPiece[];
  eyebrow: string;
  heading: string;
  className?: string;
}) {
  if (pieces.length === 0) return null;
  return (
    <section className={className}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="mb-2 text-xs tracking-[0.25em] uppercase text-charcoal-light">{eyebrow}</p>
          <h2 className="font-serif text-2xl sm:text-3xl">{heading}</h2>
        </div>
        <Link
          href="/work"
          className="group inline-flex items-center gap-1.5 text-sm text-charcoal-light transition-colors hover:text-charcoal"
        >
          See all our work
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </div>
      <div className={`grid grid-cols-2 gap-x-4 gap-y-7 ${pieces.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {pieces.map((piece) => (
          <Link
            key={piece.id}
            href={`/work#${piece.anchor}`}
            className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender focus-visible:ring-offset-4"
          >
            {/* One shape for the whole row, so it reads as a row */}
            <TileFace piece={piece} sizes="(min-width: 1024px) 22vw, 46vw" ratio={1.25} />
          </Link>
        ))}
      </div>
    </section>
  );
}
