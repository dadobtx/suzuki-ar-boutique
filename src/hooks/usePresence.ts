import { useEffect, useState, useRef } from 'react';
import type { NormalizedLandmark } from '@/types/pose';
import { isDebugMode } from '@/lib/debug-mode';
import { debugTelemetry } from '@/lib/debug-mediapipe';

export type PresenceState = 'absent' | 'arriving' | 'present' | 'leaving';

/**
 * Landmark indices used for presence detection:
 * Nose (0), Left shoulder (11), Right shoulder (12), Left hip (23), Right hip (24).
 * Kiosk only frames head-to-waist so lower limbs are excluded.
 */
export const PRESENCE_LANDMARK_INDICES = [0, 11, 12, 23, 24] as const;

export const PRESENCE_ARRIVING_THRESHOLD = 0.6;
export const PRESENCE_LEAVING_THRESHOLD = 0.3;
export const PRESENCE_ROLLING_FRAMES = 10;
export const PRESENCE_ARRIVING_DELAY_MS = 1000;
export const PRESENCE_LEAVING_DELAY_MS = 1500;
export const PRESENCE_ABSENT_DELAY_MS = 5000;

export function usePresence(landmarks: NormalizedLandmark[] | null): PresenceState {
  const [state, setState] = useState<PresenceState>('absent');
  const stateRef = useRef<PresenceState>('absent');
  const visibilityHistory = useRef<number[]>([]);
  const stateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const absentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateState = (newState: PresenceState) => {
    stateRef.current = newState;
    setState(newState);
    if (isDebugMode()) {
      debugTelemetry.presence.state = newState;
    }
  };

  const lastLandmarks = useRef<NormalizedLandmark[] | null>(null);

  useEffect(() => {
    let avgVis = 0;
    // 1. Calculate average visibility and update history ONLY if landmarks changed
    if (landmarks !== lastLandmarks.current) {
      lastLandmarks.current = landmarks;

      if (landmarks && landmarks.length > 0) {
        const relevantLandmarks = PRESENCE_LANDMARK_INDICES.map(
          (idx) => landmarks[idx],
        ).filter((lm): lm is NormalizedLandmark => Boolean(lm));
        if (relevantLandmarks.length > 0) {
          avgVis =
            relevantLandmarks.reduce((sum, lm) => sum + (lm.visibility ?? 0), 0) /
            relevantLandmarks.length;
        }
      }

      // Keep rolling history of last 10 frames to smooth out single-frame glitches
      visibilityHistory.current.push(avgVis);
      if (visibilityHistory.current.length > PRESENCE_ROLLING_FRAMES) {
        visibilityHistory.current.shift();
      }
    }

    const rollingAvg =
      visibilityHistory.current.reduce((a, b) => a + b, 0) /
      Math.max(1, visibilityHistory.current.length);

    if (isDebugMode()) {
      let torsoDistance: number | null = null;
      if (landmarks && landmarks.length > 12 && landmarks[11] && landmarks[12]) {
        const dx = landmarks[11].x - landmarks[12].x;
        const dy = landmarks[11].y - landmarks[12].y;
        torsoDistance = Math.hypot(dx, dy);
      }
      debugTelemetry.presence = {
        state: stateRef.current,
        rawVisibility: avgVis,
        rollingAvg,
        thresholds: {
          arrivingThreshold: PRESENCE_ARRIVING_THRESHOLD,
          leavingThreshold: PRESENCE_LEAVING_THRESHOLD,
        },
        torsoDistance,
        historyLength: visibilityHistory.current.length,
      };
    }

    const currentState = stateRef.current;

    // 2. State Machine Transitions
    if (currentState === 'absent') {
      if (rollingAvg > PRESENCE_ARRIVING_THRESHOLD) {
        updateState('arriving');
      }
    } else if (currentState === 'arriving') {
      if (rollingAvg < PRESENCE_ARRIVING_THRESHOLD) {
        // False positive or left too fast
        if (stateTimer.current) {
          clearTimeout(stateTimer.current);
          stateTimer.current = null;
        }
        updateState('absent');
      } else {
        // Ensure timer is running
        if (!stateTimer.current) {
          stateTimer.current = setTimeout(() => {
            updateState('present');
            stateTimer.current = null;
          }, PRESENCE_ARRIVING_DELAY_MS); // 1s sustained
        }
      }
    } else if (currentState === 'present') {
      if (rollingAvg < PRESENCE_LEAVING_THRESHOLD) {
        // Ensure timer is running
        if (!stateTimer.current) {
          stateTimer.current = setTimeout(() => {
            updateState('leaving');
            stateTimer.current = null;
          }, PRESENCE_LEAVING_DELAY_MS); // 1.5s sustained
        }
      } else {
        // Recovered before timer finished
        if (stateTimer.current) {
          clearTimeout(stateTimer.current);
          stateTimer.current = null;
        }
      }
    } else if (currentState === 'leaving') {
      if (rollingAvg > PRESENCE_ARRIVING_THRESHOLD) {
        if (absentTimer.current) {
          clearTimeout(absentTimer.current);
          absentTimer.current = null;
        }
        updateState('present'); // Recovered
      } else {
        // Ensure timer is running
        if (!absentTimer.current) {
          absentTimer.current = setTimeout(() => {
            updateState('absent');
            absentTimer.current = null;
          }, PRESENCE_ABSENT_DELAY_MS); // 5s without recovering
        }
      }
    }
  }, [landmarks, state]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (stateTimer.current) clearTimeout(stateTimer.current);
      if (absentTimer.current) clearTimeout(absentTimer.current);
    };
  }, []);

  return state;
}
