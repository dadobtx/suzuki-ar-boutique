import { create } from 'zustand';

export type LayoutMode = 'landscape' | 'portrait';

interface AppState {
  layout: LayoutMode;
  isKiosk: boolean;
  isPro: boolean;
  setLayout: (layout: LayoutMode) => void;
  toggleLayout: () => void;
  setKiosk: (v: boolean) => void;
  setPro: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  layout: 'landscape',
  isKiosk: false,
  isPro: false,
  setLayout: (layout) => set({ layout }),
  toggleLayout: () =>
    set((s) => ({ layout: s.layout === 'landscape' ? 'portrait' : 'landscape' })),
  setKiosk: (isKiosk) => set({ isKiosk }),
  setPro: (isPro) => set({ isPro }),
}));
