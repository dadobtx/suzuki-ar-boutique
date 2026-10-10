/**
 * @vitest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, render, act } from '@testing-library/react';
import { LiveTryOnManager } from '@/lib/liveTryon';
import { useLiveTryon, LIVE_COOLDOWN_MS } from '@/hooks/useLiveTryon';
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

// Mock RTCPeerConnection
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

describe('LiveTryOnManager', () => {
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
      onUpdate: vi.fn(),
      onError: vi.fn(),
      onClose,
    };
    const manager = new LiveTryOnManager(config);
    await manager.start();

    // Trigger iceservers so pc is created
    await lastConnectConfig.onResult({ type: 'iceservers', iceservers: [] });
    expect(mockPcInstances.length).toBe(1);
    const pc = mockPcInstances[0];

    manager.stop();
    expect(mockFalConnection.close).toHaveBeenCalledTimes(1);
    expect(pc.close).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Second stop should do nothing
    manager.stop();
    expect(mockFalConnection.close).toHaveBeenCalledTimes(1);
    expect(pc.close).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sendGarment() después de stop() → no llama connection.send', async () => {
    const stream = new MediaStream() as any;
    const config = {
      token: 'tok-1',
      maxSeconds: 15,
      liveId: 101,
      stream,
      referenceImageUrl: 'http://localhost/test1.png',
      onUpdate: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    };
    const manager = new LiveTryOnManager(config);
    await manager.start();

    // Reset calls to mockFalConnection.send (start sends the initial garment)
    mockFalConnection.send.mockClear();

    manager.stop();
    manager.sendGarment('http://localhost/new-garment.png');

    expect(mockFalConnection.send).not.toHaveBeenCalled();
  });

  it('después de stop(), el tokenProvider lanza error', async () => {
    const stream = new MediaStream() as any;
    const config = {
      token: 'secret-jwt-token',
      maxSeconds: 15,
      liveId: 101,
      stream,
      referenceImageUrl: 'http://localhost/test1.png',
      onUpdate: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    };
    const manager = new LiveTryOnManager(config);
    await manager.start();

    // Before stop: returns token
    const token = await lastConnectConfig.tokenProvider();
    expect(token).toBe('secret-jwt-token');

    // After stop: throws error
    manager.stop();
    await expect(lastConnectConfig.tokenProvider()).rejects.toThrow(
      'Live try-on session is closed',
    );
  });

  it('onResult/onError tardíos después de stop() → no llaman config.onError ni onUpdate', async () => {
    const stream = new MediaStream() as any;
    const onError = vi.fn();
    const onUpdate = vi.fn();
    const config = {
      token: 'tok-1',
      maxSeconds: 15,
      liveId: 101,
      stream,
      referenceImageUrl: 'http://localhost/test1.png',
      onUpdate,
      onError,
      onClose: vi.fn(),
    };
    const manager = new LiveTryOnManager(config);
    await manager.start();

    manager.stop();

    // Late onResult with error
    await lastConnectConfig.onResult({ type: 'error', message: 'Late error' });
    // Late onError
    lastConnectConfig.onError(new Error('Late network error'));

    expect(onError).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('activeCount() vuelve a 0 después de stop()', async () => {
    expect(LiveTryOnManager.activeCount()).toBe(0);

    const stream = new MediaStream() as any;
    const config = {
      token: 'tok-1',
      maxSeconds: 15,
      liveId: 101,
      stream,
      referenceImageUrl: 'http://localhost/test1.png',
      onUpdate: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    };

    const manager1 = new LiveTryOnManager(config);
    const manager2 = new LiveTryOnManager(config);
    expect(LiveTryOnManager.activeCount()).toBe(2);

    manager1.stop();
    expect(LiveTryOnManager.activeCount()).toBe(1);

    manager2.stop();
    expect(LiveTryOnManager.activeCount()).toBe(0);
  });
});

describe('useLiveTryon hook integration', () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('VITE_LIVE_TRYON', 'on');
    vi.clearAllMocks();
    mockPcInstances = [];
    lastConnectConfig = null;
    LiveTryOnManager._resetActiveInstancesForTesting();
  });

  afterEach(() => {
    global.fetch = origFetch;
    vi.unstubAllEnvs();
  });

  it('dos llamadas a handleStartLiveTryon en el mismo tick → un solo fetch a /live/token', async () => {
    let tokenFetchCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/live/token')) {
        tokenFetchCount++;
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

    // Call twice in the same tick
    await act(async () => {
      const p1 = result.current.handleStartLiveTryon();
      const p2 = result.current.handleStartLiveTryon();
      await Promise.all([p1, p2]);
    });

    expect(tokenFetchCount).toBe(1);
    act(() => {
      result.current.handleStopLiveTryon();
    });
  });

  it('tras terminar una sesión, isLiveAvailable es false durante 4000 ms y luego true', async () => {
    vi.useFakeTimers();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/live/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            token: 'test-token',
            max_seconds: 15,
            live_id: 20,
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

    // Initially available
    expect(result.current.isLiveAvailable).toBe(true);

    // Start session
    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    // While loading or active, isLiveAvailable is false
    expect(result.current.isLiveAvailable).toBe(false);

    // Stop session
    act(() => {
      result.current.handleStopLiveTryon();
    });

    // Right after stop: cooldown active (remaining 4s), so isLiveAvailable is false and isLiveCoolingDown is true
    expect(result.current.isLiveAvailable).toBe(false);
    expect(result.current.isLiveCoolingDown).toBe(true);

    // Advance 2000 ms (still within cooldown)
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.isLiveAvailable).toBe(false);
    expect(result.current.isLiveCoolingDown).toBe(true);

    // Advance past cooldown (total > 4000 ms)
    act(() => {
      vi.advanceTimersByTime(LIVE_COOLDOWN_MS - 2000 + 500);
    });
    expect(result.current.isLiveAvailable).toBe(true);
    expect(result.current.isLiveCoolingDown).toBe(false);

    vi.useRealTimers();
  });

  it('error "Decart: Concurrent session limit reached." → stop, 5 s, segundo /live/token, segundo start. Si vuelve a fallar → toast live.busy, isLiveLoading false', async () => {
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
            token: `token-${tokenCalls}`,
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

    // Start session 1
    await act(async () => {
      await result.current.handleStartLiveTryon();
    });
    expect(tokenCalls).toBe(1);

    // First error: trigger concurrent session limit
    const firstOnError = lastConnectConfig.onError;
    await act(async () => {
      firstOnError(
        new Error('INTERNAL_ERROR: Decart: Concurrent session limit reached.'),
      );
    });

    // Still loading during retry wait
    expect(result.current.isLiveLoading).toBe(true);

    // Advance 5000 ms for the retry delay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Should have requested a second token
    expect(tokenCalls).toBe(2);

    // Second error: fail again
    const secondOnError = lastConnectConfig.onError;
    await act(async () => {
      secondOnError(
        new Error('INTERNAL_ERROR: Decart: Concurrent session limit reached.'),
      );
    });

    // Now it should give up, display busy toast, and stop loading
    expect(result.current.isLiveLoading).toBe(false);
    expect(result.current.liveToast).toContain('ocupada');

    vi.useRealTimers();
  });

  it('fallo antes de recibir video → /live/complete con failed: true', async () => {
    let completedPayload: any = null;
    global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (typeof url === 'string' && url.includes('/live/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            token: 'test-token',
            max_seconds: 15,
            live_id: 88,
          }),
        });
      }
      if (typeof url === 'string' && url.includes('/live/complete')) {
        completedPayload = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'success' }),
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

    // Stop before receiving any video stream (hadVideoRef is false)
    act(() => {
      result.current.handleStopLiveTryon();
    });

    expect(completedPayload).not.toBeNull();
    expect(completedPayload.live_id).toBe(88);
    expect(completedPayload.seconds).toBe(0);
    expect(completedPayload.failed).toBe(true);
  });

  it('getCameraStream devuelve null → toast live.error e isLiveLoading false', async () => {
    const { result } = renderHook(() =>
      useLiveTryon({
        activeGarment: sampleGarment,
        activeVariantId: null,
        getCameraStream: () => null,
        sessionId: 'test-session',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    expect(result.current.isLiveLoading).toBe(false);
    expect(result.current.liveToast).toContain('No pudimos iniciar la prueba en vivo');
    expect(result.current.isLiveActive).toBe(false);
  });

  it('después de terminar una sesión el botón tiene el atributo disabled durante 4 s y luego no', async () => {
    vi.useFakeTimers();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/live/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            token: 'test-token',
            max_seconds: 15,
            live_id: 20,
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

    function TestLiveButton() {
      const {
        isLiveLoading,
        isLiveActive,
        isLiveCoolingDown,
        handleStartLiveTryon,
        handleStopLiveTryon,
      } = useLiveTryon({
        activeGarment: sampleGarment,
        activeVariantId: null,
        cameraStream: stream,
        sessionId: 'test-session',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      });

      return React.createElement(
        'div',
        null,
        React.createElement(
          'button',
          {
            'data-testid': 'live-button',
            disabled: isLiveLoading || isLiveActive || isLiveCoolingDown,
            onClick: handleStartLiveTryon,
          },
          'VERME EN VIVO',
        ),
        React.createElement(
          'button',
          {
            'data-testid': 'stop-button',
            onClick: handleStopLiveTryon,
          },
          'STOP',
        ),
      );
    }

    const { getByTestId } = render(React.createElement(TestLiveButton));
    const liveBtn = getByTestId('live-button') as HTMLButtonElement;
    const stopBtn = getByTestId('stop-button') as HTMLButtonElement;

    // Inicialmente disponible y no deshabilitado
    expect(liveBtn.hasAttribute('disabled')).toBe(false);

    // Iniciar sesión
    await act(async () => {
      liveBtn.click();
    });
    expect(liveBtn.hasAttribute('disabled')).toBe(true);

    // Terminar sesión
    act(() => {
      stopBtn.click();
    });

    // Inmediatamente después de terminar: enfriamiento activo → tiene atributo disabled
    expect(liveBtn.hasAttribute('disabled')).toBe(true);

    // A los 2 s (dentro de los 4 s) → sigue teniendo atributo disabled
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(liveBtn.hasAttribute('disabled')).toBe(true);

    // Pasados los 4 s (4000 ms + tick del intervalo) → ya no tiene el atributo disabled
    act(() => {
      vi.advanceTimersByTime(LIVE_COOLDOWN_MS - 2000 + 500);
    });
    expect(liveBtn.hasAttribute('disabled')).toBe(false);

    vi.useRealTimers();
  });

  it('la URL enviada a Lucy para 990F0-BKQJ5 variante roja es exactamente https://dadobtx.github.io/suzuki-ar-boutique/garments/990F0-BKQJ5.png y para negra es ..._2.png', async () => {
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

    // 1. Variante 'roja'
    const sendGarmentSpy = vi.spyOn(LiveTryOnManager.prototype, 'sendGarment');

    const { result: rojaResult } = renderHook(() =>
      useLiveTryon({
        activeGarment: reversibleGarment,
        activeVariantId: 'roja',
        cameraStream: stream,
        sessionId: 'test-session',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    await act(async () => {
      await rojaResult.current.handleStartLiveTryon();
    });

    expect(sendGarmentSpy).toHaveBeenCalledWith(
      'https://dadobtx.github.io/suzuki-ar-boutique/garments/990F0-BKQJ5.png',
    );
    expect(mockFalConnection.send).toHaveBeenCalledWith(
      expect.objectContaining({
        reference_image_url:
          'https://dadobtx.github.io/suzuki-ar-boutique/garments/990F0-BKQJ5.png',
      }),
    );

    act(() => {
      rojaResult.current.handleStopLiveTryon();
    });
    sendGarmentSpy.mockClear();
    mockFalConnection.send.mockClear();

    // 2. Variante 'negra'
    const { result: negraResult } = renderHook(() =>
      useLiveTryon({
        activeGarment: reversibleGarment,
        activeVariantId: 'negra',
        cameraStream: stream,
        sessionId: 'test-session',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    await act(async () => {
      await negraResult.current.handleStartLiveTryon();
    });

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
      negraResult.current.handleStopLiveTryon();
    });
    sendGarmentSpy.mockRestore();
  });

  it('al cambiar de prenda o variante durante la sesión activa, Lucy recibe la nueva referenceImageUrl', async () => {
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

    // Iniciar sesión con variante roja
    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    expect(sendGarmentSpy).toHaveBeenLastCalledWith(
      'https://dadobtx.github.io/suzuki-ar-boutique/garments/990F0-BKQJ5.png',
    );

    // Simular que se establece la conexión WebRTC y pasa a estado 'active'
    await act(async () => {
      await lastConnectConfig.onResult({ type: 'iceservers', iceservers: [] });
    });
    act(() => {
      mockPcInstances[0].ontrack?.({ streams: [new MediaStream() as any] });
    });

    expect(result.current.isLiveActive).toBe(true);
    sendGarmentSpy.mockClear();
    mockFalConnection.send.mockClear();

    // Cambiar a variante negra durante la sesión activa
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
