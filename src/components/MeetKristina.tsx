import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { whatsappLink } from "@/lib/business";
import type { MeetKristinaContent, ShownPortrait } from "@/lib/meetKristina";

/** The first line of the chat, typed for them: a photo is what she needs to give a price */
const WHATSAPP_HELLO = "Hi Kristina, here's a photo of something I'd like altered:";

/** The column the block sits in: max-w-6xl on the home page and /atelier, max-w-4xl elsewhere */
const COLUMN = { wide: 1152, narrow: 896 } as const;

/**
 * How wide each photo is drawn, for the browser to fetch a picture that size
 * rather than the largest. On a laptop: the column less its px-6, halved
 * across gap-14 — and with two photos, that half shared 3:2 across sm:gap-4.
 * Below the column's width the photos shrink with the screen; below md the
 * single portrait is the screen less its margins, up to max-w-sm (384px).
 */
export function portraitSizes(column: number): { single: string; portrait: string; atWork: string } {
  const half = (column - 48 - 56) / 2;
  const pair = half - 16;
  return {
    single: `(min-width: ${column}px) ${Math.round(half)}px, (min-width: 768px) 46vw, (min-width: 432px) 384px, 92vw`,
    portrait: `(min-width: ${column}px) ${Math.round(pair * 0.6)}px, (min-width: 768px) 28vw, 58vw`,
    atWork: `(min-width: ${column}px) ${Math.round(pair * 0.4)}px, (min-width: 768px) 19vw, 38vw`,
  };
}

function Portrait({ photo, sizes }: { photo: ShownPortrait; sizes: string }) {
  return (
    <Image
      src={photo.src}
      alt={photo.alt}
      width={photo.width}
      height={photo.height}
      sizes={sizes}
      // Below the fold on every page it is on
      loading="lazy"
      {...(photo.lqip ? { placeholder: "blur" as const, blurDataURL: photo.lqip } : {})}
      className="w-full h-auto rounded-3xl object-cover bg-lavender-bg"
    />
  );
}

/**
 * Kristina's photo and a few words from her, with the two ways to start.
 *
 * Nothing at all until the Studio has a portrait — see @/lib/meetKristina.
 * A server-side block with no state, so a page can hand it to a client
 * component whole, as it does the rows of work and reviews.
 *
 * `bookHref` is where "Choose a time" goes: the atelier's form by default, the
 * form further down the same page on a service page, where it already knows
 * which job it is for. `narrow` is for the max-w-4xl column of /alterations
 * and the service pages, where the photos are drawn smaller.
 */
export default function MeetKristina({
  content,
  bookHref = "/atelier#book",
  narrow = false,
  className = "",
}: {
  content: MeetKristinaContent | null;
  bookHref?: string;
  narrow?: boolean;
  className?: string;
}) {
  if (!content) return null;
  const { photo, atWork, paragraphs } = content;
  const sizes = portraitSizes(narrow ? COLUMN.narrow : COLUMN.wide);
  return (
    <section aria-labelledby="meet-kristina" className={className}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14 items-center">
        {atWork ? (
          // Side by side at every width: the portrait first and larger, the
          // photo at work a step lower, so the two read as a pair
          <div className="grid grid-cols-5 gap-3 sm:gap-4 items-end">
            <div className="col-span-3">
              <Portrait photo={photo} sizes={sizes.portrait} />
            </div>
            <div className="col-span-2 mb-8">
              <Portrait photo={atWork} sizes={sizes.atWork} />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-sm mx-auto md:max-w-none">
            <Portrait photo={photo} sizes={sizes.single} />
          </div>
        )}

        <div>
          <p className="mb-2 text-xs tracking-[0.25em] uppercase text-charcoal-light">The hands behind Beautasy</p>
          <h2 id="meet-kristina" className="font-serif text-2xl sm:text-3xl mb-6">
            Meet Kristina
          </h2>
          <div className="space-y-4 max-w-md">
            {paragraphs.map((paragraph, i) => (
              <p key={i} className="text-charcoal-light leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mt-8">
            <Link
              href={bookHref}
              className="topstitch group inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-lavender-hover transition-all duration-300"
            >
              Choose a time
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
            </Link>
            <a
              href={whatsappLink(WHATSAPP_HELLO)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 border border-charcoal/20 text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:border-lavender hover:bg-lavender/10 transition-all duration-300"
            >
              <MessageCircle size={15} aria-hidden="true" />
              Send a photo on WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
