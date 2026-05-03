import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sanityClient } from "@/lib/sanity";
import { PortableText } from "@portabletext/react";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";

export const revalidate = 300;

const LEGAL_PAGE_QUERY = `*[_type == "legalPage" && slug.current == $slug][0]{
  title,
  body,
  lastUpdated
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

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await sanityClient.fetch(LEGAL_PAGE_QUERY, { slug }).catch(() => null);

  if (!page) notFound();

  return (
    <>
      <HeaderWrapper />
      <main className="pt-28 pb-24 max-w-3xl mx-auto px-6">
        <h1 className="font-serif text-3xl sm:text-4xl mb-4">{page.title}</h1>
        {page.lastUpdated && (
          <p className="text-xs text-charcoal-light mb-10 tracking-wide">
            Last updated:{" "}
            {new Date(page.lastUpdated).toLocaleDateString("en-GB", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        )}
        {page.body && (
          <div className="prose prose-sm max-w-none text-charcoal-light leading-relaxed">
            <PortableText
              value={page.body}
              components={{
                types: {
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
