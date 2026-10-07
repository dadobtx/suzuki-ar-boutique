import { create } from 'zustand';
import type { HandCursorData, HandCursorEvent, HandFrameOutput } from '@/lib/hand-cursor';

export interface HandCursorStoreState {
  enabled: boolean;
  cursor: HandCursorData;
  lastEvent: HandCursorEvent | null;
  inferenceFps: number;
  p95: number;
  adaptiveTargetFps: number | 'auto';
  detectedHandsCount: number;
  userHandsCount: number;
  isBusy: boolean;
  pausedUntilMs: number;

  setBusy: (busy: boolean) => void;
  pause: (durationMs?: number) => void;
  updateFromOutput: (
    output: HandFrameOutput,
    metrics?: { fps?: number; p95?: number; adaptiveFps?: number | 'auto' },
  ) => void;
  clearLastEvent: () => void;
  setEnabled: (enabled: boolean) => void;
  reset: () => void;
}

const DEFAULT_CURSOR: HandCursorData = {
  active: false,
  x: 0.5,
  y: 0.5,
  index: 0,
  dwellProgress: 0,
  gesture: 'None',
};

export const useHandCursorStore = create<HandCursorStoreState>((set) => ({
  enabled: false,
  cursor: { ...DEFAULT_CURSOR },
  lastEvent: null,
  inferenceFps: 0,
  p95: 0,
  adaptiveTargetFps: 'auto',
  detectedHandsCount: 0,
  userHandsCount: 0,
  isBusy: false,
  pausedUntilMs: 0,

  setBusy: (busy: boolean) => set({ isBusy: busy }),

  pause: (durationMs = 2000) => set({ pausedUntilMs: Date.now() + durationMs }),

  updateFromOutput: (output, metrics) =>
    set((state) => ({
      cursor: output.cursor,
      detectedHandsCount: output.detectedHandsCount,
      userHandsCount: output.userHandsCount,
      lastEvent: output.events.length > 0 ? output.events[0] : state.lastEvent,
      inferenceFps: metrics?.fps ?? state.inferenceFps,
      p95: metrics?.p95 ?? state.p95,
      adaptiveTargetFps: metrics?.adaptiveFps ?? state.adaptiveTargetFps,
    })),

  clearLastEvent: () => set({ lastEvent: null }),

  setEnabled: (enabled: boolean) => set({ enabled }),

  reset: () =>
    set({
      cursor: { ...DEFAULT_CURSOR },
      lastEvent: null,
      inferenceFps: 0,
      p95: 0,
      adaptiveTargetFps: 'auto',
      detectedHandsCount: 0,
      userHandsCount: 0,
      isBusy: false,
      pausedUntilMs: 0,
    }),
}));
