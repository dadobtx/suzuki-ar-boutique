import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'error';

export type CameraPhase =
  | 'idle'
  | 'enumerating'
  | 'selecting'
  | 'requesting'
  | 'playing'
  | 'ready'
  | 'error';

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
}

export interface CameraPhaseError {
  name: string;
  message: string;
}

interface CameraState {
  // ── Session state (cleared on cleanup) ──
  status: CameraStatus;
  error: string | null;

  // ── Diagnostic / phase state ──
  phase: CameraPhase;
  phaseStartTime: number;
  phaseError: CameraPhaseError | null;
  availableDevices: CameraDeviceInfo[];

  // ── Device info (persists between camera lifecycles) ──
  deviceId: string | null;
  deviceLabel: string | null;
  capabilities: MediaTrackCapabilities | null;
  settings: MediaTrackSettings | null;

  // ── Actions ──
  setStatus: (status: CameraStatus) => void;
  setPhase: (phase: CameraPhase, error?: CameraPhaseError | null) => void;
  setAvailableDevices: (devices: CameraDeviceInfo[]) => void;
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

export const useCameraStore = create<CameraState>()(
  persist(
    (set) => ({
      // Session state
      status: 'idle',
      error: null,

      // Diagnostic / phase state
      phase: 'idle',
      phaseStartTime: Date.now(),
      phaseError: null,
      availableDevices: [],

      // Device info
      deviceId: null,
      deviceLabel: null,
      capabilities: null,
      settings: null,

      // Actions
      setStatus: (status) => set({ status }),
      setPhase: (phase, error = null) =>
        set({
          phase,
          phaseStartTime: Date.now(),
          phaseError:
            error ??
            (phase === 'error'
              ? { name: 'CameraError', message: 'Unknown error' }
              : null),
        }),
      setAvailableDevices: (availableDevices) => set({ availableDevices }),
      setDevice: (deviceId, deviceLabel) => set({ deviceId, deviceLabel }),
      setCapabilities: (capabilities) => set({ capabilities }),
      setSettings: (settings) => set({ settings }),
      setError: (error) => set({ error, status: error ? 'error' : 'idle' }),

      resetSession: () =>
        set({
          status: 'idle',
          error: null,
          phase: 'idle',
          phaseStartTime: Date.now(),
          phaseError: null,
        }),

      resetAll: () =>
        set({
          status: 'idle',
          error: null,
          phase: 'idle',
          phaseStartTime: Date.now(),
          phaseError: null,
          availableDevices: [],
          deviceId: null,
          deviceLabel: null,
          capabilities: null,
          settings: null,
        }),
    }),
    {
      name: 'suzuki-camera-device',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        deviceId: state.deviceId,
        deviceLabel: state.deviceLabel,
        capabilities: state.capabilities,
        settings: state.settings,
      }),
    },
  ),
);
