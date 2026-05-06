import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { sanityClient, urlFor } from "@/lib/sanity";
import { PortableText } from "@portabletext/react";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";

export const revalidate = 300;

const LEGAL_PAGE_QUERY = `*[_type == "legalPage" && slug.current == $slug][0]{
  title,
  body,
  lastUpdated,
  mainImage {
    asset->{ url, metadata { dimensions } },
    alt,
    caption,
    hotspot,
    crop
  }
}`;

const ALL_SLUGS_QUERY = `*[_type == "legalPage"]{ "slug": slug.current }`;

export async function generateStaticParams() {
  try {
    const pages = await sanityClient.fetch(ALL_SLUGS_QUERY);
    return pages
      .filter((p: { slug?: string }) => p.slug)
      .map((p: { slug: string }) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await sanityClient.fetch(LEGAL_PAGE_QUERY, { slug }).catch(() => null);
  if (!page) return { title: "Page Not Found | Beautasy" };
  return {
    title: `${page.title} | Beautasy`,
    description: `${page.title} — Beautasy`,
  };
}

/* ─── Safe URL builder for inline images ─── */
function safeImageUrl(source: unknown, width?: number): string | null {
  try {
    const builder = urlFor(source).auto("format");
    return width ? builder.width(width).url() : builder.url();
  } catch {
    return null;
  }
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await sanityClient.fetch(LEGAL_PAGE_QUERY, { slug }).catch(() => null);

  if (!page) notFound();

  /* Build the main image URL if present */
  const mainImageUrl = page.mainImage?.asset?.url
    ? safeImageUrl(page.mainImage, 1200)
    : null;

  const mainImageDimensions = page.mainImage?.asset?.metadata?.dimensions as
    | { width: number; height: number }
    | undefined;

  return (
    <>
      <HeaderWrapper />
      <main className="pt-28 pb-24 max-w-3xl mx-auto px-6">
        {/* Title */}
        <h1 className="font-serif text-3xl sm:text-4xl mb-4">{page.title}</h1>

        {/* Last updated */}
        {page.lastUpdated && (
          <p className="text-xs text-charcoal-light mb-8 tracking-wide">
            Last updated:{" "}
            {new Date(page.lastUpdated).toLocaleDateString("en-GB", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        )}

        {/* Main hero image */}
        {mainImageUrl && (
          <div className="mb-10 rounded-2xl overflow-hidden">
            <Image
              src={mainImageUrl}
              alt={page.mainImage?.alt || page.title}
              width={mainImageDimensions?.width ?? 1200}
              height={mainImageDimensions?.height ?? 600}
              className="w-full h-auto object-cover"
              priority
            />
            {page.mainImage?.caption && (
              <p className="mt-2 text-xs text-charcoal-light text-center italic">
                {page.mainImage.caption}
              </p>
            )}
          </div>
        )}

        {/* Body content */}
        {page.body && (
          <div className="prose prose-sm max-w-none text-charcoal-light leading-relaxed">
            <PortableText
              value={page.body}
              components={{
                types: {
                  /* Inline image block */
                  image: ({ value }: { value: { asset?: { url?: string }; alt?: string; caption?: string } }) => {
                    const imgUrl = value?.asset
                      ? safeImageUrl(value, 900)
                      : null;
                    if (!imgUrl) return null;
                    return (
                      <figure className="my-8">
                        <div className="rounded-2xl overflow-hidden">
                          <img
                            src={imgUrl}
                            alt={value.alt || ""}
                            className="w-full h-auto object-cover"
                            loading="lazy"
                          />
                        </div>
                        {value.caption && (
                          <figcaption className="mt-2 text-xs text-charcoal-light text-center italic">
                            {value.caption}
                          </figcaption>
                        )}
                      </figure>
                    );
                  },
                  /* Info box block */
                  infoBox: ({ value }: { value: { text?: string; style?: string } }) => {
                    const isWarning = value.style === "warning";
                    return (
                      <div
                        className={`my-4 px-4 py-3 rounded-xl border text-sm ${
                          isWarning
                            ? "bg-amber-50 border-amber-200 text-amber-800"
                            : "bg-lavender-bg border-lavender-soft/40 text-charcoal"
                        }`}
                      >
                        {value.text}
                      </div>
                    );
                  },
                },
              }}
            />
          </div>
        )}
      </main>
      <FooterWrapper />
    </>
  );
}
