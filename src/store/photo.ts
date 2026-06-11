import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface PhotoHistory {
  timestamp: string;
  sku: string;
  wishlistCode: string;
}

export interface StylizedImage {
  styleId: string;
  status: 'pending' | 'success' | 'error';
  url?: string;
}

interface PhotoState {
  currentPhotoComposed: string | null;
  currentPhotoClean: string | null;
  currentWishlistCode: string | null;
  currentGarmentSku: string | null;
  aiGeneratedUrl: string | null;
  aiGenerationStatus: 'idle' | 'processing' | 'success' | 'error';
  aiGenerationError: string | null;
  aiDurationMs: number | null;
  stylizedImages: StylizedImage[];
  history: PhotoHistory[];
  setPhoto: (composed: string, clean: string, wishlistCode: string, sku: string) => void;
  setAiData: (data: {
    url?: string;
    status: 'idle' | 'processing' | 'success' | 'error';
    error?: string;
    durationMs?: number;
  }) => void;
  setStylizedImages: (images: StylizedImage[]) => void;
  updateStylizedImageStatus: (
    styleId: string,
    status: 'pending' | 'success' | 'error',
    url?: string,
  ) => void;
  clearPhoto: () => void;
}

export const usePhotoStore = create<PhotoState>()(
  persist(
    (set, get) => ({
      currentPhotoComposed: null,
      currentPhotoClean: null,
      currentWishlistCode: null,
      currentGarmentSku: null,
      aiGeneratedUrl: null,
      aiGenerationStatus: 'idle',
      aiGenerationError: null,
      aiDurationMs: null,
      stylizedImages: [],
      history: [],

      setPhoto: (composed, clean, wishlistCode, sku) => {
        const state = get();
        // Revoke previous URLs to free memory
        if (state.currentPhotoComposed?.startsWith('blob:'))
          URL.revokeObjectURL(state.currentPhotoComposed);
        if (state.currentPhotoClean?.startsWith('blob:'))
          URL.revokeObjectURL(state.currentPhotoClean);

        set({
          currentPhotoComposed: composed,
          currentPhotoClean: clean,
          currentWishlistCode: wishlistCode,
          currentGarmentSku: sku,
          stylizedImages: [], // Reset stylized images for new session
          history: [
            {
              timestamp: new Date().toISOString(),
              sku,
              wishlistCode,
            },
            ...state.history,
          ].slice(0, 50), // keep last 50
        });
      },

      clearPhoto: () => {
        const state = get();
        if (state.currentPhotoComposed?.startsWith('blob:'))
          URL.revokeObjectURL(state.currentPhotoComposed);
        if (state.currentPhotoClean?.startsWith('blob:'))
          URL.revokeObjectURL(state.currentPhotoClean);

        set({
          currentPhotoComposed: null,
          currentPhotoClean: null,
          currentWishlistCode: null,
          currentGarmentSku: null,
          aiGeneratedUrl: null,
          aiGenerationStatus: 'idle',
          aiGenerationError: null,
          aiDurationMs: null,
          stylizedImages: [], // Clear stylized images
        });
      },

      setAiData: (data) => {
        set((state) => ({
          aiGeneratedUrl: data.url !== undefined ? data.url : state.aiGeneratedUrl,
          aiGenerationStatus: data.status,
          aiGenerationError:
            data.error !== undefined ? data.error : state.aiGenerationError,
          aiDurationMs:
            data.durationMs !== undefined ? data.durationMs : state.aiDurationMs,
        }));
      },

      setStylizedImages: (images) => {
        set({ stylizedImages: images });
      },

      updateStylizedImageStatus: (styleId, status, url) => {
        set((state) => ({
          stylizedImages: state.stylizedImages.map((img) =>
            img.styleId === styleId ? { ...img, status, url: url ?? img.url } : img,
          ),
        }));
      },
    }),
    {
      name: 'suzuki-ar-photo',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist what survives a reload. Blob URLs are revoked and can't
      // be re-used — only persist the AI-generated HTTPS URL and the metadata
      // the share screen needs (wishlistCode, sku, timing).
      // Note: stylizedImages is deliberately omitted from partialize because
      // Replicate output URLs expire, and in a shared kiosk context we must prevent
      // leakage of style photos between separate sessions.
      partialize: (state) => ({
        currentWishlistCode: state.currentWishlistCode,
        currentGarmentSku: state.currentGarmentSku,
        aiGeneratedUrl: state.aiGeneratedUrl,
        aiDurationMs: state.aiDurationMs,
      }),
    },
  ),
);
