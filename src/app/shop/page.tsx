import type { Metadata } from "next";
import { sanityClient, urlFor } from "@/lib/sanity";
import ShopContent from "./ShopContent";

const siteUrl = "https://beautasy.co.uk";

export const metadata: Metadata = {
  title: "Beautasy Shop — Handmade Lingerie & Accessories",
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
    images: [
      {
        url: `${siteUrl}/beautasy-icon.png`,
        width: 1200,
        height: 630,
        alt: "Beautasy Shop",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Beautasy Shop — Handmade Lingerie & Accessories",
    description:
      "Handmade silk lingerie and accessories crafted in Southampton.",
    images: [`${siteUrl}/beautasy-icon.png`],
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
  stock,
  availableSizes,
  "collection": collection->{ name, "slug": slug.current }
}`;

/* ─── Fallback products (used when Sanity has no data yet) ─── */
const fallbackProducts = [
  {
    _id: "ling-bralette-01",
    name: "Silk Bralette",
    slug: "silk-bralette",
    price: 3499,
    images: ["https://placehold.co/400x500/E6E6FA/4A4A4A?text=Bralette"],
    category: "Lingerie",
    availableSizes: [] as string[],
  },
  {
    _id: "ling-bodysuit-01",
    name: "Lace Bodysuit",
    slug: "lace-bodysuit",
    price: 4999,
    images: ["https://placehold.co/400x500/E6E6FA/4A4A4A?text=Bodysuit"],
    category: "Lingerie",
    availableSizes: [] as string[],
  },
  {
    _id: "ling-sleepset-01",
    name: "Cotton Sleep Set",
    slug: "cotton-sleep-set",
    price: 3999,
    images: ["https://placehold.co/400x500/E6E6FA/4A4A4A?text=Sleepwear"],
    category: "Lingerie",
    availableSizes: [] as string[],
  },
  {
    _id: "acc-tote-01",
    name: "Linen Tote Bag",
    slug: "linen-tote-bag",
    price: 2499,
    images: ["https://placehold.co/400x500/F5F0FF/4A4A4A?text=Tote"],
    category: "Accessories",
    availableSizes: [] as string[],
  },
  {
    _id: "acc-scrunchie-01",
    name: "Silk Scrunchie Set",
    slug: "silk-scrunchie-set",
    price: 1299,
    images: ["https://placehold.co/400x500/F5F0FF/4A4A4A?text=Scrunchies"],
    category: "Accessories",
    availableSizes: [] as string[],
  },
  {
    _id: "acc-pouch-01",
    name: "Embroidered Pouch",
    slug: "embroidered-pouch",
    price: 1899,
    images: ["https://placehold.co/400x500/F5F0FF/4A4A4A?text=Pouch"],
    category: "Accessories",
    availableSizes: [] as string[],
  },
  {
    _id: "home-cushion-01",
    name: "Lavender Cushion Cover",
    slug: "lavender-cushion-cover",
    price: 2999,
    images: ["https://placehold.co/400x500/FDFBF7/4A4A4A?text=Cushion"],
    category: "Home",
    availableSizes: [] as string[],
  },
  {
    _id: "home-runner-01",
    name: "Linen Table Runner",
    slug: "linen-table-runner",
    price: 3499,
    images: ["https://placehold.co/400x500/FDFBF7/4A4A4A?text=Runner"],
    category: "Home",
    availableSizes: [] as string[],
  },
  {
    _id: "home-sachet-01",
    name: "Lavender Sachet Set",
    slug: "lavender-sachet-set",
    price: 999,
    images: ["https://placehold.co/400x500/FDFBF7/4A4A4A?text=Sachets"],
    category: "Home",
    availableSizes: [] as string[],
  },
];

export const revalidate = 60; // revalidate every 60 seconds

export default async function ShopPage() {
  let products: typeof fallbackProducts = [];

  try {
    const sanityProducts = await sanityClient.fetch(PRODUCTS_QUERY);

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
          availableSizes?: string[];
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
                : ["https://placehold.co/400x500/E6E6FA/4A4A4A?text=Product"],
            category: p.category,
            availableSizes: p.availableSizes || [],
            collection: p.collection ?? null,
          };
        }
      );
    } else {
      products = fallbackProducts;
    }
  } catch {
    products = fallbackProducts;
  }

  return <ShopContent products={products} />;
}
