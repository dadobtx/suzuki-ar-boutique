import { create } from 'zustand';
import type { LiveTryOnManagerState } from '@/lib/liveTryon';

export interface LiveTryonTelemetry {
  managerState: LiveTryOnManagerState;
  connectionKey: string | null;
  activeCount: number;
  cooldownRemainingSec: number;
  lastError: string | null;
}

export const useLiveTryonStore = create<LiveTryonTelemetry>(() => ({
  managerState: 'idle',
  connectionKey: null,
  activeCount: 0,
  cooldownRemainingSec: 0,
  lastError: null,
}));
