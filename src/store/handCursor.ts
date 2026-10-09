import { create } from 'zustand';
import type { HandCursorData, HandCursorEvent, HandFrameOutput } from '@/lib/hand-cursor';

export interface HandCursorStoreState {
  enabled: boolean;
  cursor: HandCursorData;
  lastEvent: HandCursorEvent | null;
  inferenceFps: number;
  p95: number;
  gestureLatencyP95?: number;
  adaptiveTargetFps: number | 'auto';
  detectedHandsCount: number;
  userHandsCount: number;
  isBusy: boolean;
  pausedUntilMs: number;
  rackFocusIndex: number | null;

  setRackFocusIndex: (idx: number | null) => void;
  setBusy: (busy: boolean) => void;
  pause: (durationMs?: number) => void;
  updateFromOutput: (
    output: HandFrameOutput,
    metrics?: {
      fps?: number;
      p95?: number;
      gestureLatencyP95?: number;
      adaptiveFps?: number | 'auto';
    },
  ) => void;
  clearLastEvent: () => void;
  setEnabled: (enabled: boolean) => void;
  reset: () => void;
}

const DEFAULT_CURSOR: HandCursorData = {
  active: false,
  x: 0.5,
  y: 0.5,
  index: null,
  dwellProgress: 0,
  gesture: 'None',
  anchorX: null,
  displacement: 0,
  leverState: 'neutral',
  directionArrow: null,
  confirmProgress: 0,
  ownerReason: 'none',
  activeHandSide: 'None',
  handSwitchCount: 0,
  poseSide: 'None',
  classifierSide: 'None',
  indexSource: 'ninguno',
  isStepDisarmed: false,
  pulseArrow: null,
};

export const useHandCursorStore = create<HandCursorStoreState>((set) => ({
  enabled: false,
  cursor: { ...DEFAULT_CURSOR },
  lastEvent: null,
  inferenceFps: 0,
  p95: 0,
  gestureLatencyP95: 0,
  adaptiveTargetFps: 'auto',
  detectedHandsCount: 0,
  userHandsCount: 0,
  isBusy: false,
  pausedUntilMs: 0,
  rackFocusIndex: null,

  setRackFocusIndex: (idx: number | null) => set({ rackFocusIndex: idx }),
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
      gestureLatencyP95: metrics?.gestureLatencyP95 ?? state.gestureLatencyP95,
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
      gestureLatencyP95: 0,
      adaptiveTargetFps: 'auto',
      detectedHandsCount: 0,
      userHandsCount: 0,
      isBusy: false,
      pausedUntilMs: 0,
      rackFocusIndex: null,
    }),
}));
