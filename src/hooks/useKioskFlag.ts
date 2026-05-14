import { useEffect, useState } from 'react';

export function useKioskFlag() {
  const [isKiosk, setIsKiosk] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kioskMode = params.get('kiosk') === '1';
    setIsKiosk(kioskMode);

    if (kioskMode) {
      document.body.classList.add('kiosk-mode');

      // Request Fullscreen on first interaction
      const enterFullscreen = () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch((err) => {
            console.warn(`Error attempting to enable fullscreen: ${err.message}`);
          });
        }
      };

      document.addEventListener('touchstart', enterFullscreen, { once: true });
      document.addEventListener('click', enterFullscreen, { once: true });

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

      // Register Service Worker in kiosk mode
      import('virtual:pwa-register')
        .then(({ registerSW }) => {
          registerSW({ immediate: true });
        })
        .catch((err) => console.warn('PWA registration failed', err));

      return () => {
        document.body.classList.remove('kiosk-mode');
        document.removeEventListener('contextmenu', prevent);
        document.removeEventListener('selectstart', prevent);
        document.removeEventListener('keydown', preventZoom);
      };
    }
  }, []);

  return isKiosk;
}
