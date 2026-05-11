import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Garment } from '@/types/garment';

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
}

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
    }),
    {
      name: 'suzuki-ar-garment',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ activeGarmentId: state.activeGarmentId }), // Only persist activeGarmentId
    },
  ),
);
