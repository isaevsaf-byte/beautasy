import { sanityClient, urlFor } from "@/lib/sanity";
import ShopContent from "./ShopContent";

/* ─── Sanity GROQ query ─── */
const PRODUCTS_QUERY = `*[_type == "product"] | order(_createdAt desc) {
  _id,
  name,
  "slug": slug.current,
  images,
  price,
  category,
  stock
}`;

/* ─── Fallback products (used when Sanity has no data yet) ─── */
const fallbackProducts = [
  {
    _id: "ling-bralette-01",
    name: "Silk Bralette",
    price: 3499,
    image: "https://placehold.co/400x500/E6E6FA/4A4A4A?text=Bralette",
    category: "Lingerie",
  },
  {
    _id: "ling-bodysuit-01",
    name: "Lace Bodysuit",
    price: 4999,
    image: "https://placehold.co/400x500/E6E6FA/4A4A4A?text=Bodysuit",
    category: "Lingerie",
  },
  {
    _id: "ling-sleepset-01",
    name: "Cotton Sleep Set",
    price: 3999,
    image: "https://placehold.co/400x500/E6E6FA/4A4A4A?text=Sleepwear",
    category: "Lingerie",
  },
  {
    _id: "acc-tote-01",
    name: "Linen Tote Bag",
    price: 2499,
    image: "https://placehold.co/400x500/F5F0FF/4A4A4A?text=Tote",
    category: "Accessories",
  },
  {
    _id: "acc-scrunchie-01",
    name: "Silk Scrunchie Set",
    price: 1299,
    image: "https://placehold.co/400x500/F5F0FF/4A4A4A?text=Scrunchies",
    category: "Accessories",
  },
  {
    _id: "acc-pouch-01",
    name: "Embroidered Pouch",
    price: 1899,
    image: "https://placehold.co/400x500/F5F0FF/4A4A4A?text=Pouch",
    category: "Accessories",
  },
  {
    _id: "home-cushion-01",
    name: "Lavender Cushion Cover",
    price: 2999,
    image: "https://placehold.co/400x500/FDFBF7/4A4A4A?text=Cushion",
    category: "Home",
  },
  {
    _id: "home-runner-01",
    name: "Linen Table Runner",
    price: 3499,
    image: "https://placehold.co/400x500/FDFBF7/4A4A4A?text=Runner",
    category: "Home",
  },
  {
    _id: "home-sachet-01",
    name: "Lavender Sachet Set",
    price: 999,
    image: "https://placehold.co/400x500/FDFBF7/4A4A4A?text=Sachets",
    category: "Home",
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
          price: number;
          images?: { asset: { _ref: string } }[];
          category: string;
        }) => ({
          _id: p._id,
          name: p.name,
          price: p.price,
          image:
            p.images && p.images.length > 0
              ? urlFor(p.images[0]).width(800).height(1000).url()
              : "https://placehold.co/400x500/E6E6FA/4A4A4A?text=Product",
          category: p.category,
        })
      );
    } else {
      products = fallbackProducts;
    }
  } catch {
    products = fallbackProducts;
  }

  return <ShopContent products={products} />;
}
