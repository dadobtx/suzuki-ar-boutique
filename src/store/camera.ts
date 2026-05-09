import { create } from 'zustand';

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'error';

interface CameraState {
  // ── Session state (cleared on cleanup) ──
  status: CameraStatus;
  error: string | null;

  // ── Device info (persists between camera lifecycles) ──
  deviceId: string | null;
  deviceLabel: string | null;
  capabilities: MediaTrackCapabilities | null;
  settings: MediaTrackSettings | null;

  // ── Actions ──
  setStatus: (status: CameraStatus) => void;
  setDevice: (id: string, label: string) => void;
  setCapabilities: (caps: MediaTrackCapabilities) => void;
  setSettings: (s: MediaTrackSettings) => void;
  setError: (error: string | null) => void;

  /** Resets ONLY session state (status → idle, error → null).
   *  Device info (deviceId, label, capabilities, settings) is preserved. */
  resetSession: () => void;

  /** Full reset: clears everything including device info. */
  resetAll: () => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  // Session state
  status: 'idle',
  error: null,

  // Device info
  deviceId: null,
  deviceLabel: null,
  capabilities: null,
  settings: null,

  // Actions
  setStatus: (status) => set({ status }),
  setDevice: (deviceId, deviceLabel) => set({ deviceId, deviceLabel }),
  setCapabilities: (capabilities) => set({ capabilities }),
  setSettings: (settings) => set({ settings }),
  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),

  resetSession: () => set({ status: 'idle', error: null }),

  resetAll: () =>
    set({
      status: 'idle',
      error: null,
      deviceId: null,
      deviceLabel: null,
      capabilities: null,
      settings: null,
    }),
}));
