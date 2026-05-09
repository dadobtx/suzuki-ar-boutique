import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WishlistState {
  items: string[]; // SKU codes
  add: (sku: string) => void;
  remove: (sku: string) => void;
  toggle: (sku: string) => void;
  has: (sku: string) => boolean;
  clear: () => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (sku) =>
        set((s) => ({
          items: s.items.includes(sku) ? s.items : [...s.items, sku],
        })),
      remove: (sku) => set((s) => ({ items: s.items.filter((i) => i !== sku) })),
      toggle: (sku) => {
        const state = get();
        if (state.items.includes(sku)) {
          state.remove(sku);
        } else {
          state.add(sku);
        }
      },
      has: (sku) => get().items.includes(sku),
      clear: () => set({ items: [] }),
    }),
    { name: 'suzuki-wishlist' },
  ),
);
