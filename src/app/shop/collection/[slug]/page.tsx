import type { Metadata } from "next";
import { Suspense } from "react";
import { sanityClient, urlFor } from "@/lib/sanity";
import { notFound } from "next/navigation";
import ShopContent from "../../ShopContent";
import ShopLoading from "../../loading";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";

export const revalidate = 60;

/* ─── Safe image URL builder ─── */
function safeImageUrl(image: unknown): string | null {
  try {
    return urlFor(image).width(800).height(1000).url();
  } catch {
    return null;
  }
}

/* ─── GROQ queries ─── */
const COLLECTION_QUERY = `*[_type == "collection" && slug.current == $slug][0]{
  name,
  "slug": slug.current,
  season,
  description
}`;

const COLLECTION_PRODUCTS_QUERY = `*[_type == "product" && collection->slug.current == $slug] | order(_createdAt desc) {
  _id,
  name,
  "slug": slug.current,
  images,
  price,
  category,
  subcategory,
  stock,
  availableSizes,
  "collection": collection->{ name, "slug": slug.current }
}`;

const ALL_COLLECTION_SLUGS_QUERY = `*[_type == "collection"]{ "slug": slug.current }`;

/* ─── Static params ─── */
export async function generateStaticParams() {
  try {
    const collections = await sanityClient.fetch(ALL_COLLECTION_SLUGS_QUERY);
    return collections
      .filter((c: { slug?: string }) => c.slug)
      .map((c: { slug: string }) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

/* ─── Metadata ─── */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await sanityClient
    .fetch(COLLECTION_QUERY, { slug })
    .catch(() => null);
  if (!collection) return { title: "Collection Not Found | Beautasy" };
  return {
    title: `${collection.name}${collection.season ? ` — ${collection.season}` : ""} | Beautasy`,
    description: `Shop the ${collection.name} collection${collection.season ? ` (${collection.season})` : ""} — handmade pieces crafted with love in Southampton.`,
  };
}

/* ─── Page ─── */
export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [collection, sanityProducts] = await Promise.all([
    sanityClient.fetch(COLLECTION_QUERY, { slug }).catch(() => null),
    sanityClient.fetch(COLLECTION_PRODUCTS_QUERY, { slug }).catch(() => []),
  ]);

  if (!collection) notFound();

  const products = (sanityProducts as {
    _id: string;
    name: string;
    slug?: string;
    price: number;
    images?: { asset?: { _ref: string } }[];
    category: string;
    subcategory?: string;
    availableSizes?: string[];
    collection?: { name: string; slug: string } | null;
  }[]).map((p) => {
    const resolvedImages =
      p.images && p.images.length > 0
        ? p.images
            .map((img) => safeImageUrl(img))
            .filter((url): url is string => url !== null)
        : [];

    return {
      _id: p._id,
      name: p.name,
      slug: p.slug || p._id,
      price: p.price,
      images:
        resolvedImages.length > 0
          ? resolvedImages
          : ["https://placehold.co/400x500/E6E6FA/4A4A4A?text=Product"],
      category: p.category,
      subcategory: p.subcategory,
      availableSizes: p.availableSizes || [],
      collection: p.collection ?? null,
    };
  });

  return (
    <>
      <HeaderWrapper />
      <Suspense fallback={<ShopLoading />}>
        <ShopContent
          products={products}
          activeCollection={collection}
        />
      </Suspense>
      <FooterWrapper />
    </>
  );
}
