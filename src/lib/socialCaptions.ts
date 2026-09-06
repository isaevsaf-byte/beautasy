import Anthropic from "@anthropic-ai/sdk";
import { productionTimeLabel } from "@/lib/productionTime";

/**
 * Writing the words that go under the picture.
 *
 * Two paths, and the templates are not a poor relation: they use the same
 * product fields a person would reach for, so a shop with no Anthropic key
 * still gets usable drafts. When `ANTHROPIC_API_KEY` is set the suggestions
 * are written by Claude in the shop's voice instead, and fall back to the
 * templates on any error — a caption suggestion is never worth failing a job
 * over.
 *
 * Nothing here publishes anything. These are drafts for Kristina to approve.
 */

export interface CaptionSource {
  name: string;
  category?: string;
  subcategory?: string;
  /** Pence, the way prices are stored throughout the shop */
  price?: number;
  color?: string;
  description?: string;
  madeToMeasureAvailable?: boolean;
  productionTime?: string;
  slug?: string;
}

const VOICE = `You write Instagram captions for Beautasy, a one-woman handmade lingerie
atelier in Southampton, England. Kristina makes everything herself.

Voice:
- British English. Warm, plain, unhurried. Written by the maker, not a brand team.
- Specific about craft — seams, fabric, fit, the hours involved — never vague adjectives like "stunning" or "gorgeous".
- Confident about price. Handmade costs what it costs; never apologise for it and never discount.
- No exclamation marks. No emoji unless one genuinely earns its place. No hashtags in the caption body.
- 20 to 60 words. First line has to work on its own, because that is all most people read.`;

function formatPrice(pence?: number): string | null {
  if (!pence || pence <= 0) return null;
  return `£${(pence / 100).toFixed(2).replace(/\.00$/, "")}`;
}

/**
 * Five angles on the same product, so there is something to choose between.
 * Each one opens differently on purpose — an approver picking between five
 * variations of one sentence is not really choosing.
 */
export function buildCaptionOptions(product: CaptionSource): string[] {
  const price = formatPrice(product.price);
  const what = product.name;
  const colour = product.color ? `${product.color.toLowerCase()} ` : "";
  const made = productionTimeLabel(product.productionTime);
  const madeTime = made ? ` Made to order in ${made}.` : "";

  const options = [
    // The maker's hands
    `${what}. Cut, sewn and finished here in Southampton, by one pair of hands.${madeTime}${
      price ? ` ${price}.` : ""
    }`,

    // How it feels rather than how it looks
    `Nothing about ${what.toLowerCase()} is rushed. The seams sit flat against skin because they were sewn to, not because a machine got lucky.${
      price ? ` ${price}.` : ""
    }`,

    // Made for a person, not a size chart
    product.madeToMeasureAvailable
      ? `${what} can be made to your measurements — the size chart is a starting point, not a verdict. Send your numbers and we will go from there.`
      : `${what}, in ${colour ? colour : "the "}shade that took three tries to get right. Small batch, because that is how much one person can sew.${
          price ? ` ${price}.` : ""
        }`,

    // Something to answer
    `Every ${what.toLowerCase()} takes an afternoon. Worth it, or would you rather have three of something machine-made? Genuine question — the answer decides what gets sewn next.`,

    // Straight offer, no dressing up
    `${what}${price ? ` — ${price}` : ""}. Handmade in Southampton, shipped anywhere in the UK. Link in bio.`,
  ];

  return options.map((o) => o.replace(/\s+/g, " ").trim());
}

const NICHE_TAGS: Record<string, string[]> = {
  Lingerie: ["#handmadelingerie", "#slowfashionuk", "#madetomeasure", "#lingerieaddict"],
  Kids: ["#handmadekidsclothes", "#slowkidsfashion", "#minicapsule"],
  Accessories: ["#handmadeaccessories", "#ukmakers", "#smallbatchmade"],
  Home: ["#handmadehome", "#slowliving", "#homedecoruk"],
};

const ALWAYS = ["#handmadeinbritain", "#southampton", "#supportsmallbusiness", "#beautasy"];

export function buildHashtags(product: CaptionSource): string {
  const niche = NICHE_TAGS[product.category ?? ""] ?? ["#handmadeuk"];
  return [...niche, ...ALWAYS].join(" ");
}

/**
 * The same five angles, written by Claude instead of filled into templates.
 * Returns null when there is no key or the call fails, so the caller can use
 * the templates without special-casing anything.
 */
export async function generateCaptionsWithClaude(
  product: CaptionSource
): Promise<string[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const price = formatPrice(product.price);
  const facts = [
    `Product: ${product.name}`,
    product.category ? `Category: ${product.category}` : null,
    product.subcategory ? `Subcategory: ${product.subcategory}` : null,
    price ? `Price: ${price}` : null,
    product.color ? `Colour: ${product.color}` : null,
    productionTimeLabel(product.productionTime)
      ? `Made to order in: ${productionTimeLabel(product.productionTime)}`
      : null,
    product.madeToMeasureAvailable ? "Can be made to the customer's measurements." : null,
    product.description ? `Description from the shop: ${product.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      system: VOICE,
      messages: [
        {
          role: "user",
          content: `Write five different Instagram captions for this piece. Each one has to take a
genuinely different angle — the maker's hands, how it feels to wear, made-to-measure,
a real question to the reader, and a plain offer. Do not write five versions of one caption.

${facts}

Return only the five captions, separated by a line containing exactly ---
No numbering, no titles, no commentary.`,
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const captions = text
      .split(/^\s*---\s*$/m)
      .map((c) => c.trim())
      .filter((c) => c.length > 20);

    return captions.length >= 2 ? captions.slice(0, 5) : null;
  } catch (error) {
    // A caption suggestion is a convenience. Losing it must not lose the draft.
    console.error("Could not write captions with Claude, using templates:", error);
    return null;
  }
}
