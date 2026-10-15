/**
 * @vitest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { LiveTryOnManager } from '@/lib/liveTryon';
import { useLiveTryon, CONCURRENT_RETRY_DELAY_MS } from '@/hooks/useLiveTryon';
import type { Garment } from '@/types/garment';

// Mock @fal-ai/client
let mockFalConnection: {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};
let lastConnectConfig: any = null;

vi.mock('@fal-ai/client', () => ({
  fal: {
    realtime: {
      connect: vi.fn().mockImplementation((_endpoint: string, config: any) => {
        lastConnectConfig = config;
        mockFalConnection = {
          send: vi.fn(),
          close: vi.fn(),
        };
        return Promise.resolve(mockFalConnection);
      }),
    },
  },
}));

// Mock @decartai/sdk
let mockDecartRealtimeClient: {
  on: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  _emit: (event: string, payload: any) => void;
  _listeners: Map<string, any>;
};
let lastDecartConnectOptions: any = null;

vi.mock('@decartai/sdk', () => ({
  models: {
    realtime: vi.fn().mockImplementation((name) => ({
      name,
      width: 720,
      height: 1280,
      fps: 30,
    })),
  },
  createDecartClient: vi.fn().mockImplementation(() => ({
    realtime: {
      connect: vi.fn().mockImplementation((_stream: any, options: any) => {
        lastDecartConnectOptions = options;
        const listeners = new Map<string, any>();
        mockDecartRealtimeClient = {
          on: vi.fn().mockImplementation((event: string, cb: any) => {
            listeners.set(event, cb);
          }),
          set: vi.fn().mockResolvedValue(undefined),
          disconnect: vi.fn(),
          _emit: (event: string, payload: any) => {
            const cb = listeners.get(event);
            if (cb) cb(payload);
          },
          _listeners: listeners,
        };
        return Promise.resolve(mockDecartRealtimeClient);
      }),
    },
  })),
}));

// Mock RTCPeerConnection for Fal tests
let mockPcInstances: MockRTCPeerConnection[] = [];
class MockRTCPeerConnection {
  iceServers: any;
  ontrack: ((event: any) => void) | null = null;
  onicecandidate: ((event: any) => void) | null = null;
  addTrack = vi.fn();
  getTransceivers = vi.fn().mockReturnValue([{ stop: vi.fn() }]);
  createOffer = vi.fn().mockResolvedValue({ sdp: 'mock-offer-sdp' });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  addIceCandidate = vi.fn().mockResolvedValue(undefined);
  setConfiguration = vi.fn();
  close = vi.fn();

  constructor(config?: any) {
    this.iceServers = config?.iceServers;
    mockPcInstances.push(this);
  }
}
// @ts-expect-error Mocking global RTCPeerConnection for tests
globalThis.RTCPeerConnection = MockRTCPeerConnection;

// Mock MediaStream
class MockMediaStream {
  getTracks = vi.fn().mockReturnValue([{ stop: vi.fn(), kind: 'video' }]);
}
// @ts-expect-error Mocking global MediaStream for tests
globalThis.MediaStream = MockMediaStream;

const sampleGarment: Garment = {
  id: 'g-1',
  sku: 'SUZ-TS-01',
  name: 'Camiseta Suzuki',
  category: 'top',
  gender: 'unisex',
  defaultPrice: 35,
  images: {
    front: '/garments/front.png',
    flat: '/garments/flat.png',
  },
  layers: {
    overlay: '/garments/overlay.png',
  },
  overlayUrl: '/garments/overlay.png',
  anchorsUrl: '/garments/anchors.json',
};

const reversibleGarment: Garment = {
  id: '990F0-BKQJ5',
  sku: '990F0-BKQJ5',
  name: 'Team Black Reversible Jacket',
  category: 'top',
  gender: 'unisex',
  defaultPrice: 120,
  images: {
    front: '/garments/990F0-BKQJ5.png',
    flat: '/garments/990F0-BKQJ5.png',
  },
  layers: {
    overlay: '/garments/990F0-BKQJ5.png',
  },
  overlayUrl: '/garments/990F0-BKQJ5.png',
  anchorsUrl: '/garments/990F0-BKQJ5.anchors.json',
  variants: [
    {
      id: 'roja',
      label: 'Roja',
      color: '#CB1C2A',
      overlayUrl: '/garments/990F0-BKQJ5.png',
      anchorsUrl: '/garments/990F0-BKQJ5.anchors.json',
      thumbnailUrl: '/garments/990F0-BKQJ5.thumb.png',
    },
    {
      id: 'negra',
      label: 'Negra',
      color: '#14161B',
      overlayUrl: '/garments/990F0-BKQJ5_2.png',
      anchorsUrl: '/garments/990F0-BKQJ5_2.anchors.json',
      thumbnailUrl: '/garments/990F0-BKQJ5_2.thumb.png',
    },
  ],
};

describe('LiveTryOnManager with Decart provider (default)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDecartConnectOptions = null;
    LiveTryOnManager._resetActiveInstancesForTesting();
  });

  it('inicia conexión con Decart con mirror: false y retries: 0', async () => {
    const stream = new MediaStream() as any;
    const manager = new LiveTryOnManager({
      token: 'decart-test-token',
      maxSeconds: 15,
      liveId: 101,
      stream,
      referenceImageUrl: 'https://dadobtx.github.io/suzuki-ar-boutique/test.png',
      onUpdate: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    await manager.start();

    expect(lastDecartConnectOptions).not.toBeNull();
    expect(lastDecartConnectOptions.mirror).toBe(false);
    expect(lastDecartConnectOptions.retries).toBe(0);
    expect(lastDecartConnectOptions.initialState.prompt.text).toContain(
      'Substitute the current top',
    );
    expect(lastDecartConnectOptions.initialState.image).toBe(
      'https://dadobtx.github.io/suzuki-ar-boutique/test.png',
    );
    expect(manager.getConnectionKey()).toContain('decart-lucy-101-');

    manager.stop();
    expect(mockDecartRealtimeClient.disconnect).toHaveBeenCalled();
  });

  it('sendGarment() envía prompt e imagen completa con set()', async () => {
    const stream = new MediaStream() as any;
    const manager = new LiveTryOnManager({
      token: 'decart-token',
      maxSeconds: 15,
      liveId: 102,
      stream,
      referenceImageUrl: 'https://dadobtx.github.io/test1.png',
      onUpdate: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    await manager.start();
    manager.sendGarment('https://dadobtx.github.io/test2.png');

    expect(mockDecartRealtimeClient.set).toHaveBeenCalledWith({
      prompt: expect.stringContaining('Substitute the current top'),
      image: 'https://dadobtx.github.io/test2.png',
      enhance: false,
    });

    manager.stop();
  });

  it('sessionEnded con fin normal por duración (timeout) llama a stop() sin onError', async () => {
    const stream = new MediaStream() as any;
    const onError = vi.fn();
    const onClose = vi.fn();
    const manager = new LiveTryOnManager({
      token: 'decart-token',
      maxSeconds: 15,
      liveId: 103,
      stream,
      referenceImageUrl: 'https://dadobtx.github.io/test1.png',
      onUpdate: vi.fn(),
      onError,
      onClose,
    });

    await manager.start();
    mockDecartRealtimeClient._emit('sessionEnded', { reason: 'timeout' });

    expect(onError).not.toHaveBeenCalled();
    expect(manager.getState()).toBe('closed');
    expect(onClose).toHaveBeenCalled();
  });

  it('sessionEnded con motivo anómalo llama a onError con webrtc_error', async () => {
    const stream = new MediaStream() as any;
    const onError = vi.fn();
    const manager = new LiveTryOnManager({
      token: 'decart-token',
      maxSeconds: 15,
      liveId: 104,
      stream,
      referenceImageUrl: 'https://dadobtx.github.io/test1.png',
      onUpdate: vi.fn(),
      onError,
      onClose: vi.fn(),
    });

    await manager.start();
    mockDecartRealtimeClient._emit('sessionEnded', { reason: 'moderation_violation' });

    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'webrtc_error');
    expect(manager.getState()).toBe('closed');
  });
});

describe('LiveTryOnManager with Fal provider (isolated fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPcInstances = [];
    lastConnectConfig = null;
    LiveTryOnManager._resetActiveInstancesForTesting();
  });

  it('cada start() usa un connectionKey distinto y throttleInterval 0', async () => {
    const stream = new MediaStream() as any;
    const config1 = {
      token: 'tok-1',
      maxSeconds: 15,
      liveId: 101,
      stream,
      referenceImageUrl: 'http://localhost/test1.png',
      provider: 'fal' as const,
      onUpdate: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    };
    const manager1 = new LiveTryOnManager(config1);
    await manager1.start();

    expect(lastConnectConfig.throttleInterval).toBe(0);
    const key1 = lastConnectConfig.connectionKey;
    expect(key1).toContain('lucy2-vton-101-');

    const config2 = {
      token: 'tok-2',
      maxSeconds: 15,
      liveId: 102,
      stream,
      referenceImageUrl: 'http://localhost/test2.png',
      provider: 'fal' as const,
      onUpdate: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    };
    const manager2 = new LiveTryOnManager(config2);
    await manager2.start();

    const key2 = lastConnectConfig.connectionKey;
    expect(key2).toContain('lucy2-vton-102-');
    expect(key1).not.toBe(key2);

    manager1.stop();
    manager2.stop();
  });

  it('stop() dos veces → connection.close y pc.close una vez cada uno, onClose una sola vez', async () => {
    const stream = new MediaStream() as any;
    const onClose = vi.fn();
    const config = {
      token: 'tok-1',
      maxSeconds: 15,
      liveId: 101,
      stream,
      referenceImageUrl: 'http://localhost/test1.png',
      provider: 'fal' as const,
      onUpdate: vi.fn(),
      onError: vi.fn(),
      onClose,
    };
    const manager = new LiveTryOnManager(config);
    await manager.start();

    // Simular que onResult entrega ice servers para instanciar pc
    await lastConnectConfig.onResult({
      type: 'iceservers',
      iceservers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    expect(mockPcInstances.length).toBe(1);
    const pc = mockPcInstances[0];

    manager.stop();
    manager.stop();

    expect(mockFalConnection.close).toHaveBeenCalledTimes(1);
    expect(pc.close).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('useLiveTryon hook integration', () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('VITE_LIVE_TRYON', 'on');
    localStorage.setItem('suzuki_kiosk_key', 'test-kiosk-key');
    vi.clearAllMocks();
    mockPcInstances = [];
    lastConnectConfig = null;
    lastDecartConnectOptions = null;
    LiveTryOnManager._resetActiveInstancesForTesting();
  });

  afterEach(() => {
    global.fetch = origFetch;
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('sin clave de kiosko en localStorage ni URL → showLiveButton es false', () => {
    localStorage.removeItem('suzuki_kiosk_key');
    const stream = new MediaStream() as any;
    const { result } = renderHook(() =>
      useLiveTryon({
        activeGarment: sampleGarment,
        activeVariantId: null,
        cameraStream: stream,
        sessionId: 'test-session',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    expect(result.current.showLiveButton).toBe(false);
  });

  it('con clave de kiosko → showLiveButton es true y envía header X-Kiosk-Key', async () => {
    let capturedHeaders: any = null;
    global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (typeof url === 'string' && url.includes('/live/token')) {
        capturedHeaders = opts.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            apiKey: 'decart-test-token',
            max_seconds: 15,
            live_id: 10,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      });
    });

    const stream = new MediaStream() as any;
    const { result } = renderHook(() =>
      useLiveTryon({
        activeGarment: sampleGarment,
        activeVariantId: null,
        cameraStream: stream,
        sessionId: 'test-session',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    expect(result.current.showLiveButton).toBe(true);

    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    expect(capturedHeaders['X-Kiosk-Key']).toBe('test-kiosk-key');
    act(() => {
      result.current.handleStopLiveTryon();
    });
  });

  it('403 kiosk_key → no reintenta, emite toast y habilita Plan B', async () => {
    let tokenCalls = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/live/token')) {
        tokenCalls++;
        return Promise.resolve({
          ok: false,
          status: 403,
          json: async () => ({ status: 'error', reason: 'kiosk_key' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      });
    });

    const stream = new MediaStream() as any;
    const { result } = renderHook(() =>
      useLiveTryon({
        activeGarment: sampleGarment,
        activeVariantId: null,
        cameraStream: stream,
        sessionId: 'test-session',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    expect(tokenCalls).toBe(1);
    expect(result.current.isLiveLoading).toBe(false);
    expect(result.current.showPlanB).toBe(true);
    expect(result.current.liveToast).toContain('no autorizada');
  });

  it('429 busy → no reintenta, activa cooldown de 30 s, emite toast y habilita Plan B', async () => {
    let tokenCalls = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/live/token')) {
        tokenCalls++;
        return Promise.resolve({
          ok: false,
          status: 429,
          json: async () => ({ status: 'error', reason: 'busy' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      });
    });

    const stream = new MediaStream() as any;
    const { result } = renderHook(() =>
      useLiveTryon({
        activeGarment: sampleGarment,
        activeVariantId: null,
        cameraStream: stream,
        sessionId: 'test-session',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    expect(tokenCalls).toBe(1); // NO reintentar
    expect(result.current.isLiveLoading).toBe(false);
    expect(result.current.isBusyCooldown).toBe(true);
    expect(result.current.isLiveAvailable).toBe(false);
    expect(result.current.showPlanB).toBe(true);
    expect(result.current.liveToast).toContain('ocupada');
  });

  it('error Decart limit (Concurrent session limit) → no reintenta, cooldown 30 s y Plan B', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/live/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            apiKey: 'decart-test-token',
            max_seconds: 15,
            live_id: 99,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      });
    });

    const stream = new MediaStream() as any;
    const { result } = renderHook(() =>
      useLiveTryon({
        activeGarment: sampleGarment,
        activeVariantId: null,
        cameraStream: stream,
        sessionId: 'test-session',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    // Simular error de límite concurrente emitido por Decart SDK
    await act(async () => {
      mockDecartRealtimeClient._emit('error', {
        code: '1013',
        message: 'Decart: Concurrent session limit reached',
      });
    });

    expect(result.current.isLiveLoading).toBe(false);
    expect(result.current.isBusyCooldown).toBe(true);
    expect(result.current.isLiveAvailable).toBe(false);
    expect(result.current.showPlanB).toBe(true);
    expect(result.current.liveToast).toContain('ocupada');
  });

  it('error transitorio → 1 reintento tras >= 10 s', async () => {
    vi.useFakeTimers();

    let tokenCalls = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/live/token')) {
        tokenCalls++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            apiKey: `token-${tokenCalls}`,
            max_seconds: 15,
            live_id: 100 + tokenCalls,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      });
    });

    const stream = new MediaStream() as any;
    const { result } = renderHook(() =>
      useLiveTryon({
        activeGarment: sampleGarment,
        activeVariantId: null,
        cameraStream: stream,
        sessionId: 'test-session',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    await act(async () => {
      await result.current.handleStartLiveTryon();
    });
    expect(tokenCalls).toBe(1);

    // Error transitorio (ej. corte de socket)
    await act(async () => {
      mockDecartRealtimeClient._emit('error', {
        code: 'WEBRTC_WEBSOCKET_ERROR',
        message: 'WebSocket connection lost',
      });
    });

    expect(result.current.isLiveLoading).toBe(true);

    // Avanzar 10s para el reintento
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONCURRENT_RETRY_DELAY_MS);
    });

    expect(tokenCalls).toBe(2);

    act(() => {
      result.current.handleStopLiveTryon();
    });

    vi.useRealTimers();
  });

  it('cuota agotada (remaining === 0) → isQuotaExhausted true, botón deshabilitado', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/live/quota')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ limit: 1, active: 1, remaining: 0 }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      });
    });

    const stream = new MediaStream() as any;
    const { result } = renderHook(() =>
      useLiveTryon({
        activeGarment: sampleGarment,
        activeVariantId: null,
        cameraStream: stream,
        sessionId: 'test-session',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    // Esperar tick de sondeo de cuota
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isQuotaExhausted).toBe(true);
    expect(result.current.isLiveAvailable).toBe(false);
  });

  it('cuota unknown (falla de API) → permite intentar (isQuotaExhausted false)', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/live/quota')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ unknown: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      });
    });

    const stream = new MediaStream() as any;
    const { result } = renderHook(() =>
      useLiveTryon({
        activeGarment: sampleGarment,
        activeVariantId: null,
        cameraStream: stream,
        sessionId: 'test-session',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isQuotaExhausted).toBe(false);
    expect(result.current.isLiveAvailable).toBe(true);
  });

  it('desmontaje durante sesión activa → envía navigator.sendBeacon a /live/complete', async () => {
    let beaconCalled = false;
    let beaconUrl = '';
    let beaconData: any = null;
    const origBeacon = navigator.sendBeacon;
    navigator.sendBeacon = vi.fn().mockImplementation((url: string, data?: any) => {
      beaconCalled = true;
      beaconUrl = url;
      beaconData = data;
      return true;
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/live/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            apiKey: 'decart-test-token',
            max_seconds: 15,
            live_id: 777,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      });
    });

    const stream = new MediaStream() as any;
    const { result, unmount } = renderHook(() =>
      useLiveTryon({
        activeGarment: sampleGarment,
        activeVariantId: null,
        cameraStream: stream,
        sessionId: 'test-session',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    unmount();

    expect(beaconCalled).toBe(true);
    expect(beaconUrl).toContain('/live/complete');
    expect(beaconData).toBeInstanceOf(Blob);
    expect(beaconData.type.toLowerCase()).toBe('text/plain;charset=utf-8');

    navigator.sendBeacon = origBeacon;
  });

  it('al cambiar de prenda durante la sesión activa con Fal, envía la nueva referenceImageUrl', async () => {
    vi.stubEnv('VITE_LIVE_PROVIDER', 'fal');

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/live/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            token: 'test-token',
            max_seconds: 15,
            live_id: 10,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      });
    });

    const stream = new MediaStream() as any;
    const sendGarmentSpy = vi.spyOn(LiveTryOnManager.prototype, 'sendGarment');

    let currentVariant = 'roja';
    const { result, rerender } = renderHook(
      ({ variant }) =>
        useLiveTryon({
          activeGarment: reversibleGarment,
          activeVariantId: variant,
          cameraStream: stream,
          sessionId: 'test-session',
          presence: 'present',
          kioskState: 'TRYON',
          garmentActiveWithProfile: true,
        }),
      { initialProps: { variant: currentVariant } },
    );

    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    // Simular conexión WebRTC establecida
    await act(async () => {
      await lastConnectConfig.onResult({ type: 'iceservers', iceservers: [] });
    });
    act(() => {
      mockPcInstances[0].ontrack?.({ streams: [new MediaStream() as any] });
    });

    expect(result.current.isLiveActive).toBe(true);
    sendGarmentSpy.mockClear();

    // Cambiar a negra
    currentVariant = 'negra';
    rerender({ variant: currentVariant });

    expect(sendGarmentSpy).toHaveBeenCalledWith(
      'https://dadobtx.github.io/suzuki-ar-boutique/garments/990F0-BKQJ5_2.png',
    );
    expect(mockFalConnection.send).toHaveBeenCalledWith(
      expect.objectContaining({
        reference_image_url:
          'https://dadobtx.github.io/suzuki-ar-boutique/garments/990F0-BKQJ5_2.png',
      }),
    );

    act(() => {
      result.current.handleStopLiveTryon();
    });
    sendGarmentSpy.mockRestore();
  });
});
