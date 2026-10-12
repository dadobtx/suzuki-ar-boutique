// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  act,
  renderHook,
  cleanup,
} from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import type { Garment } from '@/types/garment';
import { RackPanel } from '@/components/rack/RackPanel';
import { VariantControls } from '@/components/camera/VariantControls';
import { SizingControls } from '@/components/camera/SizingControls';
import { useGarmentStore } from '@/store/garment';
import { useHandCursorStore } from '@/store/handCursor';
import { useLayoutStore } from '@/store/layout';
import { useSelectionUiStore } from '@/store/selectionUi';
import { useLiveTryonStore } from '@/store/liveTryon';
import { useKioskStore } from '@/store/kiosk';
import { useSizingStore } from '@/store/sizing';
import { useHandCursor } from '@/hooks/useHandCursor';
import { useHandGuide } from '@/lib/hand-guide';
import { toTrackerPauseUntil } from '@/lib/hand-pause-clock';

const catalogJson: Garment[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'public/catalog.json'), 'utf-8'),
);

const START_EPOCH_MS = 1_760_000_000_000;
const START_PERF_MS = 120_000;

describe('Unificación de reloj: Pausa táctil y gestos de mano', () => {
  const originalLocation = window.location;
  let nextVideoCb:
    | ((now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void)
    | null = null;
  let videoRef: { current: HTMLVideoElement };
  const mockPose = { landmarks: null, activeZone: null, frameId: 1 } as never;

  async function stepFrame(advanceMs = 50) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(advanceMs);
      if (nextVideoCb) {
        const cb = nextVideoCb;
        nextVideoCb = null;
        cb(performance.now(), {} as VideoFrameCallbackMetadata);
      }
    });
  }

  async function pumpFrames(count = 1, intervalMs = 50) {
    for (let i = 0; i < count; i++) {
      await stepFrame(intervalMs);
    }
  }

  async function advanceWithFrames(totalMs: number, frameStepMs = 50) {
    const steps = Math.floor(totalMs / frameStepMs);
    for (let i = 0; i < steps; i++) {
      await stepFrame(frameStepMs);
    }
    const remainder = totalMs % frameStepMs;
    if (remainder > 0) {
      await stepFrame(remainder);
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    document.body.innerHTML = '';
    nextVideoCb = null;

    // Configurar dos relojes con orígenes distintos simulando el navegador:
    // Date.now() en época Unix (~1.76e12) y performance.now() arrancando en ~120000 ms
    vi.useFakeTimers({ now: START_EPOCH_MS });
    vi.spyOn(performance, 'now').mockImplementation(
      () => START_PERF_MS + (Date.now() - START_EPOCH_MS),
    );

    // Mock HTMLVideoElement callbacks
    HTMLVideoElement.prototype.requestVideoFrameCallback = vi.fn((cb) => {
      nextVideoCb = cb;
      return 1;
    });
    HTMLVideoElement.prototype.cancelVideoFrameCallback = vi.fn(() => {
      nextVideoCb = null;
    });

    if (!Element.prototype.animate) {
      Element.prototype.animate = vi.fn().mockReturnValue({
        finished: Promise.resolve(),
        cancel: vi.fn(),
      });
    }

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    sessionStorage.setItem('suzuki-hand-input', '1');
    sessionStorage.setItem('suzuki-debug', '1');
    sessionStorage.setItem('suzuki-selection-ui', 'perchero');

    delete (window as unknown as { location?: unknown }).location;
    window.location = new URL(
      'http://localhost:5173/?ui=perchero&hand=1&debug=1&hand_sim=1',
    ) as unknown as Location;

    useGarmentStore.setState({
      activeGarmentId: null,
      activeVariantId: null,
      catalog: catalogJson,
      wishlist: [],
    });

    useLayoutStore.setState({ mode: 'portrait' });
    useSelectionUiStore.setState({ ui: 'perchero', source: 'url' });
    useKioskStore.setState({ state: 'TRYON' });
    useSizingStore.setState({ hasProfile: true });

    useLiveTryonStore.setState({
      isLiveActive: false,
      isLiveLoading: false,
      isLiveAvailable: true,
      lastError: null,
    });

    useHandCursorStore.getState().reset();
    videoRef = { current: document.createElement('video') };
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  describe('2.1 Helper puro toTrackerPauseUntil', () => {
    it('convierte remanente de época Unix al reloj performance.now: perfNow 120000, epochNow 1.76e12, pausa = epochNow + 2000 -> 122000', () => {
      const epochNow = 1.76e12;
      const perfNow = 120000;
      const pausedUntilEpoch = epochNow + 2000;
      expect(toTrackerPauseUntil(pausedUntilEpoch, perfNow, epochNow)).toBe(122000);
    });

    it('pausa vencida -> 0; pausa 0 -> 0', () => {
      const epochNow = 1.76e12;
      const perfNow = 120000;
      expect(toTrackerPauseUntil(epochNow - 100, perfNow, epochNow)).toBe(0);
      expect(toTrackerPauseUntil(epochNow, perfNow, epochNow)).toBe(0);
      expect(toTrackerPauseUntil(0, perfNow, epochNow)).toBe(0);
    });

    it('el resultado SIEMPRE es < perfNow + 2001 (nunca del orden de 1e12)', () => {
      const epochNow = 1.76e12;
      const perfNow = 120000;
      const pausedUntilEpoch = epochNow + 2000;
      const result = toTrackerPauseUntil(pausedUntilEpoch, perfNow, epochNow);
      expect(result).toBeLessThan(perfNow + 2001);
      expect(result).toBeLessThan(1e6);
      expect(result).not.toBeGreaterThan(1e11);
    });
  });

  describe('2.2 Integración y regresión a nivel de hook: BKQJ5 negra y roja', () => {
    it('al tocar "negra" en BKQJ5: pausa 2 s (guía en "raise"); a 1 s el paso NO cambia prenda; tras 2.1 s el paso SÍ cambia prenda', async () => {
      const bkqj5Garment = catalogJson.find((g) => g.id === '990F0-BKQJ5')!;
      const bkqj5Idx = catalogJson.findIndex((g) => g.id === '990F0-BKQJ5');
      const nextGarment = catalogJson[bkqj5Idx + 1];

      useGarmentStore.setState({
        activeGarmentId: bkqj5Garment.id,
        activeVariantId: 'roja',
      });

      renderHook(() =>
        useHandCursor(videoRef, mockPose, {
          active: true,
          isLiveAvailable: true,
          isLiveActive: false,
        }),
      );

      render(
        <div>
          <VariantControls />
          <RackPanel mode="interactive" active={true} />
        </div>,
      );

      // Activar cursor simulado centrado
      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await pumpFrames(8, 50);
      expect(useHandCursorStore.getState().cursor.active).toBe(true);

      const [blackBtn] = screen.getAllByLabelText('Color Negra');

      // pointerdown real con touch sobre el botón
      act(() => {
        fireEvent.pointerDown(blackBtn, { pointerType: 'touch' });
        fireEvent.click(blackBtn);
      });

      expect(useGarmentStore.getState().activeVariantId).toBe('negra');
      expect(useHandCursorStore.getState().pausedUntilMs).toBe(Date.now() + 2000);
      expect(useHandCursorStore.getState().pauseOrigin).toBe('touch');

      // Durante la pausa: la guía muestra 'raise'
      const { result: guideRef } = renderHook(() =>
        useHandGuide({ isInteractive: true }),
      );
      expect(guideRef.current.state).toBe('raise');

      // Intentar dar paso desplazando la mano a la derecha (x: 0.7) durante la pausa
      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );

      // Avanzar 1 s (dentro de los 2 s de pausa)
      await advanceWithFrames(1000, 50);
      expect(useGarmentStore.getState().activeGarmentId).toBe(bkqj5Garment.id);
      expect(useHandCursorStore.getState().cursor.stepBlockedReason).toBe(
        'pausado (táctil)',
      );

      // Centrar mano y avanzar hasta que la pausa venza (2050 ms en total)
      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await advanceWithFrames(1050, 50);

      // Al vencer la pausa con mano activa y centrada: la guía vuelve a 'move-right' sin tocar el store
      expect(guideRef.current.state).toBe('move-right');

      // El mismo gesto de paso a la derecha ahora SÍ dispara el paso
      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );
      await pumpFrames(4, 50);

      // Avanzar tiempo para que termine la animación / crossfade de la prenda
      await advanceWithFrames(700, 50);
      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });

    it('al tocar "roja" en BKQJ5: pausa 2 s; a 1 s el paso NO cambia prenda; tras 2.1 s el paso SÍ cambia prenda', async () => {
      const bkqj5Garment = catalogJson.find((g) => g.id === '990F0-BKQJ5')!;
      const bkqj5Idx = catalogJson.findIndex((g) => g.id === '990F0-BKQJ5');
      const nextGarment = catalogJson[bkqj5Idx + 1];

      useGarmentStore.setState({
        activeGarmentId: bkqj5Garment.id,
        activeVariantId: 'negra',
      });

      renderHook(() =>
        useHandCursor(videoRef, mockPose, {
          active: true,
          isLiveAvailable: true,
          isLiveActive: false,
        }),
      );

      render(
        <div>
          <VariantControls />
          <RackPanel mode="interactive" active={true} />
        </div>,
      );

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await pumpFrames(8, 50);
      expect(useHandCursorStore.getState().cursor.active).toBe(true);

      const [redBtn] = screen.getAllByLabelText('Color Roja');

      act(() => {
        fireEvent.pointerDown(redBtn, { pointerType: 'touch' });
        fireEvent.click(redBtn);
      });

      expect(useGarmentStore.getState().activeVariantId).toBe('roja');
      expect(useHandCursorStore.getState().pausedUntilMs).toBe(Date.now() + 2000);

      // Intentar dar paso a la derecha durante la pausa
      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );
      await advanceWithFrames(1000, 50);
      expect(useGarmentStore.getState().activeGarmentId).toBe(bkqj5Garment.id);
      expect(useHandCursorStore.getState().cursor.stepBlockedReason).toBe(
        'pausado (táctil)',
      );

      // Avanzar hasta superar los 2 s de pausa
      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await advanceWithFrames(1050, 50);

      // Ahora dar el paso a la derecha
      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );
      await pumpFrames(4, 50);
      await advanceWithFrames(700, 50);

      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });
  });

  describe('2.3 Integración con Jimny (990F0-JYFJ1): interacción táctil variada', () => {
    const jimnyGarment = catalogJson.find((g) => g.id === '990F0-JYFJ1')!;
    const jimnyIdx = catalogJson.findIndex((g) => g.id === '990F0-JYFJ1');
    const nextGarment = catalogJson[jimnyIdx + 1];

    beforeEach(() => {
      useGarmentStore.setState({
        activeGarmentId: jimnyGarment.id,
        activeVariantId: null,
      });

      renderHook(() =>
        useHandCursor(videoRef, mockPose, {
          active: true,
          isLiveAvailable: true,
          isLiveActive: false,
        }),
      );
    });

    it('pointerdown en VERME EN VIVO -> a 1 s paso bloqueado; tras 2.1 s el paso cambia prenda', async () => {
      render(
        <div>
          <button type="button" aria-label="VERME EN VIVO">
            VERME EN VIVO
          </button>
          <RackPanel mode="interactive" active={true} />
        </div>,
      );

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await pumpFrames(8, 50);
      expect(useHandCursorStore.getState().cursor.active).toBe(true);

      const liveBtn = screen.getByRole('button', { name: /verme en vivo/i });
      act(() => {
        fireEvent.pointerDown(liveBtn, { pointerType: 'touch' });
      });
      expect(useHandCursorStore.getState().pausedUntilMs).toBe(Date.now() + 2000);

      // A 1 s el paso está bloqueado
      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );
      await advanceWithFrames(1000, 50);
      expect(useGarmentStore.getState().activeGarmentId).toBe(jimnyGarment.id);
      expect(useHandCursorStore.getState().cursor.stepBlockedReason).toBe(
        'pausado (táctil)',
      );

      // Avanzar a 2.1 s y ejecutar paso
      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await advanceWithFrames(1050, 50);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );
      await pumpFrames(4, 50);
      await advanceWithFrames(700, 50);

      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });

    it('pointerdown en DISPARAR FOTO -> a 1 s paso bloqueado; tras 2.1 s el paso cambia prenda', async () => {
      render(
        <div>
          <button type="button" aria-label="DISPARAR FOTO">
            DISPARAR FOTO
          </button>
          <RackPanel mode="interactive" active={true} />
        </div>,
      );

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await pumpFrames(8, 50);
      expect(useHandCursorStore.getState().cursor.active).toBe(true);

      const photoBtn = screen.getByRole('button', { name: /disparar foto/i });
      act(() => {
        fireEvent.pointerDown(photoBtn, { pointerType: 'touch' });
      });
      expect(useHandCursorStore.getState().pausedUntilMs).toBe(Date.now() + 2000);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );
      await advanceWithFrames(1000, 50);
      expect(useGarmentStore.getState().activeGarmentId).toBe(jimnyGarment.id);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await advanceWithFrames(1050, 50);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );
      await pumpFrames(4, 50);
      await advanceWithFrames(700, 50);

      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });

    it('toque en el perchero -> a 1 s paso bloqueado; tras 2.1 s el paso cambia prenda', async () => {
      render(<RackPanel mode="interactive" active={true} />);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await pumpFrames(8, 50);
      expect(useHandCursorStore.getState().cursor.active).toBe(true);

      const rackPanel = screen.getByTestId('rack-panel');
      act(() => {
        fireEvent.pointerDown(rackPanel, { pointerType: 'touch' });
      });
      expect(useHandCursorStore.getState().pausedUntilMs).toBe(Date.now() + 2000);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );
      await advanceWithFrames(1000, 50);
      expect(useGarmentStore.getState().activeGarmentId).toBe(jimnyGarment.id);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await advanceWithFrames(1050, 50);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );
      await pumpFrames(4, 50);
      await advanceWithFrames(700, 50);

      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });

    it('toque en talla +/- -> a 1 s paso bloqueado; tras 2.1 s el paso cambia prenda', async () => {
      render(
        <div>
          <SizingControls garment={jimnyGarment} />
          <RackPanel mode="interactive" active={true} />
        </div>,
      );

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await pumpFrames(8, 50);
      expect(useHandCursorStore.getState().cursor.active).toBe(true);

      const sizeBtn = screen.getByLabelText('Talla más grande');
      act(() => {
        fireEvent.pointerDown(sizeBtn, { pointerType: 'touch' });
      });
      expect(useHandCursorStore.getState().pausedUntilMs).toBe(Date.now() + 2000);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );
      await advanceWithFrames(1000, 50);
      expect(useGarmentStore.getState().activeGarmentId).toBe(jimnyGarment.id);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await advanceWithFrames(1050, 50);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );
      await pumpFrames(4, 50);
      await advanceWithFrames(700, 50);

      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });

    it('toque en REINICIAR del perchero -> a 1 s paso bloqueado; tras 2.1 s el paso cambia prenda', async () => {
      render(<RackPanel mode="interactive" active={true} />);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await pumpFrames(8, 50);
      expect(useHandCursorStore.getState().cursor.active).toBe(true);

      const restartBtn = screen.getByRole('button', { name: /reiniciar/i });
      act(() => {
        fireEvent.pointerDown(restartBtn, { pointerType: 'touch' });
      });
      expect(useHandCursorStore.getState().pausedUntilMs).toBe(Date.now() + 2000);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );
      await advanceWithFrames(1000, 50);
      expect(useGarmentStore.getState().activeGarmentId).toBe(jimnyGarment.id);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await advanceWithFrames(1050, 50);

      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.7, y: 0.5 } }),
      );
      await pumpFrames(4, 50);
      await advanceWithFrames(700, 50);

      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });
  });

  describe('2.4 Gesto del índice sin pointerdown', () => {
    it('el gesto del índice no genera pointerdown y no pausa por toque (pausedUntilMs = 0)', async () => {
      renderHook(() =>
        useHandCursor(videoRef, mockPose, {
          active: true,
          isLiveAvailable: true,
          isLiveActive: false,
        }),
      );

      // Iniciar simulación con mano abierta
      window.dispatchEvent(
        new CustomEvent('kiosk-hand-sim-move', { detail: { x: 0.5, y: 0.5 } }),
      );
      await pumpFrames(8, 50);
      expect(useHandCursorStore.getState().cursor.active).toBe(true);

      // Activar tecla 'I' (gesto de índice) sin ningún pointerdown
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }));
      await pumpFrames(4, 50);

      expect(useHandCursorStore.getState().cursor.gesture).toBe('Pointing_Up');
      expect(useHandCursorStore.getState().pausedUntilMs).toBe(0);
      expect(useHandCursorStore.getState().pauseOrigin).toBeNull();

      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'i' }));
    });
  });
});
