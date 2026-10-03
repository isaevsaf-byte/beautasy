import { NextRequest, NextResponse } from "next/server";
import { sanityClient, urlFor } from "@/lib/sanity";
import { searchServices } from "@/lib/serviceSearch";

// Results change only when the catalogue does; a short cache keeps typing snappy
export const revalidate = 60;

const MAX_RESULTS = 8;

/* Matches name, description text, category, subcategory and collection name.
   `match` is GROQ's word-prefix match, so "brale" finds "Bralette". */
const SEARCH_QUERY = `{
  "products": *[
    _type == "product" && defined(slug.current) && (
      name match $q ||
      category match $q ||
      subcategory match $q ||
      pt::text(description) match $q ||
      collection->name match $q
    )
  ] | order(_createdAt desc) [0...$limit] {
    _id, name, "slug": slug.current, price, category, images
  },
  "giftBoxes": *[
    _type == "giftBox" && defined(slug.current) && (name match $q || pt::text(description) match $q)
  ] | order(_createdAt desc) [0...4] {
    _id, name, "slug": slug.current, price, images
  }
}`;

interface RawResult {
  _id: string;
  name: string;
  slug: string;
  price: number;
  category?: string;
  images?: unknown[];
}

function thumb(images: unknown[] | undefined): string | null {
  if (!images || images.length === 0) return null;
  try {
    return urlFor(images[0]).width(120).height(150).url();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("q") ?? "").trim();

  if (raw.length < 2) {
    return NextResponse.json({ results: [], query: raw });
  }

  // The atelier first: it is what most people searching here came for, and
  // its answers need no dataset, so they arrive even when Sanity does not
  const services = searchServices(raw);

  // GROQ `match` treats * as a wildcard; append one so partial words hit
  const q = `${raw.replace(/[*"]/g, "")}*`;

  try {
    const { products, giftBoxes } = await sanityClient.fetch<{
      products: RawResult[];
      giftBoxes: RawResult[];
    }>(SEARCH_QUERY, { q, limit: MAX_RESULTS });

    const results = [
      ...services,
      ...products.map((p) => ({
        _id: p._id,
        kind: "product" as const,
        name: p.name,
        href: `/shop/${p.slug}`,
        price: p.price,
        label: p.category ?? "Product",
        image: thumb(p.images),
      })),
      ...giftBoxes.map((g) => ({
        _id: g._id,
        kind: "product" as const,
        name: g.name,
        href: `/gift-boxes/${g.slug}`,
        price: g.price,
        label: "Gift Box",
        image: thumb(g.images),
      })),
    ].slice(0, MAX_RESULTS);

    return NextResponse.json({ results, query: raw });
  } catch (error) {
    console.error("Search failed:", error);
    // The shop could not be searched; the atelier's answers still stand
    if (services.length > 0) return NextResponse.json({ results: services, query: raw });
    return NextResponse.json({ error: "Search is unavailable" }, { status: 500 });
  }
}
