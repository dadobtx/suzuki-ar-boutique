/**
 * @vitest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, render, act } from '@testing-library/react';
import { useLiveTryon } from '@/hooks/useLiveTryon';
import { useLiveTryonStore } from '@/store/liveTryon';
import { useGarmentStore } from '@/store/garment';
import { useHandCursorStore } from '@/store/handCursor';
import { RackPanel } from '@/components/rack/RackPanel';
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
let mockPcInstances: any[] = [];
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
// @ts-expect-error Mocking global RTCPeerConnection
globalThis.RTCPeerConnection = MockRTCPeerConnection;

class MockMediaStream {
  getTracks = vi.fn().mockReturnValue([{ stop: vi.fn(), kind: 'video' }]);
}
// @ts-expect-error Mocking global MediaStream
globalThis.MediaStream = MockMediaStream;

const garment1: Garment = {
  id: 'g-1',
  sku: 'SUZ-TS-01',
  name: 'Camiseta Suzuki',
  category: 'top',
  gender: 'unisex',
  defaultPrice: 35,
  images: { front: '/garments/front.png', flat: '/garments/flat.png' },
  layers: { overlay: '/garments/overlay.png' },
  overlayUrl: '/garments/overlay.png',
};

const garment2: Garment = {
  id: 'g-2',
  sku: 'SUZ-JK-02',
  name: 'Chaqueta Suzuki',
  category: 'top',
  gender: 'unisex',
  defaultPrice: 120,
  images: { front: '/garments/front2.png', flat: '/garments/flat2.png' },
  layers: { overlay: '/garments/overlay2.png' },
  overlayUrl: '/garments/overlay2.png',
};

describe('Live Try-On Stability (Prompt 3.4)', () => {
  let mockStream: MediaStream;

  beforeEach(() => {
    vi.stubEnv('VITE_LIVE_TRYON', 'on');
    vi.useFakeTimers();
    mockPcInstances = [];
    lastConnectConfig = null;
    mockStream = new MockMediaStream() as unknown as MediaStream;

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/live/token')) {
        return Promise.resolve({
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'success',
              token: 'mock-token-xyz',
              max_seconds: 30,
              live_id: 123,
            }),
        });
      }
      return Promise.resolve({
        status: 200,
        json: () => Promise.resolve({}),
      });
    });

    useLiveTryonStore.setState({
      managerState: 'idle',
      connectionKey: null,
      activeCount: 0,
      cooldownRemainingSec: 0,
      lastError: null,
      isLiveActive: false,
      isLiveLoading: false,
      isLiveAvailable: true,
      firstFrameRendered: false,
      failed: false,
    });

    useGarmentStore.setState({
      catalog: [garment1, garment2],
      activeGarmentId: garment1.id,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('1. Timeout de 25 s llama a stop() y emite el toast de connectTimeout', async () => {
    const { result } = renderHook(() =>
      useLiveTryon({
        activeGarment: garment1,
        cameraStream: mockStream,
        sessionId: 'session-timeout',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    // Iniciar conexión
    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    expect(result.current.isLiveLoading).toBe(true);
    expect(result.current.firstFrameRendered).toBe(false);

    // Avanzar 24 segundos (aún no cumple el timeout)
    act(() => {
      vi.advanceTimersByTime(24000);
    });
    expect(result.current.isLiveLoading).toBe(true);
    expect(result.current.liveToast).toBeNull();

    // Avanzar 1.1 segundos más (supera los 25 s sin recibir video)
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    // Sesión debe haberse detenido y toast emitido
    expect(result.current.isLiveLoading).toBe(false);
    expect(result.current.isLiveActive).toBe(false);
    expect(result.current.liveToast).toMatch(/No pudimos conectar con Lucy/i);
    expect(useLiveTryonStore.getState().failed).toBe(true);
  });

  it('2. Cambio de prenda durante isLiveLoading cancela la sesión', async () => {
    let currentGarment = garment1;
    const { result, rerender } = renderHook(() =>
      useLiveTryon({
        activeGarment: currentGarment,
        cameraStream: mockStream,
        sessionId: 'session-garment-change',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    expect(result.current.isLiveLoading).toBe(true);

    // Cambiar la prenda activa mientras está cargando
    currentGarment = garment2;
    act(() => {
      rerender();
    });

    // La sesión debe cancelarse inmediatamente con failed: true
    expect(result.current.isLiveLoading).toBe(false);
    expect(result.current.isLiveActive).toBe(false);
    expect(useLiveTryonStore.getState().failed).toBe(true);
  });

  it('3. Paso de mano durante isLiveLoading produce 0 cambios de prenda', async () => {
    useGarmentStore.setState({
      catalog: [garment1, garment2],
      activeGarmentId: garment1.id,
    });

    const onCancelLiveMock = vi.fn();

    render(
      <RackPanel
        mode="interactive"
        active={true}
        isLiveActive={false}
        isLiveLoading={true}
        onCancelLive={onCancelLiveMock}
      />,
    );

    // Emitir paso de mano hacia el índice 1 (garment2)
    act(() => {
      useHandCursorStore.setState({
        lastEvent: {
          type: 'step',
          index: 1,
          direction: 'right',
        } as any,
      });
    });

    // Avanzar timers
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // La prenda activa sigue siendo garment1: 0 cambios de prenda
    expect(useGarmentStore.getState().activeGarmentId).toBe(garment1.id);
    expect(onCancelLiveMock).not.toHaveBeenCalled();
  });

  it('3b. Toque directo de otra prenda durante isLiveLoading llama onCancelLive()', async () => {
    useGarmentStore.setState({
      catalog: [garment1, garment2],
      activeGarmentId: garment1.id,
    });

    const onCancelLiveMock = vi.fn();

    const { container } = render(
      <RackPanel
        mode="interactive"
        active={true}
        isLiveActive={false}
        isLiveLoading={true}
        onCancelLive={onCancelLiveMock}
      />,
    );

    const slots = container.querySelectorAll('.rack-slot');
    expect(slots.length).toBe(2);

    await act(async () => {
      (slots[1] as HTMLElement).click();
    });

    expect(onCancelLiveMock).toHaveBeenCalled();
  });

  it('4. Timer de cuenta regresiva no arranca hasta el evento de primer cuadro', async () => {
    const { result } = renderHook(() =>
      useLiveTryon({
        activeGarment: garment1,
        cameraStream: mockStream,
        sessionId: 'session-countdown',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    expect(result.current.isLiveLoading).toBe(true);

    // Entregar ice servers para que se inicialice WebRTC
    await act(async () => {
      await lastConnectConfig.onResult({
        type: 'iceservers',
        iceservers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
    });

    expect(mockPcInstances.length).toBeGreaterThan(0);
    const pc = mockPcInstances[0];

    // Simular recepción de track WebRTC (ontrack)
    const mockRemoteStream = new MockMediaStream() as unknown as MediaStream;
    act(() => {
      pc.ontrack({ streams: [mockRemoteStream] });
    });

    // Track recibido: isLiveActive es true, pero primer cuadro AÚN NO renderizó
    expect(result.current.isLiveActive).toBe(true);
    expect(result.current.firstFrameRendered).toBe(false);
    expect(result.current.liveCountdown).toBeNull();

    // Avanzar 3 segundos: el countdown NO debe haber arrancado ni bajado
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.liveCountdown).toBeNull();

    // Notificar primer cuadro renderizado
    act(() => {
      result.current.notifyFirstFrame();
    });

    // Ahora arranca la cuenta regresiva en max_seconds (30)
    expect(result.current.firstFrameRendered).toBe(true);
    expect(result.current.liveCountdown).toBe(30);

    // Avanzar 1 segundo: baja a 29
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.liveCountdown).toBe(29);
  });

  it('5. Tras un timeout, isLiveAvailable es false durante 4 s de enfriamiento', async () => {
    const { result } = renderHook(() =>
      useLiveTryon({
        activeGarment: garment1,
        cameraStream: mockStream,
        sessionId: 'session-timeout-cooldown',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    // Timeout a los 25 s
    act(() => {
      vi.advanceTimersByTime(25100);
    });

    expect(result.current.isLiveLoading).toBe(false);
    expect(useLiveTryonStore.getState().failed).toBe(true);
    // Inmediatamente después del timeout: en enfriamiento de 4 s, isLiveAvailable es false
    expect(useLiveTryonStore.getState().isLiveAvailable).toBe(false);

    // Avanzar 2 segundos: aún dentro de los 4 s de enfriamiento
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(useLiveTryonStore.getState().isLiveAvailable).toBe(false);

    // Avanzar 2.1 segundos más (supera los 4 s de enfriamiento): vuelve a estar disponible
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(useLiveTryonStore.getState().isLiveAvailable).toBe(true);
  });

  it('6. Con un reintento por límite concurrente a los 10 s, el timeout ocurre a los 25 s del inicio, no a los 35 s', async () => {
    const { result } = renderHook(() =>
      useLiveTryon({
        activeGarment: garment1,
        cameraStream: mockStream,
        sessionId: 'session-retry-timeout',
        presence: 'present',
        kioskState: 'TRYON',
        garmentActiveWithProfile: true,
      }),
    );

    await act(async () => {
      await result.current.handleStartLiveTryon();
    });

    expect(result.current.isLiveLoading).toBe(true);

    // Avanzar 10 segundos
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Simular error de límite concurrente a los 10 s disparando el callback onError
    await act(async () => {
      lastConnectConfig.onError(new Error('Concurrent session limit reached'));
    });

    // En retry, stopInternal(true) mantiene isLiveLoading: true
    expect(result.current.isLiveLoading).toBe(true);

    // Esperar los 5s de retraso antes del reintento (t = 15 s desde el inicio)
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.isLiveLoading).toBe(true);

    // Avanzar 9.9 segundos más (t = 24.9 s desde el inicio): aún no se cumple el plazo global de 25 s
    act(() => {
      vi.advanceTimersByTime(9900);
    });
    expect(result.current.isLiveLoading).toBe(true);
    expect(result.current.liveToast).toBeNull();

    // Avanzar 200 ms más (t = 25.1 s desde el inicio): el timeout global de 25 s se dispara!
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Debe haberse detenido por timeout a los 25 s originales (no a los 35 s o 40 s)
    expect(result.current.isLiveLoading).toBe(false);
    expect(result.current.liveToast).toMatch(/No pudimos conectar con Lucy/i);
    expect(useLiveTryonStore.getState().failed).toBe(true);
  });
});
