/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  usePresence,
  PRESENCE_ARRIVING_DELAY_MS,
  PRESENCE_LEAVING_DELAY_MS,
  PRESENCE_ABSENT_DELAY_MS,
} from '@/hooks/usePresence';

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

  it('transitions absent -> arriving when head, shoulders, and hips are visible while legs have 0 visibility', () => {
    // 33 landmarks with default visibility 0 (legs/feet invisible)
    const landmarks = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0,
    }));

    // Upper body keypoints visible: nose (0), shoulders (11, 12), hips (23, 24)
    landmarks[0].visibility = 0.9;
    landmarks[11].visibility = 0.9;
    landmarks[12].visibility = 0.9;
    landmarks[23].visibility = 0.9;
    landmarks[24].visibility = 0.9;

    const { result, rerender } = renderHook((props) => usePresence(props.landmarks), {
      initialProps: { landmarks: null as unknown as NormalizedLandmark[] },
    });

    for (let i = 0; i < 10; i++) {
      act(() => {
        rerender({ landmarks });
      });
    }

    expect(result.current).toBe('arriving');
  });

  it('transitions present -> leaving -> absent when landmarks are null and frameId increments', () => {
    let currentFrameId = 1;
    const { result, rerender } = renderHook(
      (props) => usePresence(props.landmarks, props.frameId),
      {
        initialProps: {
          landmarks: createLandmarks(0.8),
          frameId: currentFrameId,
        },
      },
    );

    // 1. Establish 'present' state: 10 frames with good visibility, then 1s delay
    for (let i = 0; i < 10; i++) {
      currentFrameId++;
      act(() => {
        rerender({
          landmarks: createLandmarks(0.8),
          frameId: currentFrameId,
        });
      });
    }
    act(() => {
      vi.advanceTimersByTime(PRESENCE_ARRIVING_DELAY_MS);
    });
    expect(result.current).toBe('present');

    // 2. Person leaves: MediaPipe returns null in subsequent frames with incrementing frameId
    for (let i = 0; i < 10; i++) {
      currentFrameId++;
      act(() => {
        rerender({
          landmarks: null,
          frameId: currentFrameId,
        });
      });
    }

    // After 10 null frames, rolling visibility average is 0 (< PRESENCE_LEAVING_THRESHOLD = 0.3)
    // Advance by PRESENCE_LEAVING_DELAY_MS (1500ms)
    act(() => {
      vi.advanceTimersByTime(PRESENCE_LEAVING_DELAY_MS);
    });
    expect(result.current).toBe('leaving');

    // 3. Keep feeding null frames while leaving, and advance by PRESENCE_ABSENT_DELAY_MS (5000ms)
    for (let i = 0; i < 10; i++) {
      currentFrameId++;
      act(() => {
        rerender({
          landmarks: null,
          frameId: currentFrameId,
        });
      });
    }
    act(() => {
      vi.advanceTimersByTime(PRESENCE_ABSENT_DELAY_MS);
    });
    expect(result.current).toBe('absent');
  });
});
