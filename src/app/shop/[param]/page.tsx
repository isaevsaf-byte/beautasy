import type { Metadata } from "next";
import { sanityClient, urlFor } from "@/lib/sanity";
import ShopContent from "../ShopContent";
import ProductDetail from "./ProductDetail";
import { notFound } from "next/navigation";
import HeaderWrapper from "@/components/HeaderWrapper";
import FooterWrapper from "@/components/FooterWrapper";
import { SITE_URL } from "@/lib/site";
import { getSiteSettings, DEFAULT_UK_RATE } from "@/lib/siteSettings";

/* ─── Safe image URL builder (won't crash on incomplete data) ─── */
function safeImageUrl(image: unknown): string | null {
  try {
    return urlFor(image).width(800).height(1000).url();
  } catch {
    return null;
  }
}

const siteUrl = SITE_URL;

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
  sizeStock,
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
  madeToMeasureAvailable,
  madeToMeasurePrice,
  "collectionId": collection._ref,
  "collection": collection->{ name, "slug": slug.current, season },
  "sizeGuide": sizeGuide->{ name, notes, rows[]{ size, uk, eu, bust, waist, hips } },
  "giftCardPlaceholder": *[_type == "siteSettings"][0].giftCardPlaceholder
}`;

/* Approved reviews — fetched server-side so the text is in the HTML (and so we
   can publish an aggregateRating, which is what puts stars in Google results) */
const REVIEWS_QUERY = `*[_type == "review" && product._ref == $id && approved == true] | order(createdAt desc) {
  _id, userName, rating, comment, createdAt, verifiedPurchase,
  "images": images[].asset->url
}`;

/* Related products: same collection first, then same category to fill remaining slots */
const RELATED_BY_COLLECTION_QUERY = `*[_type == "product" && _id != $id && collection._ref == $collectionId] | order(_createdAt desc) [0...4] {
  _id, name, "slug": slug.current, images, price, category
}`;

const RELATED_BY_CATEGORY_QUERY = `*[_type == "product" && _id != $id && category == $category] | order(_createdAt desc) [0...8] {
  _id, name, "slug": slug.current, images, price, category
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
// Filters are read here on the server. They used to be read client-side to keep
// these pages static, but that made Next prerender the Suspense skeleton instead
// of the product grid — the catalogue was invisible to search engines. Category
// pages are worth far more indexed than statically cached.
export default async function ShopParamPage({
  params,
  searchParams,
}: {
  params: Promise<{ param: string }>;
  searchParams: Promise<{ category?: string; sort?: string; size?: string; ready?: string }>;
}) {
  const { param } = await params;
  const filters = await searchParams;
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
      stock?: number;
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
            stock?: number;
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
              stock: p.stock ?? 0,
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
        <ShopContent
          products={products}
          activeCategory={key}
          basePath={`/shop/${key}`}
          filters={filters}
        />
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

  /* ── Related products: same collection first, falls back to same category ── */
  let relatedProducts: {
    _id: string;
    name: string;
    slug: string;
    price: number;
    image: string;
    category: string;
  }[] = [];
  try {
    type RawRelated = { _id: string; name: string; slug?: string; images?: unknown[]; price: number; category: string };

    const byCollection: RawRelated[] = product.collectionId
      ? await sanityClient.fetch(RELATED_BY_COLLECTION_QUERY, {
          id: product._id,
          collectionId: product.collectionId,
        })
      : [];

    const seen = new Set(byCollection.map((p) => p._id));
    let combined = byCollection;

    if (combined.length < 4) {
      const byCategory: RawRelated[] = await sanityClient.fetch(RELATED_BY_CATEGORY_QUERY, {
        id: product._id,
        category: product.category,
      });
      const fill = byCategory.filter((p) => !seen.has(p._id));
      combined = [...combined, ...fill];
    }

    relatedProducts = combined.slice(0, 4).map((p) => ({
      _id: p._id,
      name: p.name,
      slug: p.slug || p._id,
      price: p.price,
      image:
        p.images && p.images.length > 0
          ? safeImageUrl(p.images[0]) || "https://placehold.co/400x500/E6E6FA/4A4A4A?text=Product"
          : "https://placehold.co/400x500/E6E6FA/4A4A4A?text=Product",
      category: p.category,
    }));
  } catch (error) {
    console.error("Error fetching related products:", error);
  }

  /* ── Approved reviews ── */
  let reviews: {
    _id: string;
    userName: string;
    rating: number;
    comment: string;
    createdAt: string;
    images?: string[];
    verifiedPurchase?: boolean;
  }[] = [];
  try {
    reviews = await sanityClient.fetch(REVIEWS_QUERY, { id: product._id });
  } catch (error) {
    console.error("Error fetching reviews:", error);
  }
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  /* ── JSON-LD Product structured data (Google rich snippets) ── */
  // The delivery rate lives in Site Settings; a hardcoded figure here drifts
  // from what checkout charges, and that mismatch is what Merchant Center flags.
  const siteSettings = await getSiteSettings();
  const ukRate = siteSettings.shipping?.ukRate ?? DEFAULT_UK_RATE;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: `Handmade ${product.category?.toLowerCase() || "product"} from Beautasy, crafted in Southampton, UK.`,
    image: resolvedImages,
    brand: { "@type": "Brand", name: "Beautasy" },
    sku: product._id,
    ...(product.availableColors?.[0]?.name ? { color: product.availableColors[0].name } : {}),
    offers: {
      "@type": "Offer",
      price: (product.price / 100).toFixed(2),
      priceCurrency: "GBP",
      // Made-to-order: nothing is ever truly out of stock, it just takes longer
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      url: `${siteUrl}/shop/${product.slug}`,
      seller: { "@type": "Organization", name: "Beautasy" },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: (ukRate / 100).toFixed(2),
          currency: "GBP",
        },
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: "GB",
        },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: {
            "@type": "QuantitativeValue",
            minValue: 3,
            maxValue: 5,
            unitCode: "DAY",
          },
          transitTime: {
            "@type": "QuantitativeValue",
            minValue: 3,
            maxValue: 5,
            unitCode: "DAY",
          },
        },
      },
    },
    ...(reviews.length > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: averageRating.toFixed(1),
            reviewCount: reviews.length,
            bestRating: 5,
            worstRating: 1,
          },
          review: reviews.slice(0, 10).map((r) => ({
            "@type": "Review",
            author: { "@type": "Person", name: r.userName },
            datePublished: r.createdAt,
            reviewBody: r.comment,
            reviewRating: {
              "@type": "Rating",
              ratingValue: r.rating,
              bestRating: 5,
              worstRating: 1,
            },
          })),
        }
      : {}),
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
          sizeStock: product.sizeStock || [],
          availableColors: product.availableColors || [],
          careInstructions: product.careInstructions || null,
          shippingInfo: product.shippingInfo || null,
          packagingInfo: product.packagingInfo || null,
          giftBoxAvailable: product.giftBoxAvailable || false,
          giftBoxPrice: product.giftBoxPrice || 0,
          madeToMeasureAvailable: product.madeToMeasureAvailable || false,
          madeToMeasurePrice: product.madeToMeasurePrice || 0,
          giftCardPlaceholder: product.giftCardPlaceholder || undefined,
          collection: product.collection || null,
          sizeGuide: product.sizeGuide || null,
        }}
        relatedProducts={relatedProducts}
        reviews={reviews}
        averageRating={averageRating}
      />
      <FooterWrapper />
    </>
  );
}
