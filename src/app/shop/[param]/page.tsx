import type { Metadata } from "next";
import { Suspense } from "react";
import { sanityClient, urlFor } from "@/lib/sanity";
import ShopContent from "../ShopContent";
import ProductDetail from "./ProductDetail";
import { notFound } from "next/navigation";
import ShopLoading from "../loading";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";

/* ─── Safe image URL builder (won't crash on incomplete data) ─── */
function safeImageUrl(image: unknown): string | null {
  try {
    return urlFor(image).width(800).height(1000).url();
  } catch {
    return null;
  }
}

const siteUrl = "https://beautasy.co.uk";

export const revalidate = 60;

/* ─── Category maps ─── */
const categoryMap: Record<string, string> = {
  lingerie: "Lingerie",
  kids: "Kids",
  accessories: "Accessories",
  home: "Home",
  mini: "Kids",
};

const categoryMeta: Record<string, { title: string; description: string }> = {
  lingerie: {
    title: "Lingerie Collection | Beautasy",
    description:
      "Handmade silk bralettes, bodysuits, and sleepwear crafted with love in Southampton.",
  },
  kids: {
    title: "Mini Beautasy — Kids Collection",
    description:
      "Gentle, handmade clothing for little ones. Natural fabrics, made with care.",
  },
  accessories: {
    title: "Accessories & Bags | Beautasy",
    description:
      "Handmade tote bags, scrunchies, hair accessories, and pouches from Beautasy.",
  },
  home: {
    title: "Home Decor | Beautasy",
    description:
      "Handmade cushion covers, table runners, and lavender sachets for your home.",
  },
  mini: {
    title: "Mini Beautasy — Kids Collection",
    description:
      "Gentle, handmade clothing for little ones. Natural fabrics, made with care.",
  },
};

/* ─── GROQ queries ─── */
const CATEGORY_PRODUCTS_QUERY = `*[_type == "product" && category == $cat] | order(_createdAt desc) {
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

const PRODUCT_BY_SLUG_QUERY = `*[_type == "product" && slug.current == $slug][0] {
  _id,
  name,
  "slug": slug.current,
  images,
  price,
  description,
  category,
  stock,
  productBadges,
  handmadeDisclaimer,
  productionTime,
  availableSizes,
  sizePrices,
  "availableColors": availableColors[]{
    name,
    hex,
    "variantImage": variantImage.asset->url
  },
  careInstructions,
  shippingInfo,
  packagingInfo,
  giftBoxAvailable,
  giftBoxPrice,
  "collection": collection->{ name, "slug": slug.current, season },
  "sizeGuide": sizeGuide->{ name, notes, rows[]{ size, uk, eu, bust, waist, hips } },
  "giftCardPlaceholder": *[_type == "siteSettings"][0].giftCardPlaceholder
}`;

/* ─── Metadata ─── */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ param: string }>;
}): Promise<Metadata> {
  const { param } = await params;
  const key = param.toLowerCase();

  // Category metadata
  if (categoryMap[key]) {
    const meta = categoryMeta[key] || {
      title: "Shop | Beautasy",
      description: "Handmade lingerie, accessories, and more from Beautasy.",
    };
    return {
      title: meta.title,
      description: meta.description,
      openGraph: {
        title: meta.title,
        description: meta.description,
        images: [
          {
            url: `${siteUrl}/beautasy-icon.png`,
            width: 1200,
            height: 630,
            alt: meta.title,
          },
        ],
      },
    };
  }

  // Product metadata
  const product = await sanityClient.fetch(PRODUCT_BY_SLUG_QUERY, {
    slug: param,
  });
  if (!product) {
    return { title: "Product Not Found | Beautasy" };
  }

  const ogImage = product.images?.[0]
    ? safeImageUrl(product.images[0])
    : `${siteUrl}/beautasy-icon.png`;

  return {
    title: `${product.name} | Beautasy`,
    description: `${product.name} — Handmade ${product.category?.toLowerCase() || "product"} from Beautasy. £${(product.price / 100).toFixed(2)}`,
    alternates: { canonical: `${siteUrl}/shop/${param}` },
    openGraph: {
      title: `${product.name} | Beautasy`,
      description: `Handmade ${product.category?.toLowerCase() || "product"} from Beautasy.`,
      images: ogImage ? [{ url: ogImage, width: 800, height: 1000, alt: product.name }] : [],
    },
  };
}

/* ─── Static params ─── */
export async function generateStaticParams() {
  const categoryParams = [
    { param: "lingerie" },
    { param: "kids" },
    { param: "accessories" },
    { param: "home" },
    { param: "mini" },
  ];

  let productParams: { param: string }[] = [];
  try {
    const products = await sanityClient.fetch(
      `*[_type == "product"]{ "slug": slug.current }`
    );
    productParams = products
      .filter((p: { slug?: string }) => p.slug)
      .map((p: { slug: string }) => ({ param: p.slug }));
  } catch {
    // Fallback: no product static params
  }

  return [...categoryParams, ...productParams];
}

/* ─── Page component ─── */
// NOTE: we deliberately do NOT read searchParams here — doing so would force
// Next.js to render every product and category URL dynamically on every request,
// killing ISR. The ?category= subcategory filter is read client-side by ShopContent
// via useSearchParams(), which is fine because filtering is already client-side.
export default async function ShopParamPage({
  params,
}: {
  params: Promise<{ param: string }>;
}) {
  const { param } = await params;
  const key = param.toLowerCase();

  /* ── Category route ── */
  const sanityCategory = categoryMap[key];
  if (sanityCategory) {
    let products: {
      _id: string;
      name: string;
      slug: string;
      price: number;
      images: string[];
      category: string;
      subcategory?: string;
      availableSizes: string[];
    }[] = [];

    try {
      const sanityProducts = await sanityClient.fetch(CATEGORY_PRODUCTS_QUERY, {
        cat: sanityCategory,
      });

      if (sanityProducts && sanityProducts.length > 0) {
        products = sanityProducts.map(
          (p: {
            _id: string;
            name: string;
            slug?: string;
            price: number;
            images?: { asset?: { _ref: string } }[];
            category: string;
            subcategory?: string;
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
                  : [
                      "https://placehold.co/400x500/E6E6FA/4A4A4A?text=Product",
                    ],
              category: p.category,
              subcategory: p.subcategory,
              availableSizes: p.availableSizes || [],
              collection: p.collection ?? null,
            };
          }
        );
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      // products stays as [] — ShopContent will show the "Coming Soon" state
      // rather than crashing. Next.js will retry on next revalidation.
    }

    return (
      <>
        <HeaderWrapper />
        <Suspense fallback={<ShopLoading />}>
          <ShopContent
            products={products}
            activeCategory={key}
          />
        </Suspense>
        <FooterWrapper />
      </>
    );
  }

  /* ── Product detail route ── */
  const product = await sanityClient.fetch(PRODUCT_BY_SLUG_QUERY, {
    slug: param,
  });

  if (!product) {
    notFound();
  }

  // Resolve image URLs
  const resolvedImages =
    product.images && product.images.length > 0
      ? product.images
          .map((img: unknown) => safeImageUrl(img))
          .filter((url: string | null): url is string => url !== null)
      : ["https://placehold.co/400x500/E6E6FA/4A4A4A?text=Product"];

  /* ── JSON-LD Product structured data (Google rich snippets) ── */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: `Handmade ${product.category?.toLowerCase() || "product"} from Beautasy, crafted in Southampton, UK.`,
    image: resolvedImages,
    brand: { "@type": "Brand", name: "Beautasy" },
    offers: {
      "@type": "Offer",
      price: (product.price / 100).toFixed(2),
      priceCurrency: "GBP",
      availability:
        (product.stock ?? 0) > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url: `${siteUrl}/shop/${product.slug}`,
      seller: { "@type": "Organization", name: "Beautasy" },
    },
    url: `${siteUrl}/shop/${product.slug}`,
  };

  return (
    <>
      <HeaderWrapper />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductDetail
        product={{
          _id: product._id,
          name: product.name,
          slug: product.slug,
          price: product.price,
          images: resolvedImages,
          description: product.description || [],
          category: product.category,
          stock: product.stock ?? 0,
          productBadges: product.productBadges || [],
          handmadeDisclaimer: product.handmadeDisclaimer || "",
          productionTime: product.productionTime || "",
          availableSizes: product.availableSizes || [],
          sizePrices: product.sizePrices || [],
          availableColors: product.availableColors || [],
          careInstructions: product.careInstructions || null,
          shippingInfo: product.shippingInfo || null,
          packagingInfo: product.packagingInfo || null,
          giftBoxAvailable: product.giftBoxAvailable || false,
          giftBoxPrice: product.giftBoxPrice || 0,
          giftCardPlaceholder: product.giftCardPlaceholder || undefined,
          collection: product.collection || null,
          sizeGuide: product.sizeGuide || null,
        }}
      />
      <FooterWrapper />
    </>
  );
}
