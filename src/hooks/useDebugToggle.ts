import { useEffect, useState } from 'react';

const STORAGE_KEY = 'suzuki-debug-skeleton';

function hasSkeletonUrlFlag(): boolean {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }

  // 1. Check window.location.search (?skeleton=1)
  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('skeleton') === '1') {
      return true;
    }
  } catch {
    // Ignore URL parsing errors
  }

  // 2. Check window.location.hash (#/...?...&skeleton=1)
  try {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex));
      if (hashParams.get('skeleton') === '1') {
        return true;
      }
    }
  } catch {
    // Ignore URL parsing errors
  }

  return false;
}

export function useDebugToggle() {
  const [showDebug, setShowDebug] = useState(() => {
    if (hasSkeletonUrlFlag()) {
      return true;
    }
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
