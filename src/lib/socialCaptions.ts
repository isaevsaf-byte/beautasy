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

/**
 * How Kristina actually writes — taken from her own best-performing posts, not
 * from a style guide.
 *
 * The first version of this brief was written against her: no emoji, never
 * "gorgeous", no warmth that could be mistaken for a brand. Her posts that got
 * the most plays and comments do all three, and captions written to the old
 * brief were accurate, clever, and so unlike her that the drafts sat
 * unapproved. A caption the owner won't put her name to publishes nothing.
 */
const VOICE = `You write Instagram captions for Beautasy, a small studio in Southampton, England,
making handmade lingerie, pure silk accessories and cotton for kids. Kristina makes
everything herself, and every caption must read like one of her own posts.

How she writes — these are her real opening lines:
  "Saturday is here, the sun is shining, and there is absolutely no rush. ☀️"
  "Your hair care routine deserves a touch of luxury. 🤍"
  "Bespoke hair luxury, stitched just for you ✨🪡"

- Open with a feeling or a moment, not the product name.
- Warm, soft, a little luxurious. Speak to "you". "Our Southampton studio", "lovingly handmade".
- One to three emoji, at the end of a line. ✨ 🪡 🤍 ☁️ are hers. Never a row of them.
- Short paragraphs with a blank line between them. 30 to 70 words.
- Exactly one real detail from the description — the fabric, the gusset, a full metre of silk,
  OEKO-TEX® cotton. Never invent a detail the description does not give.
- British English. Price plainly at the end. No discounts, no urgency, no hashtags in the body.`;

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
    // The studio and the hands
    `Lovingly handmade in our Southampton studio ✨🪡

${what} — cut, stitched and finished by hand, one piece at a time.${madeTime}${
      price ? `\n\n${price} · link in bio 🤍` : "\n\nLink in bio 🤍"
    }`,

    // How it feels
    `Softness you can feel from the very first wear. ☁️

${what}, made to be worn all day and forgotten about — in the best way.${price ? `\n\n${price}` : ""}`,

    // Made for her, or a small treat
    product.madeToMeasureAvailable
      ? `Made just for you ✨

The size chart is only a starting point — ${what} can be stitched to your own measurements. Just send them with your order 🪡${price ? `\n\n${price}` : ""}`
      : `A little treat, just for you 🤍

${what}${colour ? ` in ${colour.trim()}` : ""}, handmade in small batches in our Southampton studio.${price ? `\n\n${price}` : ""}`,

    // A real question
    `What should we stitch next? 💭

${what} took an afternoon at the sewing machine. Tell us in the comments what you would love to see made next ✨`,

    // The plain offer
    `Now in the shop ✨

${what}${price ? ` — ${price}` : ""}. Handmade in Southampton and shipped across the UK 📦

Link in bio 🤍`,
  ];

  // Tidy spaces within a line but keep the blank lines between paragraphs —
  // they are part of how she writes, and Instagram shows them.
  return options.map((o) =>
    o
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
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
          content: `Write five different Instagram captions for this piece, in Kristina's voice. Each one
takes a genuinely different angle — the studio and her hands, how it feels to wear, made
to measure (or a small treat, if it cannot be), a real question to the reader, and a plain
"now in the shop". Do not write five versions of one caption.

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
