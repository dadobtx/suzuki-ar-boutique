import { useEffect, useState } from 'react';
import { cleanupNonKioskServiceWorker, registerKioskSW } from '@/lib/pwa-update';

export function useKioskFlag() {
  const [isKiosk, setIsKiosk] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kioskMode = params.get('kiosk') === '1';
    setIsKiosk(kioskMode);

    if (!kioskMode) {
      cleanupNonKioskServiceWorker();
      return;
    }

    if (kioskMode) {
      document.body.classList.add('kiosk-mode');

      // Request Fullscreen on first interaction
      const requestFs = () => {
        const el = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
          msRequestFullscreen?: () => Promise<void>;
        };
        if (document.fullscreenElement) return;
        const req =
          el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.msRequestFullscreen;
        req?.call(el).catch((err: Error) => {
          console.warn('[kiosk] Fullscreen request rejected:', err);
        });
      };

      document.addEventListener('touchstart', requestFs, { once: true, passive: true });
      document.addEventListener('mousedown', requestFs, { once: true });

      // Block context menu, selection, zoom
      const prevent = (e: Event) => e.preventDefault();
      document.addEventListener('contextmenu', prevent);
      document.addEventListener('selectstart', prevent);

      const preventZoom = (e: KeyboardEvent) => {
        if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=')) {
          e.preventDefault();
        }
      };
      document.addEventListener('keydown', preventZoom);

      // Register Service Worker in kiosk mode safely
      registerKioskSW();

      return () => {
        document.body.classList.remove('kiosk-mode');
        document.removeEventListener('touchstart', requestFs);
        document.removeEventListener('mousedown', requestFs);
        document.removeEventListener('contextmenu', prevent);
        document.removeEventListener('selectstart', prevent);
        document.removeEventListener('keydown', preventZoom);
      };
    }
  }, []);

  return isKiosk;
}
