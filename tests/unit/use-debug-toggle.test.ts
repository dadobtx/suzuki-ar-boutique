import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebugToggle } from '@/hooks/useDebugToggle';

describe('useDebugToggle', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
    sessionStorage.clear();
  });

  function setMockLocation(search: string, hash: string) {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...originalLocation,
        search,
        hash,
      },
    });
  }

  it('starts false by default when no url param or session storage is present', () => {
    setMockLocation('', '#/');
    const { result } = renderHook(() => useDebugToggle());
    expect(result.current.showDebug).toBe(false);
  });

  it('starts true when ?skeleton=1 is present in window.location.search', () => {
    setMockLocation('?skeleton=1', '#/');
    const { result } = renderHook(() => useDebugToggle());
    expect(result.current.showDebug).toBe(true);
  });

  it('starts true when skeleton=1 is present inside window.location.hash query', () => {
    setMockLocation('', '#/kiosk?skeleton=1');
    const { result } = renderHook(() => useDebugToggle());
    expect(result.current.showDebug).toBe(true);
  });

  it('starts true when sessionStorage has suzuki-debug-skeleton set to "true"', () => {
    setMockLocation('', '#/');
    sessionStorage.setItem('suzuki-debug-skeleton', 'true');
    const { result } = renderHook(() => useDebugToggle());
    expect(result.current.showDebug).toBe(true);
  });

  it('toggles value and writes to sessionStorage on toggle()', () => {
    setMockLocation('', '#/');
    const { result } = renderHook(() => useDebugToggle());
    expect(result.current.showDebug).toBe(false);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.showDebug).toBe(true);
    expect(sessionStorage.getItem('suzuki-debug-skeleton')).toBe('true');

    act(() => {
      result.current.toggle();
    });

    expect(result.current.showDebug).toBe(false);
    expect(sessionStorage.getItem('suzuki-debug-skeleton')).toBe('false');
  });

  it('toggles value when pressing "d" key', () => {
    setMockLocation('', '#/');
    const { result } = renderHook(() => useDebugToggle());
    expect(result.current.showDebug).toBe(false);

    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'd', bubbles: true }),
      );
    });

    expect(result.current.showDebug).toBe(true);
    expect(sessionStorage.getItem('suzuki-debug-skeleton')).toBe('true');
  });

  it('toggles value when pressing "D" key', () => {
    setMockLocation('', '#/');
    const { result } = renderHook(() => useDebugToggle());
    expect(result.current.showDebug).toBe(false);

    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'D', bubbles: true }),
      );
    });

    expect(result.current.showDebug).toBe(true);
  });

  it('does not toggle when typing in input or textarea', () => {
    setMockLocation('', '#/');
    const { result } = renderHook(() => useDebugToggle());
    expect(result.current.showDebug).toBe(false);

    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    });

    expect(result.current.showDebug).toBe(false);
    document.body.removeChild(input);
  });
});
