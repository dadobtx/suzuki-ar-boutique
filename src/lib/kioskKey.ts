const KIOSK_KEY_STORAGE = 'suzuki_kiosk_key';

/**
 * Reads the kiosk key from URL query (?k=...), persists it to localStorage,
 * and returns it for authenticating live try-on requests with the backend.
 * Returns null if no key is found or if storage access fails.
 */
export function getKioskKey(): string | null {
  try {
    if (typeof window === 'undefined') return null;

    // 1. Check URL param ?k=
    if (window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const urlKey = params.get('k');
      if (urlKey) {
        try {
          localStorage.setItem(KIOSK_KEY_STORAGE, urlKey);
        } catch {
          // localStorage not available or restricted
        }
        return urlKey;
      }
    }

    // 2. Check localStorage
    try {
      const stored = localStorage.getItem(KIOSK_KEY_STORAGE);
      if (stored) return stored;
    } catch {
      // localStorage read error
    }

    // 3. Fallback for testing / dev if VITE_DEV_KIOSK_KEY is configured
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.VITE_DEV_KIOSK_KEY) {
        return import.meta.env.VITE_DEV_KIOSK_KEY;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function setKioskKey(key: string): void {
  try {
    localStorage.setItem(KIOSK_KEY_STORAGE, key);
  } catch {
    // ignore
  }
}

export function clearKioskKey(): void {
  try {
    localStorage.removeItem(KIOSK_KEY_STORAGE);
  } catch {
    // ignore
  }
}
