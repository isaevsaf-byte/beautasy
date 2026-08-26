import { randomBytes } from "crypto";
import { sanityWriteClient } from "@/lib/sanity";

/**
 * Review-request links.
 *
 * Reviews used to require a Clerk account, which is why the shop had none: a
 * customer had to sign up, find the product again, and write something
 * unprompted. Instead we email a link a week or so after the order with a
 * secret token in it, so leaving a review is two clicks and the review can be
 * marked as a verified purchase.
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

/** Looks up the order a review-request link belongs to, or null. */
export async function findOrderByReviewToken(token: string): Promise<TokenOrder | null> {
  if (!token || token.length < 16 || token.length > 128) return null;

  // NB: the param is `reviewToken`, not `token` — the Sanity client reserves
  // `token` for auth, and using it here silently breaks the parameter types.
  const order = await sanityWriteClient.fetch(
    `*[_type == "order" && reviewToken == $reviewToken][0]{ _id, customerEmail, customerName, createdAt, "items": items[]{ productId, name, quantity } }`,
    { reviewToken: token }
  );
  return (order as TokenOrder | null) ?? null;
}

/** True when the order actually contains the product being reviewed. */
export function orderContainsProduct(order: TokenOrder, productId: string): boolean {
  return order.items?.some((item) => item.productId === productId) ?? false;
}
