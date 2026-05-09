import { useEffect, useState } from 'react';

const STORAGE_KEY = 'suzuki-debug-skeleton';

export function useDebugToggle() {
  const [showDebug, setShowDebug] = useState(() => {
    return sessionStorage.getItem(STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle on 'd' or 'D', but ignore if typing in an input
      if (
        (e.key === 'd' || e.key === 'D') &&
        e.target instanceof Element &&
        !['INPUT', 'TEXTAREA'].includes(e.target.tagName)
      ) {
        setShowDebug((prev) => {
          const next = !prev;
          sessionStorage.setItem(STORAGE_KEY, String(next));
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggle = () => {
    setShowDebug((prev) => {
      const next = !prev;
      sessionStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return { showDebug, toggle };
}
