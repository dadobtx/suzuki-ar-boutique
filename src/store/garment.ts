import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Garment } from '@/types/garment';
import { useAnalyticsStore } from './analytics';
import { useSizingStore } from './sizing';
import { recomendarTallaGarment, resolverTallaElegida } from '@/lib/sizing';

export interface GarmentFilters {
  line: string;
  category: string | null;
  sizes: string[];
  colors: string[];
}

interface GarmentState {
  activeGarmentId: string | null;
  activeVariantId: string | null;
  catalog: Garment[];
  loading: boolean;
  error: string | null;
  runtime: {
    lastWarpLatencyMs: number | null;
    lastValidAnchors: number;
    lastTotalAnchors: number;
    lastEstimatedAnchors: number;
    trackingLostSustained: boolean;
  };
  setRuntime: (
    latency: number | null,
    valid: number,
    total: number,
    estimated: number,
    trackingLostSustained?: boolean,
  ) => void;
  loadCatalog: () => Promise<void>;
  selectGarment: (id: string | null) => void;
  selectVariant: (variantId: string | null) => void;
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
      activeVariantId: null,
      catalog: [],
      loading: false,
      error: null,
      runtime: {
        lastWarpLatencyMs: null,
        lastValidAnchors: 0,
        lastTotalAnchors: 0,
        lastEstimatedAnchors: 0,
        trackingLostSustained: false,
      },
      setRuntime: (
        lastWarpLatencyMs,
        lastValidAnchors,
        lastTotalAnchors,
        lastEstimatedAnchors,
        trackingLostSustained = false,
      ) =>
        set({
          runtime: {
            lastWarpLatencyMs,
            lastValidAnchors,
            lastTotalAnchors,
            lastEstimatedAnchors,
            trackingLostSustained,
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

      selectGarment: (id: string | null) => {
        let initialVariantId: string | null = null;
        // Analytics: track which garment was picked (interest signal).
        if (id) {
          const garment = useGarmentStore.getState().catalog.find((g) => g.id === id);
          if (garment) {
            if (garment.variants && garment.variants.length > 0) {
              initialVariantId = garment.variants[0]?.id ?? null;
            }
            useAnalyticsStore.getState().track({
              type: 'garment_selected',
              sku: garment.sku,
              line: garment.line,
              category: garment.category,
            });

            // Sizing: record 'probo' interaction
            const profile = useSizingStore.getState();
            if (profile.hasProfile) {
              const { recomendada, tabla_origen_id } = recomendarTallaGarment(
                profile,
                garment,
              );
              const elegida = resolverTallaElegida(profile, garment, recomendada);
              profile.recordInteraction(
                garment.sku,
                'probo',
                recomendada,
                elegida,
                tabla_origen_id,
              );
            }
          }
        }
        set({ activeGarmentId: id, activeVariantId: initialVariantId });
      },
      selectVariant: (variantId: string | null) => {
        const { activeGarmentId, activeVariantId, catalog } = useGarmentStore.getState();
        // Tocar el chip que ya está activo no es un cambio de cara: si se
        // trackea igual, infla el conteo de preferencia roja/negra.
        if (variantId === activeVariantId) return;
        if (activeGarmentId && variantId) {
          const garment = catalog.find((g) => g.id === activeGarmentId);
          if (garment) {
            useAnalyticsStore.getState().track({
              type: 'garment_variant_selected',
              sku: garment.sku,
              variantId,
            });
          }
        }
        set({ activeVariantId: variantId });
      },
      clearGarment: () => set({ activeGarmentId: null, activeVariantId: null }),

      filters: initialFilters,
      setFilter: (key, value) => {
        // Only track filters that map to user preference dimensions.
        if (key === 'sizes' || key === 'colors' || key === 'line' || key === 'category') {
          const values = Array.isArray(value)
            ? value
            : value === null
              ? []
              : [String(value)];
          useAnalyticsStore.getState().track({
            type: 'filter_applied',
            filterType: key === 'sizes' ? 'size' : key === 'colors' ? 'color' : key,
            values,
          });
        }
        set((state) => ({
          filters: { ...state.filters, [key]: value },
        }));
      },
      clearFilters: () => set({ filters: initialFilters }),

      wishlist: getInitialWishlist(),
      toggleWishlist: (sku) =>
        set((state) => {
          const isAdding = !state.wishlist.includes(sku);
          const newWishlist = isAdding
            ? [...state.wishlist, sku]
            : state.wishlist.filter((id) => id !== sku);
          try {
            localStorage.setItem('suzuki-wishlist', JSON.stringify(newWishlist));
          } catch {
            // Ignore storage errors
          }
          // Analytics: wishlist signal is one of the strongest interest indicators
          useAnalyticsStore.getState().track({
            type: isAdding ? 'garment_wishlisted' : 'garment_unwishlisted',
            sku,
          });

          // Sizing: record 'favorito' interaction (only on add)
          if (isAdding) {
            const profile = useSizingStore.getState();
            if (profile.hasProfile) {
              const garment = useGarmentStore
                .getState()
                .catalog.find((g) => g.sku === sku);
              if (garment) {
                const { recomendada, tabla_origen_id } = recomendarTallaGarment(
                  profile,
                  garment,
                );
                const elegida = profile.tallasElegidas[garment.sku] || recomendada;
                profile.recordInteraction(
                  garment.sku,
                  'favorito',
                  recomendada,
                  elegida,
                  tabla_origen_id,
                );
              }
            }
          }

          return { wishlist: newWishlist };
        }),
    }),
    {
      name: 'suzuki-ar-garment',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        activeGarmentId: state.activeGarmentId,
        activeVariantId: state.activeVariantId,
        filters: state.filters,
      }), // Persist activeGarmentId, activeVariantId and filters to sessionStorage
    },
  ),
);
