import { useEffect, useState, useRef } from 'react';
import type { NormalizedLandmark } from '@/hooks/usePose';

export type PresenceState = 'absent' | 'arriving' | 'present' | 'leaving';

export function usePresence(landmarks: NormalizedLandmark[] | null): PresenceState {
  const [state, setState] = useState<PresenceState>('absent');
  const stateRef = useRef<PresenceState>('absent');
  const visibilityHistory = useRef<number[]>([]);
  const stateTimer = useRef<NodeJS.Timeout | null>(null);
  const absentTimer = useRef<NodeJS.Timeout | null>(null);

  const updateState = (newState: PresenceState) => {
    stateRef.current = newState;
    setState(newState);
  };

  const lastLandmarks = useRef<NormalizedLandmark[] | null>(null);

  useEffect(() => {
    // 1. Calculate average visibility and update history ONLY if landmarks changed
    if (landmarks !== lastLandmarks.current) {
      lastLandmarks.current = landmarks;

      let avgVis = 0;
      if (landmarks && landmarks.length > 0) {
        avgVis =
          landmarks.reduce((sum, lm) => sum + (lm.visibility ?? 0), 0) / landmarks.length;
      }

      // Keep rolling history of last 10 frames to smooth out single-frame glitches
      visibilityHistory.current.push(avgVis);
      if (visibilityHistory.current.length > 10) {
        visibilityHistory.current.shift();
      }
    }

    const rollingAvg =
      visibilityHistory.current.reduce((a, b) => a + b, 0) /
      Math.max(1, visibilityHistory.current.length);

    const currentState = stateRef.current;

    // 2. State Machine Transitions
    if (currentState === 'absent') {
      if (rollingAvg > 0.6) {
        updateState('arriving');
      }
    } else if (currentState === 'arriving') {
      if (rollingAvg < 0.6) {
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
          }, 1000); // 1s sustained
        }
      }
    } else if (currentState === 'present') {
      if (rollingAvg < 0.3) {
        // Ensure timer is running
        if (!stateTimer.current) {
          stateTimer.current = setTimeout(() => {
            updateState('leaving');
            stateTimer.current = null;
          }, 1500); // 1.5s sustained
        }
      } else {
        // Recovered before timer finished
        if (stateTimer.current) {
          clearTimeout(stateTimer.current);
          stateTimer.current = null;
        }
      }
    } else if (currentState === 'leaving') {
      if (rollingAvg > 0.6) {
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
          }, 5000); // 5s without recovering
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
