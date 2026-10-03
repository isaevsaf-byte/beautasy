/**
 * What the button on a shop card does.
 *
 * A piece with a choice to make — a size or a colour — is sent to its page,
 * where the choice is asked for. Only a piece with nothing to choose goes
 * straight into the bag. The grid used to check sizes alone, so the Cloud
 * sleeping mask (four colours) and both scrunchies went into the bag with no
 * colour at all, and Kristina got an order she could not make up.
 *
 * `colorCount` comes from the listing's query. When a listing does not say,
 * the card cannot know there is nothing to choose, so it sends the customer to
 * the page, which does know — a wasted tap is cheaper than a wrong parcel.
 */

export interface CardChoices {
  availableSizes?: string[] | null;
  /** How many colours the piece comes in; undefined when the listing didn't say */
  colorCount?: number | null;
}

export type CardAction = { kind: "page"; label: string } | { kind: "add" };

export function cardAction(product: CardChoices): CardAction {
  if ((product.availableSizes ?? []).length > 0) return { kind: "page", label: "Choose Size" };
  if (product.colorCount == null) return { kind: "page", label: "View Options" };
  if (product.colorCount > 0) return { kind: "page", label: "Choose Colour" };
  return { kind: "add" };
}
