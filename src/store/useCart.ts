import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  id: string;
  name: string;
  price: number; // price in pence (e.g. 2999 = £29.99)
  image: string;
  /** Used to build the Meta catalogue id (BEAUTASY_<slug>) for ad events */
  slug?: string;
  size?: string;
  color?: string;
  giftMessage?: string;
  /** Body measurements for a made-to-measure piece, already formatted */
  measurements?: string;
  quantity: number;
}

/**
 * The most of one line the bag will hold. Kristina sews these herself, so
 * eleven of one thing is a conversation, not a click: past ten the bag points
 * to WhatsApp instead. The checkout route takes whatever arrives, so the cap
 * lives here, where every way into the bag passes.
 */
export const MAX_PER_LINE = 10;

function clampQuantity(quantity: number): number {
  return Math.min(MAX_PER_LINE, quantity);
}

type ItemKey = { id: string; size?: string; color?: string; giftMessage?: string; measurements?: string };

function sameLine(a: ItemKey, b: ItemKey): boolean {
  return (
    a.id === b.id &&
    (a.size ?? "") === (b.size ?? "") &&
    (a.color ?? "") === (b.color ?? "") &&
    (a.giftMessage ?? "") === (b.giftMessage ?? "") &&
    (a.measurements ?? "") === (b.measurements ?? "")
  );
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (key: ItemKey) => void;
  updateQuantity: (key: ItemKey, quantity: number) => void;
  clearCart: () => void;
  /**
   * Puts back lines taken out by "Clear bag" (or one line's bin), keeping
   * anything added since. `at` is where they go back in: the top for a
   * cleared bag, the line's old place for one removed line.
   */
  restore: (lines: CartItem[], at?: number) => void;
  totalItems: () => number;
  totalPrice: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        set((state) => {
          const existing = state.items.find((i) => sameLine(i, item));

          if (existing) {
            return {
              items: state.items.map((i) =>
                sameLine(i, item)
                  ? { ...i, quantity: clampQuantity(i.quantity + (item.quantity || 1)) }
                  : i
              ),
            };
          }

          return {
            items: [...state.items, { ...item, quantity: clampQuantity(item.quantity || 1) }],
          };
        });
      },

      removeItem: (key) => {
        set((state) => ({
          items: state.items.filter((i) => !sameLine(i, key)),
        }));
      },

      updateQuantity: (key, quantity) => {
        if (quantity <= 0) {
          get().removeItem(key);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            sameLine(i, key) ? { ...i, quantity: clampQuantity(quantity) } : i
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      // "Clear bag" is one tap, and a made-to-measure line carries
      // measurements someone sat down and took. Undo hands the old lines
      // back: they go first (or at `at`), in their old order, and a piece
      // added in the seconds between is kept — on the same line, the
      // quantities add up, still no more than ten.
      restore: (lines, at = 0) => {
        set((state) => {
          const back = lines.map((line) => {
            const since = state.items.find((i) => sameLine(i, line));
            return since ? { ...line, quantity: clampQuantity(line.quantity + since.quantity) } : line;
          });
          const rest = state.items.filter((i) => !lines.some((line) => sameLine(i, line)));
          const place = Math.max(0, Math.min(at, rest.length));
          return { items: [...rest.slice(0, place), ...back, ...rest.slice(place)] };
        });
      },

      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      totalPrice: () =>
        get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }),
    {
      name: "beautasy-cart",
    }
  )
);
