import { sanityClient, urlFor } from "@/lib/sanity";
import ShopContent from "../ShopContent";
import { notFound } from "next/navigation";

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

    const PRODUCTS_QUERY = `*[_type == "product" && category == "${sanityCategory}"] | order(_createdAt desc) {
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
        const sanityProducts = await sanityClient.fetch(PRODUCTS_QUERY);

        if (sanityProducts && sanityProducts.length > 0) {
            products = sanityProducts.map(
                (p: {
                    _id: string;
                    name: string;
                    price: number;
                    images?: { asset: { _ref: string } }[];
                    category: string;
                }) => ({
                    _id: p._id,
                    name: p.name,
                    price: p.price,
                    images:
                        p.images && p.images.length > 0
                            ? p.images.map((image) =>
                                urlFor(image).width(800).height(1000).url()
                            )
                            : ["https://placehold.co/400x500/E6E6FA/4A4A4A?text=Product"],
                    category: p.category,
                })
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
