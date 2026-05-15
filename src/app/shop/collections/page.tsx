import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { sanityClient, urlFor } from "@/lib/sanity";
import HeaderWrapper from "@/components/HeaderWrapper";
import Footer from "@/components/Footer";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Collections | Beautasy",
  description:
    "Browse Beautasy's handmade collections — curated seasonal edits crafted with love in Southampton.",
};

const ALL_COLLECTIONS_QUERY = `*[_type == "collection"] | order(_createdAt desc) {
  name,
  "slug": slug.current,
  season,
  "coverImage": coverImage.asset->url,
  "productCount": count(*[_type == "product" && collection->slug.current == ^.slug.current])
}`;

interface Collection {
  name: string;
  slug: string;
  season?: string;
  coverImage?: string;
  productCount: number;
}

function safeCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return urlFor({ asset: { _ref: url } }).width(800).height(600).url();
  } catch {
    return url;
  }
}

export default async function CollectionsPage() {
  let collections: Collection[] = [];

  try {
    collections = await sanityClient.fetch<Collection[]>(ALL_COLLECTIONS_QUERY);
  } catch {
    // render empty state on error
  }

  return (
    <>
      <HeaderWrapper />
      <main className="pt-28">
        {/* Hero */}
        <section className="py-16 md:py-24 text-center">
          <div className="max-w-3xl mx-auto px-6">
            <p className="text-xs tracking-[0.3em] uppercase text-charcoal/50 mb-4">
              Curated Edits
            </p>
            <h1 className="font-serif text-4xl md:text-5xl mb-6">Collections</h1>
            <p className="text-charcoal-light leading-relaxed text-lg">
              Each collection is a story — seasonal pieces handcrafted with intention in our
              Southampton atelier.
            </p>
          </div>
        </section>

        {/* Grid */}
        <section className="pb-24 px-6">
          <div className="max-w-6xl mx-auto">
            {collections.length === 0 ? (
              <div className="text-center py-24">
                <p className="text-charcoal-light text-lg mb-2">No collections yet.</p>
                <p className="text-sm text-charcoal-light/70 mb-8">
                  Check back soon for our latest seasonal edits.
                </p>
                <Link
                  href="/shop"
                  className="inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300"
                >
                  Browse the Shop
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {collections.map((col) => {
                  const imgUrl = safeCoverUrl(col.coverImage);
                  return (
                    <Link
                      key={col.slug}
                      href={`/shop/collection/${col.slug}`}
                      className="group block"
                    >
                      {/* Cover image */}
                      <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-lavender-bg mb-4 relative">
                        {imgUrl ? (
                          <Image
                            src={imgUrl}
                            alt={col.name}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="font-serif text-3xl text-lavender/40">
                              {col.name[0]}
                            </span>
                          </div>
                        )}
                        {/* Season badge */}
                        {col.season && (
                          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs tracking-wider text-charcoal font-medium">
                            {col.season}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="px-1">
                        <h2 className="font-serif text-xl text-charcoal group-hover:text-lavender transition-colors duration-300 mb-1">
                          {col.name}
                        </h2>
                        <p className="text-sm text-charcoal-light">
                          {col.productCount === 0
                            ? "Coming soon"
                            : col.productCount === 1
                            ? "1 piece"
                            : `${col.productCount} pieces`}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
