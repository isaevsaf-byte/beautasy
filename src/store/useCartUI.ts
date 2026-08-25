import { create } from "zustand";

/**
 * Open/closed state for the cart drawer, kept outside <Cart> so any component
 * can open it — the product page opens it right after "Add to Bag" so the
 * customer sees what happened. Deliberately not persisted: the drawer should
 * never be open on a fresh page load.
 */
interface CartUIState {
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

export const useCartUI = create<CartUIState>()((set) => ({
  isOpen: false,
  openCart: () => set({ isOpen: true }),
  closeCart: () => set({ isOpen: false }),
}));
