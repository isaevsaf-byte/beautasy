/**
 * Under a price list, in place of "prices are a guide": a pair of
 * dressmaker's shears lying closed, and what that means — the price is said
 * at the fitting, with the piece pinned on her, nothing is cut before she
 * says yes, and saying no costs nothing (Kristina's word, 08.10.2026).
 *
 * It answers the fear of a fitting in a stranger's home — that the price
 * moves once you are there and it is awkward to leave — without "trusted" or
 * "quality". Nothing moves: on the site the shears close only once, when they
 * cut the thread after "You're booked in" (stitch/TiedOff.tsx).
 *
 * Said only as it is true: `pinned` where a service is priced at a fitting
 * (wedding, prom, school uniform, jeans); elsewhere — curtains from their
 * measurements, a zip or a repair from a photo, /atelier across every kind
 * of job — it names every way a price is given, as the Terms do.
 *
 * The drawing is lines in the brand's gold (.closed-shears in
 * app/globals.css), hidden from screen readers; the words carry it. `note` is
 * a service's own word on its prices. No hooks, so it renders on the server.
 * One per page: the blade's gold is a gradient with a fixed id.
 */
export default function ClosedShears({
  pinned = false,
  note,
  className = "",
}: {
  pinned?: boolean;
  note?: string;
  className?: string;
}) {
  return (
    <div className={`closed-shears flex flex-col sm:flex-row gap-3 sm:gap-5 items-start bg-cream-soft rounded-2xl px-6 py-5 ${className}`}>
      <svg className="closed-shears-art" viewBox="0 0 120 40" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="closed-shears-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#D9B97E" />
            <stop offset=".5" stopColor="#B08848" />
            <stop offset="1" stopColor="#8A672F" />
          </linearGradient>
        </defs>
        {/* The blades shut along the cloth, the screw, a round ring for the
            thumb and a long bent loop for the fingers */}
        <path className="closed-shears-blade" d="M3 21.5C22 19.6 48 16.2 71 14.6L74 15V26L71 26.4C48 25.6 22 23.6 3 21.5Z" />
        <path className="closed-shears-edge" d="M9 21.4C30 21 52 20.6 72 20.4" />
        <path className="closed-shears-shank" d="M74 16.5C80 15 84 11.5 88.5 9.6" />
        <ellipse className="closed-shears-ring" cx="96" cy="9" rx="7.6" ry="5.4" transform="rotate(-8 96 9)" />
        <path className="closed-shears-shank" d="M74 24.5C80 26 84 30 89 31.2" />
        <ellipse className="closed-shears-ring" cx="103.5" cy="31" rx="13.6" ry="5.8" transform="rotate(4 103.5 31)" />
        <circle className="closed-shears-screw" cx="72" cy="20.4" r="3" />
        <circle className="closed-shears-pin" cx="72" cy="20.4" r="1" />
      </svg>
      <div className="max-w-2xl">
        <p className="font-serif italic text-[17px] leading-snug text-charcoal">
          {pinned
            ? "Your price is said while you're pinned. The shears stay closed until you say yes."
            : "You hear your price before anything is cut — at your fitting, or from your photos and measurements. The shears stay closed until you say yes."}
        </p>
        <p className="text-[13px] text-charcoal-light leading-relaxed mt-2">
          {pinned ? "Saying no costs nothing." : "Saying no at a fitting costs nothing."} Silk, velvet, leather and beading
          take longer by hand — you&apos;ll hear that price first, too.
        </p>
        {note && <p className="text-[13px] text-charcoal-light leading-relaxed mt-2">{note}</p>}
      </div>
    </div>
  );
}
