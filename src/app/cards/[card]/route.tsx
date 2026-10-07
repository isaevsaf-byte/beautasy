import { SEWN_CARDS, sewnCardFor } from "@/lib/socialCard";
import { sewnCard } from "@/lib/sewnCard";

/**
 * The atelier's link-preview cards as files: /cards/atelier.png and one per
 * alteration page, /cards/<slug>.png — see src/lib/sewnCard.tsx. All of them
 * are drawn once at build time.
 *
 * Pages name them through sewnCardImages() in src/lib/socialCard.ts, with
 * ?v= and the card's version on the end: a new price or a new look is a new
 * address a chat app has not kept, while an address with an older version
 * still gets today's card rather than nothing.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return SEWN_CARDS.map((name) => ({ card: `${name}.png` }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ card: string }> }) {
  const { card } = await params;
  const content = card.endsWith(".png") ? sewnCardFor(card.slice(0, -".png".length)) : null;
  if (!content) return new Response("Not Found", { status: 404 });
  return sewnCard(content);
}
