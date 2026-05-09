import { create } from 'zustand';

interface AppState {
  isKiosk: boolean;
  isPro: boolean;
  setKiosk: (v: boolean) => void;
  setPro: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isKiosk: false,
  isPro: false,
  setKiosk: (isKiosk) => set({ isKiosk }),
  setPro: (isPro) => set({ isPro }),
}));
