import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, MessageCircle, Scissors } from "lucide-react";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";
import WorkGallery from "@/components/work/WorkGallery";
import Showreel from "@/components/work/Showreel";
import { Cover } from "@/components/work/TileFace";
import { readWork } from "@/lib/getWork";
import { showPiece, showShowreel, shareImageFor, workJsonLd, type ShownPiece } from "@/lib/workMedia";
import { SITE_URL } from "@/lib/site";
import { jsonLdScript } from "@/lib/jsonLd";
import { BUSINESS, whatsappLink } from "@/lib/business";
import { CAMPAIGN_HOOK } from "@/lib/localServices";

// A piece Kristina publishes shows within five minutes. If Sanity can't be
// read, readWork throws and the last good page keeps being served.
export const revalidate = 300;

const TITLE = "Made & Mended — Our Work | Beautasy Atelier, Southampton";
// Kept to 155 characters, where Google trims a description: at 203 the
// before-and-after photos — the reason to click — were the part cut off
const DESCRIPTION =
  "Curtains taken up to skim the floor, a nursery quilt pieced square by square: real work from Beautasy's Southampton workroom, with before-and-after photos.";
const PAGE_URL = `${SITE_URL}/work`;

export async function generateMetadata(): Promise<Metadata> {
  const { pieces } = await readWork();
  const share = shareImageFor(pieces[0]);
  const images = share
    ? [{ url: share, width: 1200, height: 630, alt: "Work from the Beautasy atelier in Southampton" }]
    : [{ url: `${SITE_URL}/beautasy-atelier-og.jpg`, width: 1200, height: 1028, alt: "Beautasy Atelier" }];
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PAGE_URL },
    // A gallery with nothing in it is a "soft 404" to Google, as an empty shop
    // shelf is — see @/lib/shelves
    ...(pieces.length === 0 ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: PAGE_URL,
      siteName: "Beautasy",
      locale: "en_GB",
      type: "website",
      images,
    },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: images.map((i) => i.url) },
  };
}

/** Without a showreel: the three newest covers, fanned out like prints on a table */
function CoverFan({ pieces }: { pieces: ShownPiece[] }) {
  const turns = ["-rotate-6 -translate-x-16", "rotate-2 z-10", "rotate-6 translate-x-16"];
  return (
    <div className="relative mx-auto flex h-[420px] w-full max-w-sm items-center justify-center">
      {pieces.slice(0, 3).map((piece, i) => (
        <div
          key={piece.id}
          className={`absolute w-[210px] overflow-hidden rounded-2xl border-[6px] border-white bg-white shadow-xl ${turns[i]}`}
          style={{ aspectRatio: "3 / 4" }}
        >
          <Cover media={piece.media[0]} sizes="220px" eager className="h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}

export default async function WorkPage() {
  const { pieces, showreel } = await readWork();
  const shown = pieces.map(showPiece);
  const reel = showShowreel(showreel);
  const films = shown.reduce((n, p) => n + p.media.filter((m) => m.kind === "video").length, 0);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Our Work", item: PAGE_URL },
    ],
  };

  return (
    <>
      {shown.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(workJsonLd(shown, PAGE_URL, BUSINESS.atelierId)) }}
        />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }} />

      <HeaderWrapper />

      <main className="pt-24 pb-24">
        {/* ──── Hero ──── */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10" aria-hidden="true">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FDFBF7] via-[#F3ECFF] to-[#E8DEFF]" />
            <div className="absolute -top-24 -left-24 h-[380px] w-[380px] rounded-full bg-white/50 blur-3xl" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#FDFBF7]/95 via-[#FDFBF7]/70 to-transparent" />
          </div>

          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 py-14 md:py-20 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="max-w-xl">
              <p className="mb-4 text-sm tracking-[0.25em] uppercase text-charcoal-light">Our work · Southampton</p>
              <h1 className="mb-6 font-serif text-5xl leading-[1.04] sm:text-6xl lg:text-7xl">
                Made <span className="italic text-[#b3a1e8]">&amp;</span>
                <br />
                Mended
              </h1>
              <p className="mb-8 max-w-md text-lg leading-relaxed text-charcoal-light">
                Every picture here is a real job from our Southampton workroom — curtains taken up to skim the
                floor, a nursery quilt pieced square by square, scrunchies by the pile. Have a look, then bring
                us yours.
              </p>
              <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/atelier#book"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-lavender px-8 py-3.5 text-sm font-medium tracking-wider text-charcoal uppercase transition-all duration-300 hover:bg-[#CFC0F0] hover:shadow-lg hover:shadow-lavender/30"
                >
                  Book a fitting
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
                <a
                  href={whatsappLink("Hi Kristina, I've seen your work — here's a photo of mine:")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-charcoal/20 px-6 py-3.5 text-sm font-medium tracking-wider text-charcoal uppercase transition-all duration-300 hover:border-lavender hover:bg-lavender/10"
                >
                  <MessageCircle size={16} aria-hidden="true" />
                  Send a photo
                </a>
              </div>
              {shown.length > 0 && (
                <a
                  href="#gallery"
                  className="inline-flex items-center gap-2 text-sm text-charcoal-light transition-colors hover:text-charcoal"
                >
                  <ArrowDown size={15} aria-hidden="true" />
                  {shown.length} {shown.length === 1 ? "piece" : "pieces"}
                  {films > 0 && ` · ${films} ${films === 1 ? "film" : "films"} from the workroom`}
                </a>
              )}
            </div>

            <div className="flex justify-center">
              {reel ? (
                <Showreel showreel={reel} label="Hands at work in the Beautasy workroom: fabric cut, stacked and sewn" />
              ) : shown.length > 0 ? (
                <CoverFan pieces={shown} />
              ) : null}
            </div>
          </div>
        </section>

        {/* ──── The work ──── */}
        <section id="gallery" className="mx-auto mt-16 max-w-6xl scroll-mt-28 px-4 sm:px-6">
          {shown.length > 0 ? (
            <WorkGallery pieces={shown} />
          ) : (
            <p className="mx-auto max-w-md text-center leading-relaxed text-charcoal-light">
              The first pieces are being photographed. In the meantime, Kristina is happy to send pictures of
              work like yours on WhatsApp.
            </p>
          )}
        </section>

        {/* ──── Bring yours ──── */}
        <section className="mx-auto mt-24 max-w-4xl px-6">
          <div className="rounded-3xl border border-lavender-soft/60 bg-lavender-bg px-7 py-12 text-center sm:px-12 sm:py-14">
            <Scissors size={26} className="mx-auto mb-5 text-charcoal/70" aria-hidden="true" />
            <h2 className="mb-3 font-serif text-3xl sm:text-4xl">{CAMPAIGN_HOOK.title}</h2>
            <p className="mx-auto mb-8 max-w-xl leading-relaxed text-charcoal-light">{CAMPAIGN_HOOK.body}</p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/atelier#book"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-lavender px-8 py-3.5 text-sm font-medium tracking-wider text-charcoal uppercase transition-colors hover:bg-[#CFC0F0]"
              >
                Book a fitting
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
              <a
                href={whatsappLink("Hi Kristina, I've got something that needs saving — here's a photo:")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-charcoal/20 px-6 py-3.5 text-sm font-medium tracking-wider text-charcoal uppercase transition-colors hover:border-lavender hover:bg-white/60"
              >
                <MessageCircle size={16} aria-hidden="true" />
                Send a photo on WhatsApp
              </a>
              <Link
                href="/shop"
                className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium tracking-wider text-charcoal-light uppercase transition-colors hover:text-charcoal"
              >
                Shop handmade
              </Link>
            </div>
          </div>
        </section>
      </main>

      <FooterWrapper />
    </>
  );
}
