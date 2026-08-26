import { NextRequest, NextResponse } from "next/server";
import { sanityClient, urlFor } from "@/lib/sanity";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * POST /api/sanity/product-changed — pushes one product straight into the Meta
 * catalogue when it is published in the Studio.
 *
 * The scheduled feed alone means waiting for Meta to come and fetch it, so a
 * piece published in the morning might not be taggable in Instagram until the
 * afternoon. This closes that gap: Sanity calls here on publish, and the item
 * is in the catalogue seconds later, ready to tag in a post or story.
 *
 * Needs META_CATALOG_ID and META_ACCESS_TOKEN. Without them the route is a
 * no-op that says so, and the scheduled feed keeps everything in sync anyway.
 */

const GRAPH_VERSION = "v21.0";

interface SanityWebhookBody {
  _id?: string;
  _type?: string;
  slug?: { current?: string } | string;
}

const PRODUCT_QUERY = `*[_id == $id][0]{
  _id, name, price, description, category, gender, ageGroup, color, stock,
  "slug": slug.current, images
}`;

interface FeedProduct {
  _id: string;
  name: string;
  price: number;
  slug: string;
  category?: string;
  gender?: string;
  ageGroup?: string;
  color?: string;
  description?: Array<{ children?: Array<{ text?: string }> }>;
  images?: unknown[];
}

function plainText(blocks: FeedProduct["description"]): string {
  if (!blocks) return "";
  return blocks
    .map((block) => (block.children ?? []).map((c) => c.text ?? "").join(""))
    .join(" ")
    .trim()
    .slice(0, 5000);
}

function imageUrl(image: unknown): string | null {
  try {
    return urlFor(image).width(1200).auto("format").url();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const catalogId = process.env.META_CATALOG_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!catalogId || !accessToken) {
    // Not an error: the scheduled feed still covers this, just more slowly
    return NextResponse.json({
      skipped: true,
      reason: "META_CATALOG_ID / META_ACCESS_TOKEN are not set — relying on the scheduled feed",
    });
  }

  let body: SanityWebhookBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!body._id) {
    return NextResponse.json({ error: "No document id" }, { status: 400 });
  }

  const product = (await sanityClient.fetch(PRODUCT_QUERY, { id: body._id })) as FeedProduct | null;

  // Deleted or unpublished — take it out of the catalogue
  if (!product?.slug) {
    const requests = [{ method: "DELETE", retailer_id: `BEAUTASY_${body._id}` }];
    await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${catalogId}/items_batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken, item_type: "PRODUCT_ITEM", requests }),
    });
    return NextResponse.json({ removed: body._id });
  }

  const images = (product.images ?? []).map(imageUrl).filter((u): u is string => !!u);

  const item = {
    method: "UPDATE",
    retailer_id: `BEAUTASY_${product.slug}`,
    data: {
      title: product.name,
      description: plainText(product.description) || product.name,
      link: `${SITE_URL}/shop/${product.slug}`,
      image_link: images[0],
      additional_image_link: images.slice(1, 10),
      // Made to order: never "out of stock", it just takes a few days
      availability: "in stock",
      condition: "new",
      price: `${(product.price / 100).toFixed(2)} GBP`,
      brand: "Beautasy",
      ...(product.color ? { color: product.color } : {}),
      ...(product.gender ? { gender: product.gender } : {}),
      ...(product.ageGroup ? { age_group: product.ageGroup } : {}),
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${catalogId}/items_batch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        item_type: "PRODUCT_ITEM",
        requests: [item],
      }),
    }
  );

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Meta catalogue sync failed:", result);
    return NextResponse.json({ error: "Catalogue sync failed", details: result }, { status: 502 });
  }

  return NextResponse.json({ synced: item.retailer_id, meta: result });
}
