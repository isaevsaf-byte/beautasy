import { randomBytes } from "crypto";
import { sanityWriteClient } from "@/lib/sanity";
import { fingerprint } from "@/lib/secrets";

/**
 * Review-request links.
 *
 * Reviews used to require a Clerk account, which is why the shop had none: a
 * customer had to sign up, find the product again, and write something
 * unprompted. Instead we email a link a week or so after the order with a
 * secret token in it, so leaving a review is two clicks and the review can be
 * marked as a verified purchase.
 *
 * The token is what proves the purchase, so the order stores only a keyed
 * fingerprint of it — Sanity's dataset is public on this plan, and a readable
 * token is a "verified purchase" badge anyone can print. See @/lib/secrets.
 */

export interface TokenOrder {
  _id: string;
  customerEmail?: string;
  customerName?: string;
  createdAt: string;
  items: {
    productId?: string;
    name: string;
    quantity: number;
  }[];
}

export function generateReviewToken(): string {
  return randomBytes(24).toString("base64url");
}

/** What the order stores in place of the token itself. */
export function reviewTokenFingerprint(token: string): string {
  return fingerprint(token);
}

/** Looks up the order a review-request link belongs to, or null. */
export async function findOrderByReviewToken(token: string): Promise<TokenOrder | null> {
  if (!token || token.length < 16 || token.length > 128) return null;

  // NB: the param is `reviewToken`, not `token` — the Sanity client reserves
  // `token` for auth, and using it here silently breaks the parameter types.
  const order = await sanityWriteClient.fetch(
    `*[_type == "order" && reviewTokenFingerprint == $reviewToken][0]{ _id, customerEmail, customerName, createdAt, "items": items[]{ productId, name, quantity } }`,
    { reviewToken: reviewTokenFingerprint(token) }
  );
  return (order as TokenOrder | null) ?? null;
}

/** True when the order actually contains the product being reviewed. */
export function orderContainsProduct(order: TokenOrder, productId: string): boolean {
  return order.items?.some((item) => item.productId === productId) ?? false;
}
