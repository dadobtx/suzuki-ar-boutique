export interface MediaPipeDebugState {
  status: 'loading' | 'ready' | 'error';
  statusStartTime: number;
  delegate: 'GPU' | 'CPU' | null;
  error: string | null;
  fps: number;
  landmarksCount: number;
  latency: number;
  modelVersion: string | null;
}

export interface PresenceDebugState {
  state: string;
  rawVisibility: number;
  rollingAvg: number;
  thresholds: {
    arrivingThreshold: number;
    leavingThreshold: number;
  };
  torsoDistance: number | null;
  historyLength: number;
}

export interface DebugTelemetry {
  mediapipe: MediaPipeDebugState;
  presence: PresenceDebugState;
}

/**
 * Mutable non-reactive telemetry object.
 * Only updated when isDebugMode() is true.
 * Polled by DiagnosticOverlay every 500ms.
 */
export const debugTelemetry: DebugTelemetry = {
  mediapipe: {
    status: 'loading',
    statusStartTime: Date.now(),
    delegate: null,
    error: null,
    fps: 0,
    landmarksCount: 0,
    latency: 0,
    modelVersion: null,
  },
  presence: {
    state: 'absent',
    rawVisibility: 0,
    rollingAvg: 0,
    thresholds: {
      arrivingThreshold: 0.6,
      leavingThreshold: 0.3,
    },
    torsoDistance: null,
    historyLength: 0,
  },
};

export function setMediaPipeStatus(
  status: 'loading' | 'ready' | 'error',
  delegate?: 'GPU' | 'CPU' | null,
  error?: string | null,
): void {
  if (debugTelemetry.mediapipe.status !== status) {
    debugTelemetry.mediapipe.status = status;
    debugTelemetry.mediapipe.statusStartTime = Date.now();
  }
  if (delegate !== undefined) {
    debugTelemetry.mediapipe.delegate = delegate;
  }
  if (error !== undefined) {
    debugTelemetry.mediapipe.error = error;
  }
}
