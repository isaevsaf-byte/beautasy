import type { Metadata } from "next";
import { sanityClient, urlFor } from "@/lib/sanity";
import ShopContent from "../ShopContent";
import { notFound } from "next/navigation";

/* ─── Safe image URL builder (won't crash on incomplete data) ─── */
function safeImageUrl(image: unknown): string | null {
    try {
        return urlFor(image).width(800).height(1000).url();
    } catch {
        return null;
    }
}

const siteUrl = "https://beautasy.vercel.app";

export const revalidate = 60; // revalidate every 60 seconds

// Map URL slugs to Sanity category values
const categoryMap: Record<string, string> = {
    lingerie: "Lingerie",
    kids: "Kids",
    accessories: "Accessories",
    home: "Home",
    // Backward-compatible alias
    mini: "Kids",
};

// Metadata for category pages
const categoryMeta: Record<string, { title: string; description: string }> = {
    lingerie: {
        title: "Lingerie Collection | Beautasy",
        description: "Handmade silk bralettes, bodysuits, and sleepwear crafted with love in Southampton.",
    },
    kids: {
        title: "Mini Beautasy — Kids Collection",
        description: "Gentle, handmade clothing for little ones. Natural fabrics, made with care.",
    },
    accessories: {
        title: "Accessories & Bags | Beautasy",
        description: "Handmade tote bags, scrunchies, hair accessories, and pouches from Beautasy.",
    },
    home: {
        title: "Home Decor | Beautasy",
        description: "Handmade cushion covers, table runners, and lavender sachets for your home.",
    },
    mini: {
        title: "Mini Beautasy — Kids Collection",
        description: "Gentle, handmade clothing for little ones. Natural fabrics, made with care.",
    },
};

export async function generateMetadata({
    params,
}: {
    params: Promise<{ category: string }>;
}): Promise<Metadata> {
    const { category } = await params;
    const meta = categoryMeta[category.toLowerCase()] || {
        title: "Shop | Beautasy",
        description: "Handmade lingerie, accessories, and more from Beautasy.",
    };

    return {
        title: meta.title,
        description: meta.description,
        openGraph: {
            title: meta.title,
            description: meta.description,
            images: [{ url: `${siteUrl}/beautasy-icon.png`, width: 1200, height: 630, alt: meta.title }],
        },
    };
}

export async function generateStaticParams() {
    return [
        { category: "lingerie" },
        { category: "kids" },
        { category: "accessories" },
        { category: "home" },
        // Backward-compatible alias
        { category: "mini" },
    ];
}

export default async function CategoryPage({
    params,
}: {
    params: Promise<{ category: string }>;
}) {
    const { category } = await params;
    const sanityCategory = categoryMap[category.toLowerCase()];

    if (!sanityCategory) {
        notFound();
    }

    const PRODUCTS_QUERY = `*[_type == "product" && category == $cat] | order(_createdAt desc) {
    _id,
    name,
    "slug": slug.current,
    images,
    price,
    category,
    stock
  }`;

    let products = [];

    try {
        const sanityProducts = await sanityClient.fetch(PRODUCTS_QUERY, { cat: sanityCategory });

        if (sanityProducts && sanityProducts.length > 0) {
            products = sanityProducts.map(
                (p: {
                    _id: string;
                    name: string;
                    price: number;
                    images?: { asset?: { _ref: string } }[];
                    category: string;
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
                        price: p.price,
                        images:
                            resolvedImages.length > 0
                                ? resolvedImages
                                : ["https://placehold.co/400x500/E6E6FA/4A4A4A?text=Product"],
                        category: p.category,
                    };
                }
            );
        }
    } catch (error) {
        console.error("Error fetching products:", error);
        // Fallback to empty array or specific error handling if needed
    }

    // We reuse ShopContent but pass filtered products.
    // Note: ShopContent has "Browse the Shelves" which shows all categories.
    // This is actually good for navigation!
    return <ShopContent products={products} activeCategory={category} />;
}
