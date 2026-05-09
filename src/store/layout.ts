import { create } from 'zustand';

export type LayoutMode = 'landscape' | 'portrait';
export type LayoutSource = 'url' | 'media' | 'manual';

const STORAGE_KEY = 'suzuki-layout-override';

interface LayoutState {
  mode: LayoutMode;
  source: LayoutSource;
  setMode: (mode: LayoutMode, source: LayoutSource) => void;
  toggle: () => void;
}

function readSessionOverride(): LayoutMode | null {
  try {
    const val = sessionStorage.getItem(STORAGE_KEY);
    if (val === 'landscape' || val === 'portrait') return val;
  } catch {
    // sessionStorage unavailable
  }
  return null;
}

function writeSessionOverride(mode: LayoutMode): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // sessionStorage unavailable
  }
}

export const useLayoutStore = create<LayoutState>((set) => ({
  mode: readSessionOverride() ?? 'landscape',
  source: readSessionOverride() ? 'manual' : 'media',
  setMode: (mode, source) => {
    if (source === 'manual') writeSessionOverride(mode);
    set({ mode, source });
  },
  toggle: () =>
    set((s) => {
      const next: LayoutMode = s.mode === 'landscape' ? 'portrait' : 'landscape';
      writeSessionOverride(next);
      return { mode: next, source: 'manual' };
    }),
}));
