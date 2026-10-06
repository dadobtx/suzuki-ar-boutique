import { create } from 'zustand';

export type SelectionUi = 'clasico' | 'perchero';
export type SelectionUiSource = 'session' | 'url' | 'env' | 'default' | 'manual';

export const SELECTION_UI_STORAGE_KEY = 'suzuki-selection-ui';

interface SelectionUiState {
  ui: SelectionUi;
  source: SelectionUiSource;
  setUi: (ui: SelectionUi, source?: SelectionUiSource) => void;
}

export function parseSelectionUi(val: string | null | undefined): SelectionUi | null {
  if (val === 'perchero' || val === 'clasico') {
    return val;
  }
  return null;
}

export function readSessionSelectionUi(): SelectionUi | null {
  try {
    const val = sessionStorage.getItem(SELECTION_UI_STORAGE_KEY);
    return parseSelectionUi(val);
  } catch {
    return null;
  }
}

export function writeSessionSelectionUi(ui: SelectionUi): void {
  try {
    sessionStorage.setItem(SELECTION_UI_STORAGE_KEY, ui);
  } catch {
    // sessionStorage unavailable
  }
}

export function readUrlSelectionUi(): SelectionUi | null {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }

  // 1. window.location.search (?ui=...)
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const val = parseSelectionUi(searchParams.get('ui'));
    if (val) return val;
  } catch {
    // Ignore URL parsing errors
  }

  // 2. window.location.hash (#/...?...&ui=...)
  try {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex));
      const val = parseSelectionUi(hashParams.get('ui'));
      if (val) return val;
    }
  } catch {
    // Ignore URL parsing errors
  }

  return null;
}

export function resolveConfiguredSelectionUi(): {
  ui: SelectionUi;
  source: SelectionUiSource;
} {
  // 1. sessionStorage
  const fromSession = readSessionSelectionUi();
  if (fromSession) {
    return { ui: fromSession, source: 'session' };
  }

  // 2. URL ?ui=
  const fromUrl = readUrlSelectionUi();
  if (fromUrl) {
    return { ui: fromUrl, source: 'url' };
  }

  // 3. Environment variable VITE_SELECTION_UI
  const envVal = parseSelectionUi(import.meta.env?.VITE_SELECTION_UI);
  if (envVal) {
    return { ui: envVal, source: 'env' };
  }

  // 4. Default fallback
  return { ui: 'clasico', source: 'default' };
}

export const useSelectionUiStore = create<SelectionUiState>((set) => {
  const initial = resolveConfiguredSelectionUi();
  return {
    ui: initial.ui,
    source: initial.source,
    setUi: (ui, source = 'manual') => {
      if (source === 'manual') {
        writeSessionSelectionUi(ui);
      }
      set({ ui, source });
    },
  };
});
