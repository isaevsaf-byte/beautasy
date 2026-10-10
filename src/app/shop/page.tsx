import type { ComponentProps } from "react";
import type { Metadata } from "next";
import { sanityClient, urlFor } from "@/lib/sanity";
import ShopContent from "./ShopContent";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";
import { SITE_URL } from "@/lib/site";
import { SOCIAL_CARD_IMAGES } from "@/lib/socialCard";

const siteUrl = SITE_URL;

export const metadata: Metadata = {
  title: "Beautasy Shop — Handmade Lingerie & Accessories",
  // ?sort= and ?size= show the same shop in another order: one address for all
  alternates: { canonical: `${siteUrl}/shop` },
  description:
    "Handmade silk lingerie, accessories, kids' clothing, and home decor. Every piece crafted with love in Southampton.",
  openGraph: {
    title: "Beautasy Shop — Handmade Lingerie & Accessories",
    description:
      "Handmade silk lingerie and accessories crafted in Southampton.",
    url: `${siteUrl}/shop`,
    siteName: "Beautasy",
    locale: "en_GB",
    type: "website",
    // The shop is the most forwarded page on the site and it was sending the
    // square site icon, declared 1200x630 while the file is 1378x1179. The
    // generated card is named here rather than inherited, because this page's
    // own openGraph block replaces the root's — see src/lib/socialCard.ts.
    images: SOCIAL_CARD_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Beautasy Shop — Handmade Lingerie & Accessories",
    description:
      "Handmade silk lingerie and accessories crafted in Southampton.",
    // No images: with the key absent Next copies the Open Graph ones here.
  },
};

/* ─── Safe image URL builder (won't crash on incomplete data) ─── */
function safeImageUrl(image: unknown): string | null {
  try {
    return urlFor(image).width(800).height(1000).url();
  } catch {
    return null;
  }
}

/* ─── Sanity GROQ query ─── */
const PRODUCTS_QUERY = `*[_type == "product"] | order(_createdAt desc) {
  _id,
  name,
  "slug": slug.current,
  images,
  price,
  category,
  subcategory,
  stock,
  availableSizes,
  "sizePrices": sizePrices[]{ size, price },
  productionTime,
  "colorCount": count(availableColors),
  "collection": collection->{ name, "slug": slug.current }
}`;

export const revalidate = 60; // revalidate every 60 seconds

type ShopProduct = ComponentProps<typeof ShopContent>["products"][number];

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; size?: string; ready?: string }>;
}) {
  // ?sort=, ?size= and ?ready= are read here on the server, so this listing
  // is rendered per visit (see the note in [param]/page.tsx). What can be kept
  // is the catalogue itself: it is cached for a minute, so a visit does not
  // wait on Sanity.
  const filters = await searchParams;
  let products: ShopProduct[] = [];

  // No made-up products when Sanity cannot be reached. The page used to fill
  // itself with nine placeholders — a "Silk Bralette" at £34.99 that was never
  // made, with an Add to Bag that checkout would refuse. A failure now goes to
  // the shop's error page ("Couldn't load products", with Try Again), and an
  // empty catalogue shows ShopContent's own "Coming Soon".
  const sanityProducts = await sanityClient.fetch(PRODUCTS_QUERY, {}, { next: { revalidate } });

  if (sanityProducts && sanityProducts.length > 0) {
    // Map Sanity products to the format our components expect
    products = sanityProducts.map(
      (p: {
        _id: string;
        name: string;
        slug?: string;
        price: number;
        images?: { asset?: { _ref: string } }[];
        category: string;
        subcategory?: string;
        stock?: number;
        availableSizes?: string[];
        sizePrices?: { size: string; price: number }[] | null;
        productionTime?: string | null;
        colorCount?: number | null;
        collection?: { name: string; slug: string } | null;
      }) => {
        const resolvedImages =
          p.images && p.images.length > 0
            ? p.images
                .map((image) => safeImageUrl(image))
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
              : ["https://placehold.co/400x500/E6E6FA/4A4A4A.png?text=Product"],
          category: p.category,
          subcategory: p.subcategory,
          stock: p.stock ?? 0,
          availableSizes: p.availableSizes || [],
          sizePrices: p.sizePrices ?? [],
          productionTime: p.productionTime ?? null,
          colorCount: p.colorCount ?? 0,
          collection: p.collection ?? null,
        };
      }
    );
  }

  // Deliberately no <Suspense> here, and no loading.tsx in this folder. Both
  // create a boundary that Next streams separately when the Sanity fetch is
  // slow, and a streamed boundary never finishes hydrating on a direct page
  // load: React leaves it marked "$~" and every handler inside it stays dead,
  // so Add to Bag, the thumbnails and the image viewer silently do nothing.
  // The listing is server-rendered from resolved props anyway, so the boundary
  // could never show its fallback for data — it only ever cost us the page.
  return (
    <>
      <HeaderWrapper />
      <ShopContent products={products} basePath="/shop" filters={filters} />
      <FooterWrapper />
    </>
  );
}
