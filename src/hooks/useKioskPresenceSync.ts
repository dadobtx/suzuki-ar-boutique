import { useEffect, useRef } from 'react';
import { useKioskStore } from '@/store/kiosk';
import type { PresenceState } from './usePresence';

export function useKioskPresenceSync(
  presence: PresenceState,
  hasProfile: boolean = true,
) {
  const state = useKioskStore((s) => s.state);
  const wakeUp = useKioskStore((s) => s.wakeUp);
  const startCooldown = useKioskStore((s) => s.startCooldown);
  const reset = useKioskStore((s) => s.reset);
  const transition = useKioskStore((s) => s.transition);

  const prevStateRef = useRef<PresenceState>(presence);
  const absentTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // If onboarding is active (!hasProfile), freeze transitions and stay in ATTRACT
    if (!hasProfile) {
      prevStateRef.current = presence;
      return;
    }

    const prev = prevStateRef.current;

    // Edge case: User finished onboarding (hasProfile=true), and presence is already 'present'
    if (presence === 'present' && (state === 'ATTRACT' || state === 'COOLDOWN')) {
      wakeUp();
    }
    // absent -> present from ATTRACT/COOLDOWN
    else if (prev === 'absent' && presence === 'present') {
      if (state === 'ATTRACT' || state === 'COOLDOWN') {
        wakeUp();
      }
    }

    // present -> absent from TRYON
    if (prev === 'present' && presence === 'absent') {
      if (state === 'TRYON') {
        // We wait 25s of absent state before going to COOLDOWN.
        // Wait, the presence hook itself has a 5s delay to declare "absent".
        // The spec says: "Cuando presence pasa present->absent desde TRYON, transiciona a COOLDOWN tras 25s de absent".
        // So we just start a 25s timer here. If presence becomes present again, we cancel it.
      }
    }

    prevStateRef.current = presence;
  }, [presence, state, wakeUp, hasProfile]);

  useEffect(() => {
    // Manage the 25s absent timer for TRYON
    if (state === 'TRYON') {
      if (presence === 'absent') {
        if (absentTimerRef.current === null) {
          absentTimerRef.current = window.setTimeout(() => {
            console.log('TIMER FIRED!');
            startCooldown();
          }, 25000);
        }
      } else {
        // If presence comes back (arriving or present), cancel timer
        if (absentTimerRef.current !== null) {
          window.clearTimeout(absentTimerRef.current);
          absentTimerRef.current = null;
        }
      }
    } else if (state === 'CALIBRATING') {
      // Si pose pierde visibility durante calibration -> vuelve a ATTRACT
      if (presence === 'absent') {
        reset();
      }
    } else if (state === 'PHOTO_COUNTDOWN') {
      if (presence === 'absent') {
        transition('TRYON');
      }
    } else {
      // Not in TRYON or CALIBRATING, clear timer if exists
      if (absentTimerRef.current !== null) {
        window.clearTimeout(absentTimerRef.current);
        absentTimerRef.current = null;
      }
    }

    return () => {
      if (absentTimerRef.current !== null) {
        console.log('CLEANUP FIRED! CLEARING TIMER');
        window.clearTimeout(absentTimerRef.current);
        absentTimerRef.current = null;
      }
    };
  }, [presence, state, startCooldown, reset, transition]);
}
