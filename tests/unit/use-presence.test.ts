/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePresence } from '@/hooks/usePresence';

describe('usePresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createLandmarks(visibility: number) {
    return Array(33).fill({ x: 0, y: 0, z: 0, visibility });
  }

  it('starts as absent', () => {
    const { result } = renderHook(() => usePresence(null));
    expect(result.current).toBe('absent');
  });

  it('transitions absent -> arriving instantly when visibility > 0.6', () => {
    const { result, rerender } = renderHook((props) => usePresence(props.landmarks), {
      initialProps: { landmarks: null as unknown as NormalizedLandmark[] },
    });

    for (let i = 0; i < 10; i++) {
      act(() => {
        rerender({ landmarks: createLandmarks(0.8) });
      });
    }

    expect(result.current).toBe('arriving');
  });

  it('transitions arriving -> present after 1 second', () => {
    const { result, rerender } = renderHook((props) => usePresence(props.landmarks), {
      initialProps: { landmarks: null as unknown as NormalizedLandmark[] },
    });

    for (let i = 0; i < 10; i++) {
      act(() => {
        rerender({ landmarks: createLandmarks(0.8) });
      });
    }
    expect(result.current).toBe('arriving');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe('present');
  });

  it('falls back to absent if visibility drops before 1 second', () => {
    const { result, rerender } = renderHook((props) => usePresence(props.landmarks), {
      initialProps: { landmarks: null as unknown as NormalizedLandmark[] },
    });

    // Trigger arriving
    for (let i = 0; i < 10; i++) {
      act(() => {
        rerender({ landmarks: createLandmarks(0.8) });
      });
    }
    expect(result.current).toBe('arriving');

    // Wait half a second, drop visibility
    act(() => vi.advanceTimersByTime(500));

    // Wait for the rolling avg to reflect the drop (we need a few frames since it averages 10)
    for (let i = 0; i < 10; i++) {
      act(() => {
        rerender({ landmarks: createLandmarks(0.1) });
      });
    }

    expect(result.current).toBe('absent');
  });

  it('transitions present -> leaving after 1.5 seconds of low visibility', () => {
    const { result, rerender } = renderHook((props) => usePresence(props.landmarks), {
      initialProps: { landmarks: createLandmarks(0.8) },
    });

    // Jump straight to present
    for (let i = 0; i < 10; i++) {
      act(() => {
        rerender({ landmarks: createLandmarks(0.8) });
      });
    }
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe('present');

    // Drop visibility
    for (let i = 0; i < 10; i++) {
      act(() => {
        rerender({ landmarks: createLandmarks(0.1) });
      });
    }

    // Wait 1.5s
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current).toBe('leaving');
  });

  it('transitions leaving -> absent after 5 seconds', () => {
    const { result, rerender } = renderHook((props) => usePresence(props.landmarks), {
      initialProps: { landmarks: createLandmarks(0.8) },
    });

    // Setup: go to present then leaving
    for (let i = 0; i < 10; i++) {
      act(() => {
        rerender({ landmarks: createLandmarks(0.8) });
      });
    }
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    for (let i = 0; i < 10; i++) {
      act(() => {
        rerender({ landmarks: createLandmarks(0.1) });
      });
    }
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current).toBe('leaving');

    // Wait 5s
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current).toBe('absent');
  });

  it('recovers leaving -> present if visibility returns', () => {
    const { result, rerender } = renderHook((props) => usePresence(props.landmarks), {
      initialProps: { landmarks: createLandmarks(0.8) },
    });

    // Setup: go to present then leaving
    for (let i = 0; i < 10; i++) {
      act(() => {
        rerender({ landmarks: createLandmarks(0.8) });
      });
    }
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    for (let i = 0; i < 10; i++) {
      act(() => {
        rerender({ landmarks: createLandmarks(0.1) });
      });
    }
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current).toBe('leaving');

    // Visibility returns!
    for (let i = 0; i < 10; i++) {
      act(() => {
        rerender({ landmarks: createLandmarks(0.8) });
      });
    }

    expect(result.current).toBe('present');
  });
});
