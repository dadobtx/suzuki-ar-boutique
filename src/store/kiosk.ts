import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { usePhotoStore } from './photo';
import { useAnalyticsStore } from './analytics';
import { useGarmentStore } from './garment';
import { useSizingStore } from './sizing';

export type KioskState =
  | 'ATTRACT'
  | 'AWAKENING'
  | 'CALIBRATING'
  | 'TRYON'
  | 'PHOTO_COUNTDOWN'
  | 'AI_PROCESSING'
  | 'AI_ERROR'
  | 'SHARE_QR'
  | 'SHARE_QR_FALLBACK'
  | 'COOLDOWN';

interface KioskStore {
  state: KioskState;
  stateStartTime: number;
  transition: (newState: KioskState) => void;
  startCooldown: () => void;
  cancelCooldown: () => void;
  wakeUp: () => void;
  calibrationDone: () => void;
  reset: () => void;
  restartSession: () => void;
}

export const useKioskStore = create<KioskStore>()(
  persist(
    (set, get) => ({
      state: 'ATTRACT',
      stateStartTime: Date.now(),
      transition: (newState) => {
        const prev = get().state;
        const prevStart = get().stateStartTime;
        const now = Date.now();
        const durationInPrevMs = now - prevStart;

        // Analytics: every transition is a data point. Also start/end sessions
        // around the natural lifecycle of a user visit.
        const analytics = useAnalyticsStore.getState();

        // ATTRACT or COOLDOWN -> any active state = new session starts
        // Note: also handled by wakeUp(), but transition() can reach AWAKENING too.
        if (
          (prev === 'ATTRACT' || prev === 'COOLDOWN') &&
          newState !== 'ATTRACT' &&
          newState !== 'COOLDOWN' &&
          !analytics.currentSessionId
        ) {
          analytics.startSession();
        }

        // Track every state transition (with duration in previous state).
        analytics.track({
          type: 'state_transition',
          from: prev,
          to: newState,
          durationInPrevMs,
        });

        // Session ends when we land back in ATTRACT, with inferred outcome.
        if (newState === 'ATTRACT' && analytics.currentSessionId) {
          const lastDownload = analytics
            .query({
              type: 'photo_downloaded',
              sessionId: analytics.currentSessionId,
            })
            .pop();
          const lastPhoto = analytics
            .query({
              type: 'photo_generated',
              sessionId: analytics.currentSessionId,
            })
            .pop();
          const outcome = lastDownload
            ? 'photo_downloaded'
            : lastPhoto
              ? 'photo_taken'
              : 'abandoned';
          analytics.endSession(outcome);
        }

        if (newState === 'ATTRACT') {
          usePhotoStore.getState().clearPhoto();
        }
        set({ state: newState, stateStartTime: now });
      },
      startCooldown: () => set({ state: 'COOLDOWN', stateStartTime: Date.now() }),
      cancelCooldown: () => set({ state: 'TRYON', stateStartTime: Date.now() }),
      wakeUp: () => {
        const analytics = useAnalyticsStore.getState();
        if (!analytics.currentSessionId) analytics.startSession();
        set({ state: 'AWAKENING', stateStartTime: Date.now() });
      },
      calibrationDone: () => set({ state: 'TRYON', stateStartTime: Date.now() }),
      reset: () => {
        const analytics = useAnalyticsStore.getState();
        if (analytics.currentSessionId) analytics.endSession('abandoned');
        usePhotoStore.getState().clearPhoto();
        set({ state: 'ATTRACT', stateStartTime: Date.now() });
      },
      restartSession: () => restartSession(),
    }),
    {
      name: 'suzuki-ar-kiosk',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        state: state.state,
        stateStartTime: state.stateStartTime,
      }),
    },
  ),
);

/**
 * Restart session:
 * a. clearPhoto() del photo store,
 * b. clearGarment() y vaciar wishlist y filtros (line, category, sizes, colors) del garment store,
 * c. useSizingStore.getState().reset(),
 * d. transition('ATTRACT') — NO reset(), para que analytics cierre la sesión con su outcome real.
 */
export function restartSession() {
  // a. clearPhoto() del photo store
  usePhotoStore.getState().clearPhoto();

  // b. clearGarment() y vaciar wishlist y filtros (line, category, sizes, colors) del garment store
  const garmentStore = useGarmentStore.getState();
  garmentStore.clearGarment();
  garmentStore.clearWishlist();
  garmentStore.clearFilters();

  // c. useSizingStore.getState().reset()
  useSizingStore.getState().reset();

  // d. transition('ATTRACT') — NO reset(), para que analytics cierre la sesión con su outcome real
  useKioskStore.getState().transition('ATTRACT');
}
