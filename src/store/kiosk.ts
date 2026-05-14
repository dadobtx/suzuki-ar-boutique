import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type KioskState = 'ATTRACT' | 'AWAKENING' | 'CALIBRATING' | 'TRYON' | 'COOLDOWN';

interface KioskStore {
  state: KioskState;
  stateStartTime: number;
  transition: (newState: KioskState) => void;
  startCooldown: () => void;
  cancelCooldown: () => void;
  wakeUp: () => void;
  calibrationDone: () => void;
  reset: () => void;
}

export const useKioskStore = create<KioskStore>()(
  persist(
    (set) => ({
      state: 'ATTRACT',
      stateStartTime: Date.now(),
      transition: (newState) => set({ state: newState, stateStartTime: Date.now() }),
      startCooldown: () => set({ state: 'COOLDOWN', stateStartTime: Date.now() }),
      cancelCooldown: () => set({ state: 'TRYON', stateStartTime: Date.now() }),
      wakeUp: () => set({ state: 'AWAKENING', stateStartTime: Date.now() }),
      calibrationDone: () => set({ state: 'TRYON', stateStartTime: Date.now() }),
      reset: () => set({ state: 'ATTRACT', stateStartTime: Date.now() }),
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
