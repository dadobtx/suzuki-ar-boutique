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
import { Point3DFilter } from '@/lib/one-euro-filter';

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

  it('Filtros One-Euro: se reinician 1 sola vez al fijar y NO en cada frame al desplazarse; se reinician al soltar y volver a fijar', async () => {
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
        return 201;
      }),
      cancelVideoFrameCallback: vi.fn(),
    } as unknown as HTMLVideoElement;

    const resetSpy = vi.spyOn(Point3DFilter.prototype, 'reset');

    function createLandmarks(cx: number) {
      const sw = 0.14;
      const lms = [];
      for (let i = 0; i < 33; i++) {
        lms.push({ x: cx, y: 0.5, z: 0, visibility: 0.9 });
      }
      lms[0] = { x: cx, y: 0.25, z: 0, visibility: 0.9 };
      lms[11] = { x: cx - sw / 2, y: 0.4, z: 0, visibility: 0.9 };
      lms[12] = { x: cx + sw / 2, y: 0.4, z: 0, visibility: 0.9 };
      lms[23] = { x: cx - sw / 2, y: 0.7, z: 0, visibility: 0.9 };
      lms[24] = { x: cx + sw / 2, y: 0.7, z: 0, visibility: 0.9 };
      return lms;
    }

    let currentLandmarks = createLandmarks(0.5);
    const mockLandmarkerInstance = {
      detectForVideo: vi.fn().mockImplementation(() => ({
        landmarks: currentLandmarks.length > 0 ? [currentLandmarks] : [],
        worldLandmarks: currentLandmarks.length > 0 ? [currentLandmarks] : [],
        segmentationMasks: [],
      })),
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

    resetSpy.mockClear();

    // Simular tiempo pasando
    let time = 1000;
    const nowPerfSpy = vi.spyOn(performance, 'now');

    // 1. Frame inicial a t = 1000: candidato elegible pero no fijado (LOCK_MS = 600)
    nowPerfSpy.mockReturnValue(time);
    await act(async () => {
      savedCallback!(time, { presentationTime: time } as VideoFrameCallbackMetadata);
    });

    // 2. Frame a t = 1700 (> 600ms después): ahora se fija -> debe reiniciar filtros exactamente 1 vez (33 llamadas)
    time = 1700;
    nowPerfSpy.mockReturnValue(time);
    await act(async () => {
      savedCallback!(time, { presentationTime: time } as VideoFrameCallbackMetadata);
    });
    expect(resetSpy).toHaveBeenCalledTimes(33);

    // 3. 30 frames desplazándose 0.02 por frame:
    // Los filtros NO deben reiniciarse durante estos 30 frames
    for (let f = 0; f < 30; f++) {
      time += 33;
      nowPerfSpy.mockReturnValue(time);
      currentLandmarks = createLandmarks(0.5 + (f % 2 === 0 ? 0.02 : -0.02));
      await act(async () => {
        savedCallback!(time, { presentationTime: time } as VideoFrameCallbackMetadata);
      });
    }
    // Sigue siendo 33 llamadas (0 llamadas adicionales en 30 frames con movimiento)
    expect(resetSpy).toHaveBeenCalledTimes(33);

    // 4. La persona desaparece por > 1500 ms (t = 1700 + 30*33 + 1600 = 4290) -> se suelta
    currentLandmarks = [];
    time += 1600;
    nowPerfSpy.mockReturnValue(time);
    await act(async () => {
      savedCallback!(time, { presentationTime: time } as VideoFrameCallbackMetadata);
    });
    // Al soltarse, se reinician los filtros (33 + 33 = 66)
    expect(resetSpy).toHaveBeenCalledTimes(66);

    // 5. Segunda fijación: la persona vuelve a t = 4500 y se fija a t = 5200 (cumple 600ms)
    currentLandmarks = createLandmarks(0.5);
    time = 4500;
    nowPerfSpy.mockReturnValue(time);
    await act(async () => {
      savedCallback!(time, { presentationTime: time } as VideoFrameCallbackMetadata);
    });
    expect(resetSpy).toHaveBeenCalledTimes(66);

    time = 5200;
    nowPerfSpy.mockReturnValue(time);
    await act(async () => {
      savedCallback!(time, { presentationTime: time } as VideoFrameCallbackMetadata);
    });
    // Se fijó de nuevo con una nueva lockedSinceMs -> se reinician otra vez (66 + 33 = 99)
    expect(resetSpy).toHaveBeenCalledTimes(99);

    resetSpy.mockRestore();
    nowPerfSpy.mockRestore();
  });
});
