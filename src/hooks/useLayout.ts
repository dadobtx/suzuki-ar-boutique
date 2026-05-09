import { useEffect } from 'react';
import { useLayoutStore } from '@/store/layout';
import type { LayoutMode } from '@/store/layout';

/**
 * Determines the active layout mode.
 * Priority: sessionStorage override > URL flag > media query.
 */
export function useLayout() {
  const { mode, source, setMode, toggle } = useLayoutStore();

  useEffect(() => {
    // If there's already a manual override from sessionStorage, keep it
    const stored = useLayoutStore.getState();
    if (stored.source === 'manual') return;

    // Check URL flag: ?layout=portrait (from location.search, before the hash)
    const params = new URLSearchParams(window.location.search);
    const urlLayout = params.get('layout');
    if (urlLayout === 'portrait' || urlLayout === 'landscape') {
      try {
        sessionStorage.setItem('suzuki-layout-override', urlLayout);
      } catch {
        // ignore
      }
      setMode(urlLayout as LayoutMode, 'url');
      return;
    }

    // Fall back to media query
    const mql = window.matchMedia('(orientation: portrait)');
    const handler = (e: MediaQueryListEvent) => {
      // Only update if no manual override exists
      const current = useLayoutStore.getState();
      if (current.source !== 'manual') {
        setMode(e.matches ? 'portrait' : 'landscape', 'media');
      }
    };

    // Set initial value from media query
    setMode(mql.matches ? 'portrait' : 'landscape', 'media');

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [setMode]);

  return { layout: mode, source, toggle };
}
