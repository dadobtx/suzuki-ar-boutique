// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  isActiveZoneEnabled,
  readUrlActiveZone,
  readSessionActiveZone,
  writeSessionActiveZone,
  ACTIVE_ZONE_STORAGE_KEY,
  POSE_MAX_PERSONS,
} from '@/lib/active-zone';
import { usePose, _resetLandmarkerForTesting } from '@/hooks/usePose';
import { PoseLandmarker } from '@mediapipe/tasks-vision';

vi.mock('@mediapipe/tasks-vision', () => {
  const mockLandmarker = {
    detectForVideo: vi.fn(),
    setOptions: vi.fn().mockResolvedValue(undefined),
  };
  return {
    FilesetResolver: {
      forVisionTasks: vi.fn().mockResolvedValue('mock-resolver'),
    },
    PoseLandmarker: {
      createFromOptions: vi.fn().mockResolvedValue(mockLandmarker),
      POSE_CONNECTIONS: [],
    },
  };
});

describe('Active Zone - Interruptor y prioridad', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    delete (window as unknown as { location: unknown }).location;
    window.location = new URL('http://localhost/') as unknown as Location;
    vi.clearAllMocks();
    _resetLandmarkerForTesting();
  });

  afterEach(() => {
    sessionStorage.clear();
    window.location = originalLocation;
    vi.unstubAllEnvs();
  });

  it('sin parámetro → OFF (false)', () => {
    expect(isActiveZoneEnabled()).toBe(false);
  });

  it('?zona=1 en search → ON (true)', () => {
    window.location = new URL('http://localhost/?zona=1') as unknown as Location;
    expect(readUrlActiveZone()).toBe(true);
    expect(isActiveZoneEnabled()).toBe(true);
  });

  it('?zona=0 en search → OFF (false)', () => {
    window.location = new URL('http://localhost/?zona=0') as unknown as Location;
    expect(readUrlActiveZone()).toBe(false);
    expect(isActiveZoneEnabled()).toBe(false);
  });

  it('#/?zona=1 en hash → ON (true)', () => {
    window.location = new URL('http://localhost/#/?zona=1') as unknown as Location;
    expect(readUrlActiveZone()).toBe(true);
    expect(isActiveZoneEnabled()).toBe(true);
  });

  it('sessionStorage gana sobre default y sobre env cuando no hay parámetro URL', () => {
    // 1. sessionStorage activa la zona aunque por default sea OFF
    writeSessionActiveZone(true);
    expect(readSessionActiveZone()).toBe(true);
    expect(isActiveZoneEnabled()).toBe(true);

    // 2. sessionStorage desactiva la zona aunque VITE_ACTIVE_ZONE esté en 1
    sessionStorage.setItem(ACTIVE_ZONE_STORAGE_KEY, '0');
    vi.stubEnv('VITE_ACTIVE_ZONE', '1');
    expect(isActiveZoneEnabled()).toBe(false);
  });

  it('VITE_ACTIVE_ZONE activa la zona si no hay URL ni sessionStorage', () => {
    vi.stubEnv('VITE_ACTIVE_ZONE', '1');
    expect(isActiveZoneEnabled()).toBe(true);
  });

  it('URL tiene máxima prioridad sobre sessionStorage', () => {
    sessionStorage.setItem(ACTIVE_ZONE_STORAGE_KEY, '0');
    window.location = new URL('http://localhost/?zona=1') as unknown as Location;
    expect(isActiveZoneEnabled()).toBe(true);

    sessionStorage.setItem(ACTIVE_ZONE_STORAGE_KEY, '1');
    window.location = new URL('http://localhost/?zona=0') as unknown as Location;
    expect(isActiveZoneEnabled()).toBe(false);
  });

  it('Con OFF, usePose inicializa PoseLandmarker con numPoses: 1', async () => {
    window.location = new URL('http://localhost/') as unknown as Location;
    expect(isActiveZoneEnabled()).toBe(false);

    await act(async () => {
      renderHook(() => usePose());
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(PoseLandmarker.createFromOptions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        numPoses: 1,
      }),
    );
  });

  it('Con ON, usePose inicializa PoseLandmarker con numPoses: POSE_MAX_PERSONS (3)', async () => {
    window.location = new URL('http://localhost/?zona=1') as unknown as Location;
    expect(isActiveZoneEnabled()).toBe(true);

    await act(async () => {
      renderHook(() => usePose());
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(PoseLandmarker.createFromOptions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        numPoses: POSE_MAX_PERSONS,
      }),
    );
  });

  it('Con OFF, usePose procesa frames y entrega landmarks desde index 0 como hoy', async () => {
    window.location = new URL('http://localhost/') as unknown as Location;

    type FrameCb = (now: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata) => void;
    let savedCallback: FrameCb | null = null;
    const dummyVideo = {
      readyState: 4,
      videoWidth: 1280,
      videoHeight: 720,
      requestVideoFrameCallback: vi.fn((cb: FrameCb) => {
        savedCallback = cb;
        return 101;
      }),
      cancelVideoFrameCallback: vi.fn(),
    } as unknown as HTMLVideoElement;

    const mockPoseLandmarks = [{ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }];
    const mockLandmarkerInstance = {
      detectForVideo: vi.fn().mockReturnValue({
        landmarks: [mockPoseLandmarks],
        worldLandmarks: [mockPoseLandmarks],
        segmentationMasks: [
          { getAsUint8Array: () => new Uint8Array(10), close: vi.fn() },
        ],
      }),
      setOptions: vi.fn().mockResolvedValue(undefined),
    };
    (
      PoseLandmarker.createFromOptions as unknown as {
        mockResolvedValue: (v: unknown) => void;
      }
    ).mockResolvedValue(mockLandmarkerInstance);

    const videoRef = { current: dummyVideo };
    let hookResult:
      | ReturnType<typeof renderHook<ReturnType<typeof usePose>, unknown>>['result']
      | null = null;

    await act(async () => {
      const rendered = renderHook(() => usePose(videoRef));
      hookResult = rendered.result;
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(savedCallback).not.toBeNull();

    // Simular frame del video
    await act(async () => {
      savedCallback!(100, { presentationTime: 100 } as VideoFrameCallbackMetadata);
    });

    expect(hookResult!.current.landmarks).not.toBeNull();
    expect(hookResult!.current.landmarks![0].x).toBe(0.5);
    expect(hookResult!.current.activeZone.enabled).toBe(false);
  });

  it('Con 3 personas y zona activa ON, usePose cierra todas las máscaras para evitar fugas GPU', async () => {
    window.location = new URL('http://localhost/?zona=1') as unknown as Location;

    type FrameCb = (now: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata) => void;
    let savedCallback: FrameCb | null = null;
    const dummyVideo = {
      readyState: 4,
      videoWidth: 1280,
      videoHeight: 720,
      clientWidth: 1080,
      clientHeight: 1920,
      requestVideoFrameCallback: vi.fn((cb: FrameCb) => {
        savedCallback = cb;
        return 102;
      }),
      cancelVideoFrameCallback: vi.fn(),
    } as unknown as HTMLVideoElement;

    const mask0 = { getAsUint8Array: () => new Uint8Array(10), close: vi.fn() };
    const mask1 = { getAsUint8Array: () => new Uint8Array(10), close: vi.fn() };
    const mask2 = { getAsUint8Array: () => new Uint8Array(10), close: vi.fn() };

    const mockPoseLandmarks = [{ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }];
    const mockLandmarkerInstance = {
      detectForVideo: vi.fn().mockReturnValue({
        landmarks: [mockPoseLandmarks, mockPoseLandmarks, mockPoseLandmarks],
        worldLandmarks: [mockPoseLandmarks, mockPoseLandmarks, mockPoseLandmarks],
        segmentationMasks: [mask0, mask1, mask2],
      }),
      setOptions: vi.fn().mockResolvedValue(undefined),
    };
    (
      PoseLandmarker.createFromOptions as unknown as {
        mockResolvedValue: (v: unknown) => void;
      }
    ).mockResolvedValue(mockLandmarkerInstance);

    const videoRef = { current: dummyVideo };

    await act(async () => {
      renderHook(() => usePose(videoRef));
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(savedCallback).not.toBeNull();

    // Procesar frame
    await act(async () => {
      savedCallback!(100, { presentationTime: 100 } as VideoFrameCallbackMetadata);
    });

    // Verificar que close() fue invocado exactamente en todas las máscaras
    expect(mask0.close).toHaveBeenCalledTimes(1);
    expect(mask1.close).toHaveBeenCalledTimes(1);
    expect(mask2.close).toHaveBeenCalledTimes(1);
  });
});
