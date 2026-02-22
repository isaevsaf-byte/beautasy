import type { Metadata } from "next";
import { sanityClient, urlFor } from "@/lib/sanity";
import GiftBoxDetail from "./GiftBoxDetail";
import { notFound } from "next/navigation";

/* ─── Safe image URL builder ─── */
function safeImageUrl(image: unknown): string | null {
  try {
    return urlFor(image).width(800).height(1000).url();
  } catch {
    return null;
  }
}

function safeThumbUrl(image: unknown): string | null {
  try {
    return urlFor(image).width(200).height(250).url();
  } catch {
    return null;
  }
}

const siteUrl = "https://beautasy.vercel.app";

export const revalidate = 30;

/* ─── GROQ query ─── */
const GIFT_BOX_BY_SLUG_QUERY = `*[_type == "giftBox" && slug.current == $slug][0] {
  _id,
  name,
  "slug": slug.current,
  images,
  price,
  description,
  stock,
  contentsNote,
  contents[]-> {
    _id,
    name,
    "slug": slug.current,
    images,
    price,
    category
  }
}`;

/* ─── Metadata ─── */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const giftBox = await sanityClient.fetch(GIFT_BOX_BY_SLUG_QUERY, { slug });
  if (!giftBox) {
    return { title: "Gift Box Not Found | Beautasy" };
  }

  const ogImage = giftBox.images?.[0]
    ? safeImageUrl(giftBox.images[0])
    : `${siteUrl}/beautasy-icon.png`;

  return {
    title: `${giftBox.name} | Beautasy Gift Boxes`,
    description: `${giftBox.name} — A curated gift box set from Beautasy. £${(giftBox.price / 100).toFixed(2)}`,
    openGraph: {
      title: `${giftBox.name} | Beautasy Gift Boxes`,
      description: `Curated gift box set from Beautasy.`,
      images: ogImage
        ? [{ url: ogImage, width: 800, height: 1000, alt: giftBox.name }]
        : [],
    },
  };
}

/* ─── Static params ─── */
export async function generateStaticParams() {
  try {
    const giftBoxes = await sanityClient.fetch(
      `*[_type == "giftBox"]{ "slug": slug.current }`
    );
    return giftBoxes
      .filter((gb: { slug?: string }) => gb.slug)
      .map((gb: { slug: string }) => ({ slug: gb.slug }));
  } catch {
    return [];
  }
}

/* ─── Page component ─── */
export default async function GiftBoxPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const giftBox = await sanityClient.fetch(GIFT_BOX_BY_SLUG_QUERY, { slug });

  if (!giftBox) {
    notFound();
  }

  // Resolve gift box images
  const resolvedImages =
    giftBox.images && giftBox.images.length > 0
      ? giftBox.images
          .map((img: unknown) => safeImageUrl(img))
          .filter((url: string | null): url is string => url !== null)
      : ["https://placehold.co/400x500/E6E6FA/4A4A4A?text=Gift+Box"];

  // Resolve included product images
  const resolvedContents = (giftBox.contents || []).map(
    (product: {
      _id: string;
      name: string;
      slug?: string;
      images?: unknown[];
      price: number;
      category: string;
    }) => {
      const productImage =
        product.images && product.images.length > 0
          ? safeThumbUrl(product.images[0])
          : null;

      return {
        _id: product._id,
        name: product.name,
        slug: product.slug || product._id,
        image:
          productImage ||
          "https://placehold.co/200x250/E6E6FA/4A4A4A?text=Product",
        price: product.price,
        category: product.category,
      };
    }
  );

  return (
    <GiftBoxDetail
      giftBox={{
        _id: giftBox._id,
        name: giftBox.name,
        slug: giftBox.slug,
        price: giftBox.price,
        images: resolvedImages,
        description: giftBox.description || [],
        stock: giftBox.stock ?? 0,
        contentsNote: giftBox.contentsNote || null,
        contents: resolvedContents,
      }}
    />
  );
}
