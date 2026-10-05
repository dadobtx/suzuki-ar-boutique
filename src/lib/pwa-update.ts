import { create } from 'zustand';
import { useEffect, useRef } from 'react';
import { useKioskStore } from '@/store/kiosk';
import type { PresenceState } from '@/hooks/usePresence';

/**
 * Pure function: determines if a pending PWA update should be applied.
 * Only returns true if the kiosk is in ATTRACT state, presence is 'absent',
 * and the user has been absent continuously for at least 10,000 ms.
 */
export function shouldApplyUpdate(
  kioskState: string,
  presence: string,
  absentSinceMs: number | null | undefined,
  now: number,
): boolean {
  if (kioskState !== 'ATTRACT') return false;
  if (presence !== 'absent') return false;
  if (absentSinceMs === null || absentSinceMs === undefined) return false;
  return now - absentSinceMs >= 10000;
}

interface PwaStoreState {
  updatePending: boolean;
  setUpdatePending: (pending: boolean) => void;
}

export const usePwaStore = create<PwaStoreState>((set) => ({
  updatePending: false,
  setUpdatePending: (pending) => set({ updatePending: pending }),
}));

let cleanedUp = false;

/**
 * Cleans up any registered Service Worker and deletes caches
 * when running outside kiosk mode (?kiosk=1 not present).
 * Executes once per page load, without blocking render.
 */
export function cleanupNonKioskServiceWorker(): void {
  if (cleanedUp || typeof window === 'undefined') return;
  cleanedUp = true;

  try {
    navigator.serviceWorker
      ?.getRegistrations()
      .then((registrations) => {
        registrations.forEach((r) => {
          r.unregister().catch((err) => {
            console.warn('[pwa] Failed to unregister service worker:', err);
          });
        });
      })
      .catch((err) => {
        console.warn('[pwa] Error getting service worker registrations:', err);
      });
  } catch {
    // Ignore environments where navigator.serviceWorker is restricted
  }

  try {
    caches
      ?.keys()
      .then((keys) => {
        keys.forEach((key) => {
          caches.delete(key).catch((err) => {
            console.warn('[pwa] Failed to delete cache:', err);
          });
        });
      })
      .catch((err) => {
        console.warn('[pwa] Error getting caches:', err);
      });
  } catch {
    // Ignore environments where caches is restricted
  }
}

let swRegistered = false;
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;

/**
 * Registers the Service Worker in kiosk mode with periodic update polling (every 5 min).
 * Sets updatePending = true when a new version is waiting to be applied.
 */
export function registerKioskSW(): void {
  if (swRegistered || typeof window === 'undefined') return;
  swRegistered = true;

  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      updateSWFn = registerSW({
        immediate: true,
        onRegisteredSW(_url, reg) {
          if (reg) {
            setInterval(
              () => {
                reg.update().catch((err) => {
                  console.warn('[pwa] SW periodic update check error:', err);
                });
              },
              5 * 60 * 1000,
            );
          }
        },
        onNeedRefresh() {
          usePwaStore.getState().setUpdatePending(true);
        },
      });
    })
    .catch((err) => {
      console.warn('[pwa] PWA registration failed:', err);
    });
}

/**
 * Applies the waiting Service Worker update and reloads the current page,
 * preserving the entire URL (origin, pathname, search params, and hash).
 */
export async function applyKioskUpdate(): Promise<void> {
  if (updateSWFn) {
    try {
      await updateSWFn(true);
      // Fallback reload if controllerchange event does not fire reload
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }, 2000);
      return;
    } catch (err) {
      console.warn('[pwa] updateSW failed, reloading directly:', err);
    }
  }
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

/**
 * Hook to automatically apply PWA updates when safe:
 * only in ATTRACT and with continuous absent presence for >= 10s.
 */
export function usePwaAutoUpdate(presence: PresenceState): void {
  const kioskState = useKioskStore((s) => s.state);
  const updatePending = usePwaStore((s) => s.updatePending);
  const absentSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (presence === 'absent') {
      if (absentSinceRef.current === null) {
        absentSinceRef.current = Date.now();
      }
    } else {
      absentSinceRef.current = null;
    }
  }, [presence]);

  useEffect(() => {
    if (!updatePending) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (shouldApplyUpdate(kioskState, presence, absentSinceRef.current, now)) {
        clearInterval(interval);
        applyKioskUpdate();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [updatePending, kioskState, presence]);
}
