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
                  ? { ...i, quantity: i.quantity + (item.quantity || 1) }
                  : i
              ),
            };
          }

          return {
            items: [...state.items, { ...item, quantity: item.quantity || 1 }],
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
            sameLine(i, key) ? { ...i, quantity } : i
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      totalPrice: () =>
        get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }),
    {
      name: "beautasy-cart",
    }
  )
);
