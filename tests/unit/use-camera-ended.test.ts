/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCamera } from '@/hooks/useCamera';

describe('useCamera - safety net for track ended', () => {
  let mockTrackListeners: { [event: string]: () => void } = {};
  let mockTrack: any;
  let mockStream: any;
  let getUserMediaSpy: any;

  beforeEach(() => {
    mockTrackListeners = {};
    mockTrack = {
      kind: 'video',
      readyState: 'live',
      getSettings: vi.fn().mockReturnValue({ deviceId: 'cam-123' }),
      getCapabilities: vi.fn().mockReturnValue({}),
      stop: vi.fn().mockImplementation(() => {
        mockTrack.readyState = 'ended';
      }),
      addEventListener: vi.fn().mockImplementation((event: string, cb: () => void) => {
        mockTrackListeners[event] = cb;
      }),
      removeEventListener: vi.fn(),
    };

    mockStream = {
      getTracks: vi.fn().mockReturnValue([mockTrack]),
      getVideoTracks: vi.fn().mockReturnValue([mockTrack]),
    };

    getUserMediaSpy = vi.fn().mockResolvedValue(mockStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: getUserMediaSpy,
        enumerateDevices: vi
          .fn()
          .mockResolvedValue([
            { kind: 'videoinput', deviceId: 'cam-123', label: 'FaceTime HD' },
          ]),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reacquires camera and logs "[camera] track ended, reacquiring" when track ends unexpectedly', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result, unmount } = renderHook(() => useCamera());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.status).toBe('granted');
    expect(mockTrack.addEventListener).toHaveBeenCalledWith(
      'ended',
      expect.any(Function),
    );

    const initialGUMCalls = getUserMediaSpy.mock.calls.length;

    // Simular que la pista de la cámara se corta sin que la app lo pida
    await act(async () => {
      mockTrackListeners['ended']?.();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith('[camera] track ended, reacquiring');
    expect(getUserMediaSpy.mock.calls.length).toBeGreaterThan(initialGUMCalls);

    unmount();
  });
});
