import type { Metadata } from "next";
import { sanityClient, urlFor } from "@/lib/sanity";
import GiftBoxesContent from "./GiftBoxesContent";

/* ─── Safe image URL builder ─── */
function safeImageUrl(image: unknown): string | null {
  try {
    return urlFor(image).width(800).height(1000).url();
  } catch {
    return null;
  }
}

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Gift Boxes | Beautasy",
  description:
    "Curated handmade gift box sets from Beautasy. Beautifully packaged bundles of our finest silk and handcrafted products.",
  openGraph: {
    title: "Gift Boxes | Beautasy",
    description:
      "Curated handmade gift box sets from Beautasy. Beautifully packaged bundles of our finest silk and handcrafted products.",
  },
};

const GIFT_BOXES_QUERY = `*[_type == "giftBox"] | order(_createdAt desc) {
  _id,
  name,
  "slug": slug.current,
  images,
  price,
  stock,
  "productCount": count(contents)
}`;

export default async function GiftBoxesPage() {
  let giftBoxes: {
    _id: string;
    name: string;
    slug: string;
    images: string[];
    price: number;
    stock: number;
    productCount: number;
  }[] = [];

  try {
    const data = await sanityClient.fetch(GIFT_BOXES_QUERY);

    if (data && data.length > 0) {
      giftBoxes = data.map(
        (gb: {
          _id: string;
          name: string;
          slug?: string;
          images?: { asset?: { _ref: string } }[];
          price: number;
          stock?: number;
          productCount?: number;
        }) => {
          const resolvedImages =
            gb.images && gb.images.length > 0
              ? gb.images
                  .map((image) => safeImageUrl(image))
                  .filter((url): url is string => url !== null)
              : [];

          return {
            _id: gb._id,
            name: gb.name,
            slug: gb.slug || gb._id,
            price: gb.price,
            images:
              resolvedImages.length > 0
                ? resolvedImages
                : [
                    "https://placehold.co/400x500/E6E6FA/4A4A4A?text=Gift+Box",
                  ],
            stock: gb.stock ?? 0,
            productCount: gb.productCount ?? 0,
          };
        }
      );
    }
  } catch (error) {
    console.error("Error fetching gift boxes:", error);
  }

  return <GiftBoxesContent giftBoxes={giftBoxes} />;
}
