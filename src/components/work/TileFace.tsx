/* eslint-disable @next/next/no-img-element */
import { Images, Play } from "lucide-react";
import type { ShownMedia, ShownPhoto, ShownPiece } from "@/lib/workMedia";
import { durationLabel } from "@/lib/work";
import { tileRatio } from "./layout";

/**
 * What a piece looks like in a grid: its cover, the before and after side by
 * side when there is a before, a play mark on a video — and the title under
 * it, where it can be read without hovering.
 *
 * No state and no handlers, so the gallery wraps it in a button and the
 * atelier and service pages wrap it in a link to /work.
 */

/** A blurred thumbnail painted under the picture until it arrives */
function placeholder(lqip: string | null): React.CSSProperties | undefined {
  return lqip ? { backgroundImage: `url(${lqip})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined;
}

function Photo({ photo, sizes, eager, className }: { photo: ShownPhoto; sizes: string; eager?: boolean; className: string }) {
  return (
    <img
      src={photo.src}
      srcSet={photo.srcSet}
      sizes={sizes}
      alt={photo.alt}
      width={photo.width}
      height={photo.height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={className}
      style={placeholder(photo.lqip)}
    />
  );
}

export function Cover({
  media,
  sizes,
  eager,
  className,
}: {
  media: ShownMedia;
  sizes: string;
  eager?: boolean;
  className: string;
}) {
  if (media.kind === "photo") return <Photo photo={media} sizes={sizes} eager={eager} className={className} />;
  if (media.poster) {
    return (
      <img
        src={media.poster}
        srcSet={media.posterSrcSet ?? undefined}
        sizes={sizes}
        alt={media.alt}
        width={media.width}
        height={media.height}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={className}
        style={placeholder(media.lqip)}
      />
    );
  }
  // A video added in the Studio without a cover: its first moment stands in
  return (
    <video
      src={`${media.src}#t=0.1`}
      preload="metadata"
      muted
      playsInline
      aria-label={media.alt}
      className={className}
    />
  );
}

const PICTURE = "absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]";

export default function TileFace({
  piece,
  sizes,
  eager,
  ratio,
}: {
  piece: ShownPiece;
  sizes: string;
  eager?: boolean;
  /** Height over width, to override the cover's own shape (the strips use one shape for all) */
  ratio?: number;
}) {
  const cover = piece.media[0];
  const pair = piece.before && cover.kind === "photo" ? { before: piece.before, after: cover } : null;
  const video = piece.media.find((m) => m.kind === "video");
  const extra = piece.media.length + (piece.before ? 1 : 0) - 1;

  return (
    <span className="block text-left">
      <span
        className="relative block w-full overflow-hidden rounded-2xl bg-lavender-bg ring-1 ring-charcoal/[0.04]"
        style={{ aspectRatio: `1 / ${ratio ?? tileRatio(piece)}` }}
      >
        {pair ? (
          <span className="absolute inset-0 grid grid-cols-2 gap-[3px] bg-cream">
            {(
              [
                ["Before", pair.before, "bg-white/85 text-charcoal"],
                ["After", pair.after, "bg-lavender text-charcoal"],
              ] as const
            ).map(([label, photo, tone]) => (
              <span key={label} className="relative overflow-hidden">
                {/* Each half crops a photo drawn at the tile's full width, so
                    it wants the full tile's resolution, not half of it */}
                <Photo photo={photo} sizes={sizes} eager={eager} className={PICTURE} />
                {/* At the top: the difference is usually at the bottom — a hem, a floor */}
                <span
                  className={`absolute top-2.5 left-2.5 rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.18em] uppercase shadow-sm ${tone}`}
                >
                  {label}
                </span>
              </span>
            ))}
          </span>
        ) : (
          <Cover media={cover} sizes={sizes} eager={eager} className={PICTURE} />
        )}

        {video && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
            <Play size={11} className="fill-current" aria-hidden="true" />
            {video.kind === "video" && video.duration ? durationLabel(video.duration) : "Video"}
          </span>
        )}
        {extra > 0 && !pair && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-1 text-[11px] font-medium text-charcoal backdrop-blur-sm">
            <Images size={12} aria-hidden="true" />
            {extra + 1}
          </span>
        )}
      </span>
      <span className="block px-1 pt-3">
        <span className="block text-[10px] tracking-[0.22em] uppercase text-charcoal-light mb-1">{piece.categoryLabel}</span>
        {/* Not a heading: the tile is a button or a link, and neither may hold one */}
        <span className="block font-serif text-[17px] leading-snug text-charcoal group-hover:text-[#8f7fc0] transition-colors">
          {piece.title}
        </span>
      </span>
    </span>
  );
}
