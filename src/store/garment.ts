import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Garment } from '@/types/garment';

export interface GarmentFilters {
  line: string;
  category: string | null;
  sizes: string[];
  colors: string[];
}

interface GarmentState {
  activeGarmentId: string | null;
  catalog: Garment[];
  loading: boolean;
  error: string | null;
  runtime: {
    lastWarpLatencyMs: number | null;
    lastValidAnchors: number;
    lastTotalAnchors: number;
    lastEstimatedAnchors: number;
  };
  setRuntime: (
    latency: number | null,
    valid: number,
    total: number,
    estimated: number,
  ) => void;
  loadCatalog: () => Promise<void>;
  selectGarment: (id: string | null) => void;
  clearGarment: () => void;

  // Filters
  filters: GarmentFilters;
  setFilter: <K extends keyof GarmentFilters>(key: K, value: GarmentFilters[K]) => void;
  clearFilters: () => void;

  // Wishlist
  wishlist: string[];
  toggleWishlist: (sku: string) => void;
}

const getInitialWishlist = (): string[] => {
  try {
    const stored = localStorage.getItem('suzuki-wishlist');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const initialFilters: GarmentFilters = {
  line: 'Todas',
  category: null,
  sizes: [],
  colors: [],
};

export const useGarmentStore = create<GarmentState>()(
  persist(
    (set) => ({
      activeGarmentId: null,
      catalog: [],
      loading: false,
      error: null,
      runtime: {
        lastWarpLatencyMs: null,
        lastValidAnchors: 0,
        lastTotalAnchors: 0,
        lastEstimatedAnchors: 0,
      },
      setRuntime: (
        lastWarpLatencyMs,
        lastValidAnchors,
        lastTotalAnchors,
        lastEstimatedAnchors,
      ) =>
        set({
          runtime: {
            lastWarpLatencyMs,
            lastValidAnchors,
            lastTotalAnchors,
            lastEstimatedAnchors,
          },
        }),

      loadCatalog: async () => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}catalog.json`);
          if (!response.ok) {
            throw new Error(`Failed to load catalog: ${response.statusText}`);
          }
          const catalog = await response.json();
          set({ catalog, loading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : String(error),
            loading: false,
          });
        }
      },

      selectGarment: (id: string | null) => set({ activeGarmentId: id }),
      clearGarment: () => set({ activeGarmentId: null }),

      filters: initialFilters,
      setFilter: (key, value) =>
        set((state) => ({
          filters: { ...state.filters, [key]: value },
        })),
      clearFilters: () => set({ filters: initialFilters }),

      wishlist: getInitialWishlist(),
      toggleWishlist: (sku) =>
        set((state) => {
          const newWishlist = state.wishlist.includes(sku)
            ? state.wishlist.filter((id) => id !== sku)
            : [...state.wishlist, sku];
          try {
            localStorage.setItem('suzuki-wishlist', JSON.stringify(newWishlist));
          } catch {
            // Ignore storage errors
          }
          return { wishlist: newWishlist };
        }),
    }),
    {
      name: 'suzuki-ar-garment',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        activeGarmentId: state.activeGarmentId,
        filters: state.filters,
      }), // Persist activeGarmentId and filters to sessionStorage
    },
  ),
);
