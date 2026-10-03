import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WishlistItem {
  id: string;
  name: string;
  price: number; // pence
  image: string;
  slug: string;
  /** Present when the product requires a size selection before adding to cart */
  availableSizes?: string[];
  /**
   * How many colours the piece comes in, when it was saved. Missing on
   * anything saved before this was kept, and on gift boxes — the wishlist then
   * cannot know there is nothing to choose, and sends the shopper to the page.
   */
  colorCount?: number;
}

/**
 * A shop piece as the wishlist keeps it: the shop card and the product page
 * both save it through this, so both keep what "Add to Bag" on the wishlist
 * needs to know. The wishlist used to keep the sizes alone, so the Cloud
 * sleeping mask (four colours) went straight into the bag with no colour, and
 * checkout then refused the whole bag until she found the line and took it out.
 */
export function wishlistEntry(
  piece: {
    _id: string;
    name: string;
    price: number;
    slug: string;
    availableSizes?: string[] | null;
    colorCount?: number | null;
  },
  image: string
): WishlistItem {
  return {
    id: piece._id,
    name: piece.name,
    price: piece.price,
    image,
    slug: piece.slug,
    availableSizes: piece.availableSizes ?? [],
    ...(typeof piece.colorCount === "number" ? { colorCount: piece.colorCount } : {}),
  };
}

interface WishlistState {
  items: WishlistItem[];
  addItem: (item: WishlistItem) => void;
  removeItem: (id: string) => void;
  toggleItem: (item: WishlistItem) => void;
  isWishlisted: (id: string) => boolean;
  clearWishlist: () => void;
}

export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) =>
        set((state) => {
          if (state.items.some((i) => i.id === item.id)) return state;
          return { items: [...state.items, item] };
        }),

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),

      toggleItem: (item) => {
        const exists = get().items.some((i) => i.id === item.id);
        if (exists) {
          get().removeItem(item.id);
        } else {
          get().addItem(item);
        }
      },

      isWishlisted: (id) => get().items.some((i) => i.id === id),

      clearWishlist: () => set({ items: [] }),
    }),
    { name: "beautasy-wishlist" }
  )
);
