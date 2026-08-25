import { NextResponse } from "next/server";
import { sanityClient, urlFor } from "@/lib/sanity";
import { SITE_URL } from "@/lib/site";

// Always fetch fresh; Meta pulls this on its own schedule.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ─── GROQ: all products with a slug ─── */
const QUERY = `*[_type == "product" && defined(slug.current)] | order(_createdAt desc){
  _id,
  name,
  "slug": slug.current,
  price,
  description,
  category,
  gender,
  ageGroup,
  color,
  stock,
  images
}`;

interface SanityProduct {
  _id: string;
  name: string;
  slug: string;
  price: number; // pence
  description?: Array<{ children?: Array<{ text?: string }> }>;
  category?: string;
  gender?: string;
  ageGroup?: string;
  color?: string;
  stock?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  images?: any[];
}

/* Map Beautasy categories → Google product category (Meta accepts these too) */
const GOOGLE_CATEGORY: Record<string, string> = {
  Lingerie: "Apparel & Accessories > Clothing > Underwear & Socks",
  Kids: "Apparel & Accessories > Clothing > Baby & Toddler Clothing",
  Accessories: "Apparel & Accessories > Handbags, Wallets & Cases",
  Home: "Home & Garden > Decor",
};

/* Escape XML special characters */
function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* Portable-text → plain text */
function plainText(blocks: SanityProduct["description"], fallback: string): string {
  if (!Array.isArray(blocks)) return fallback;
  const text = blocks
    .map((b) => (b.children ?? []).map((c) => c.text ?? "").join(""))
    .join(" ")
    .trim();
  return text || fallback;
}

function buildItem(p: SanityProduct): string {
  const id = `BEAUTASY_${p.slug}`;
  const link = `${SITE_URL}/shop/${p.slug}`;
  const imageLink =
    p.images && p.images.length > 0
      ? urlFor(p.images[0]).width(1200).url()
      : `${SITE_URL}/beautasy-icon.png`;
  const price = `${(p.price / 100).toFixed(2)} GBP`;
  const availability = (p.stock ?? 0) > 0 ? "in stock" : "out of stock";
  const description = plainText(
    p.description,
    `Handmade ${(p.category ?? "product").toLowerCase()} by Beautasy, Southampton.`
  );
  const googleCat = GOOGLE_CATEGORY[p.category ?? ""] ?? "";

  const optional: string[] = [];
  if (googleCat) optional.push(`<g:google_product_category>${xml(googleCat)}</g:google_product_category>`);
  if (p.gender) optional.push(`<g:gender>${xml(p.gender)}</g:gender>`);
  if (p.ageGroup) optional.push(`<g:age_group>${xml(p.ageGroup)}</g:age_group>`);
  if (p.color) optional.push(`<g:color>${xml(p.color)}</g:color>`);

  return `    <item>
      <g:id>${xml(id)}</g:id>
      <g:title>${xml(p.name)}</g:title>
      <g:description>${xml(description)}</g:description>
      <g:link>${xml(link)}</g:link>
      <g:image_link>${xml(imageLink)}</g:image_link>
      <g:availability>${availability}</g:availability>
      <g:condition>new</g:condition>
      <g:price>${xml(price)}</g:price>
      <g:brand>Beautasy</g:brand>
${optional.map((o) => `      ${o}`).join("\n")}
    </item>`;
}

export async function GET() {
  const products: SanityProduct[] = await sanityClient.fetch(QUERY);

  const items = products.map(buildItem).join("\n");

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Beautasy Product Feed</title>
    <link>${SITE_URL}</link>
    <description>Handmade lingerie, kids&apos; clothing &amp; accessories</description>
${items}
  </channel>
</rss>`;

  return new NextResponse(feed, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
