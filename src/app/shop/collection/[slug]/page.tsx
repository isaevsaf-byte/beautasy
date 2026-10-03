import type { Metadata } from "next";
import { sanityClient, urlFor } from "@/lib/sanity";
import { notFound } from "next/navigation";
import ShopContent from "../../ShopContent";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";
import { SITE_URL } from "@/lib/site";
import { collectionDescription } from "@/lib/collectionMeta";

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
  productionTime,
  "colorCount": count(availableColors),
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
    description: collectionDescription(collection.name, collection.season),
    // ?sort= and ?size= show the same collection in another order: one
    // address for all of them, as on /shop and the category pages
    alternates: { canonical: `${SITE_URL}/shop/collection/${slug}` },
  };
}

/* ─── Page ─── */
export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ category?: string; sort?: string; size?: string; ready?: string }>;
}) {
  const { slug } = await params;
  // Read on the server for the filters, so this page is rendered per visit
  // (see the note in ../../[param]/page.tsx); the collection and its pieces
  // are cached for a minute rather than fetched each time
  const filters = await searchParams;

  const [collection, sanityProducts] = await Promise.all([
    sanityClient.fetch(COLLECTION_QUERY, { slug }, { next: { revalidate: 60 } }).catch(() => null),
    sanityClient.fetch(COLLECTION_PRODUCTS_QUERY, { slug }, { next: { revalidate: 60 } }).catch(() => []),
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
    stock?: number;
    availableSizes?: string[];
    productionTime?: string | null;
    colorCount?: number | null;
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
      stock: p.stock ?? 0,
      availableSizes: p.availableSizes || [],
      productionTime: p.productionTime ?? null,
      colorCount: p.colorCount ?? 0,
      collection: p.collection ?? null,
    };
  });

  return (
    <>
      <HeaderWrapper />
      <ShopContent
        products={products}
        activeCollection={collection}
        basePath={`/shop/collection/${slug}`}
        filters={filters}
      />
      <FooterWrapper />
    </>
  );
}
