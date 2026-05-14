import { create } from 'zustand';

interface PhotoHistory {
  timestamp: string;
  sku: string;
  wishlistCode: string;
}

interface PhotoState {
  currentPhotoComposed: string | null;
  currentPhotoClean: string | null;
  currentWishlistCode: string | null;
  currentGarmentSku: string | null;
  history: PhotoHistory[];
  setPhoto: (composed: string, clean: string, wishlistCode: string, sku: string) => void;
  clearPhoto: () => void;
}

export const usePhotoStore = create<PhotoState>((set, get) => ({
  currentPhotoComposed: null,
  currentPhotoClean: null,
  currentWishlistCode: null,
  currentGarmentSku: null,
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
    });
  },
}));
