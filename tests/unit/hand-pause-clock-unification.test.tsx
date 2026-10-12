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
import { useGarmentStore } from '@/store/garment';
import { useHandCursorStore } from '@/store/handCursor';
import { useLayoutStore } from '@/store/layout';
import { useSelectionUiStore } from '@/store/selectionUi';
import { useLiveTryonStore } from '@/store/liveTryon';
import { useKioskStore } from '@/store/kiosk';
import { useSizingStore } from '@/store/sizing';
import { useHandCursor } from '@/hooks/useHandCursor';
import { useHandGuide } from '@/lib/hand-guide';
import {
  HandCursorTracker,
  type DetectedHandInput,
  type HandFrameUser,
} from '@/lib/hand-cursor';

const catalogJson: Garment[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'public/catalog.json'), 'utf-8'),
);

const makeUser = (sw = 0.2): HandFrameUser => ({
  lockedWrists: {
    left: { x: 0.65, y: 0.6 },
    right: { x: 0.35, y: 0.6 },
  },
  sw,
  cx: 0.5,
});

const makeRightHand = (palmX: number): DetectedHandInput => ({
  wrist: { x: 0.35, y: 0.6 },
  palmCenter: { x: palmX, y: 0.5 },
  gesture: 'Open_Palm',
  score: 0.9,
  handedness: 'Right',
});

const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

describe('Unificación de reloj: Pausa táctil y gestos de mano', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    document.body.innerHTML = '';
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

    useGarmentStore.setState({
      activeGarmentId: null,
      activeVariantId: null,
      catalog: catalogJson,
      wishlist: [],
    });

    useLayoutStore.setState({ mode: 'portrait' });
    useSelectionUiStore.setState({ ui: 'perchero', source: 'session' });
    useKioskStore.setState({ state: 'TRYON' });
    useSizingStore.setState({ hasProfile: true });

    useLiveTryonStore.setState({
      isLiveActive: false,
      isLiveLoading: false,
      isLiveAvailable: true,
      lastError: null,
    });

    useHandCursorStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  describe('1. Unit del hook/tracker: nowMs pequeño (performance.now = 120000) y pause(2000)', () => {
    it('durante 2 s no hay pasos y stepBlockedReason es "pausado (táctil)"; a los 2.1 s el gesto da 1 paso', () => {
      const tracker = new HandCursorTracker();
      const user = makeUser(0.2);

      let currentPerfMs = 120000;

      // 1. Activar el cursor durante 400 ms (palma derecha en wrist x = 0.35)
      let initOut = null;
      for (let i = 0; i < 8; i++) {
        currentPerfMs += 50;
        initOut = tracker.update({
          nowMs: currentPerfMs,
          hands: [makeRightHand(0.35)],
          user,
          itemCount: 6,
          currentIndex: 2,
          busy: false,
          pausedUntilMs: 0,
        });
      }
      expect(initOut?.cursor.active).toBe(true);
      const anchor = initOut!.cursor.anchorX!;
      expect(anchor).toBeCloseTo(0.65, 1);

      // 2. Ocurre una pausa táctil de 2000 ms en el store
      useHandCursorStore.getState().pause(2000, 'touch');
      const storePausedUntilMs = useHandCursorStore.getState().pausedUntilMs;
      expect(storePausedUntilMs).toBeGreaterThan(1e12);

      const pauseStartDateMs = Date.now();
      const pauseStartPerfMs = currentPerfMs;

      const computePausedUntilPerf = (elapsedMs: number) => {
        const simulatedDateMs = pauseStartDateMs + elapsedMs;
        const simulatedPerfMs = pauseStartPerfMs + elapsedMs;
        return storePausedUntilMs > simulatedDateMs
          ? simulatedPerfMs + (storePausedUntilMs - simulatedDateMs)
          : 0;
      };

      // 3. Durante los primeros 1800 ms de la pausa (elapsed < 2000 ms):
      // Mano se desplaza a la derecha (d = +0.6). Cada frame debe estar bloqueado por pausa táctil.
      const palmShifted = 1 - (anchor + 0.6 * 0.2);
      let stepCountDuringPause = 0;
      for (let elapsed = 100; elapsed <= 1800; elapsed += 100) {
        const out = tracker.update({
          nowMs: pauseStartPerfMs + elapsed,
          hands: [makeRightHand(palmShifted)],
          user,
          itemCount: 6,
          currentIndex: 2,
          busy: false,
          pausedUntilMs: computePausedUntilPerf(elapsed),
        });
        stepCountDuringPause += out.events.filter((e) => e.type === 'step').length;
        expect(out.cursor.stepBlockedReason).toBe('pausado (táctil)');
      }
      expect(stepCountDuringPause).toBe(0);

      // 4. A los 2100 ms tras la pausa (elapsed = 2100 ms > 2000 ms): la pausa expiró
      const expiredPerf = computePausedUntilPerf(2100);
      expect(expiredPerf).toBe(0);

      // Tras expirar la pausa, el gesto desplazado dispara 1 paso (2 frames para cumplir filtro de ruido)
      const eventsAfterPause: Array<{
        type: string;
        direction?: string;
        index?: number;
      }> = [];
      for (let elapsed = 2100; elapsed <= 2200; elapsed += 50) {
        const out = tracker.update({
          nowMs: pauseStartPerfMs + elapsed,
          hands: [makeRightHand(palmShifted)],
          user,
          itemCount: 6,
          currentIndex: 2,
          busy: false,
          pausedUntilMs: computePausedUntilPerf(elapsed),
        });
        eventsAfterPause.push(
          ...out.events.filter(
            (e): e is { type: 'step'; direction: string; index: number } =>
              e.type === 'step',
          ),
        );
      }

      expect(eventsAfterPause.length).toBe(1);
      expect(eventsAfterPause[0]).toMatchObject({
        type: 'step',
        direction: 'right',
        index: 3,
      });
    });
  });

  describe('2. Integración: BKQJ5 -> selectVariant("negra" y "roja") con pointerdown', () => {
    it('al tocar "negra" en BKQJ5, pausa 2 s (guía en "raise"); tras 2.1 s, un paso a la derecha cambia a la siguiente prenda', async () => {
      const bkqj5Garment = catalogJson.find((g) => g.id === '990F0-BKQJ5')!;
      const bkqj5Idx = catalogJson.findIndex((g) => g.id === '990F0-BKQJ5');
      const nextGarment = catalogJson[bkqj5Idx + 1];

      useGarmentStore.setState({
        activeGarmentId: bkqj5Garment.id,
        activeVariantId: 'roja',
      });

      sessionStorage.setItem('suzuki-hand-input', '1');
      const videoRef = { current: document.createElement('video') };
      const mockPose = { landmarks: null, activeZone: null, frameId: 1 } as never;
      renderHook(() => useHandCursor(videoRef, mockPose, { active: true }));

      render(
        <div>
          <VariantControls />
          <RackPanel mode="interactive" active={true} />
        </div>,
      );

      const [blackBtn] = screen.getAllByLabelText('Color Negra');

      const now = Date.now();
      act(() => {
        fireEvent.pointerDown(blackBtn, { pointerType: 'touch' });
        fireEvent.click(blackBtn);
      });

      expect(useGarmentStore.getState().activeVariantId).toBe('negra');
      expect(useHandCursorStore.getState().pausedUntilMs).toBeGreaterThanOrEqual(
        now + 1900,
      );
      expect(useHandCursorStore.getState().pauseOrigin).toBe('touch');

      // useHandGuide durante la pausa: da 'raise' (no promete move-right)
      useHandCursorStore.setState({
        cursor: {
          ...useHandCursorStore.getState().cursor,
          active: true,
          activeHandSide: 'Right',
          isStepDisarmed: false,
        },
      });
      const { result: guideRef } = renderHook(() =>
        useHandGuide({ isInteractive: true }),
      );
      expect(guideRef.current.state).toBe('raise');

      // Expirar la pausa (2100 ms después)
      act(() => {
        useHandCursorStore.setState({
          pausedUntilMs: Date.now() - 100,
        });
      });

      // Tras la pausa, la guía vuelve a 'move-right'
      const { result: guideAfterPause } = renderHook(() =>
        useHandGuide({ isInteractive: true }),
      );
      expect(guideAfterPause.current.state).toBe('move-right');

      // Paso de mano a la derecha cambia a la siguiente prenda
      act(() => {
        useHandCursorStore.setState({
          lastEvent: { type: 'step', index: bkqj5Idx + 1, direction: 'right' } as never,
        });
      });
      await wait(700);
      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });

    it('al tocar "roja" en BKQJ5, pausa 2 s; tras 2.1 s, un paso a la derecha cambia de prenda', async () => {
      const bkqj5Garment = catalogJson.find((g) => g.id === '990F0-BKQJ5')!;
      const bkqj5Idx = catalogJson.findIndex((g) => g.id === '990F0-BKQJ5');
      const nextGarment = catalogJson[bkqj5Idx + 1];

      useGarmentStore.setState({
        activeGarmentId: bkqj5Garment.id,
        activeVariantId: 'negra',
      });

      sessionStorage.setItem('suzuki-hand-input', '1');
      const videoRef = { current: document.createElement('video') };
      const mockPose = { landmarks: null, activeZone: null, frameId: 1 } as never;
      renderHook(() => useHandCursor(videoRef, mockPose, { active: true }));

      render(
        <div>
          <VariantControls />
          <RackPanel mode="interactive" active={true} />
        </div>,
      );

      const redBtns = screen.getAllByLabelText('Color Roja');
      const redBtn = redBtns[0];

      const now = Date.now();
      act(() => {
        fireEvent.pointerDown(redBtn, { pointerType: 'touch' });
        fireEvent.click(redBtn);
      });

      expect(useGarmentStore.getState().activeVariantId).toBe('roja');
      expect(useHandCursorStore.getState().pausedUntilMs).toBeGreaterThanOrEqual(
        now + 1900,
      );

      // Expirar la pausa
      act(() => {
        useHandCursorStore.setState({
          pausedUntilMs: Date.now() - 100,
        });
      });

      // Paso de mano a la derecha
      act(() => {
        useHandCursorStore.setState({
          lastEvent: { type: 'step', index: bkqj5Idx + 1, direction: 'right' } as never,
        });
      });
      await wait(700);
      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });
  });

  describe('3. Integración con Jimny Fleece Jacket (990F0-JYFJ1): interacción táctil variada', () => {
    const jimnyGarment = catalogJson.find((g) => g.id === '990F0-JYFJ1')!;
    const jimnyIdx = catalogJson.findIndex((g) => g.id === '990F0-JYFJ1');
    const nextGarment = catalogJson[jimnyIdx + 1];

    beforeEach(() => {
      useGarmentStore.setState({
        activeGarmentId: jimnyGarment.id,
        activeVariantId: null,
      });
    });

    it('pointerdown en VERME EN VIVO -> al terminar sesión en vivo y expirar pausa, paso de mano cambia prenda', async () => {
      render(<RackPanel mode="interactive" active={true} />);

      // Simular pointerdown táctil sobre botón VERME EN VIVO
      const now = Date.now();
      act(() => {
        useHandCursorStore.getState().pause(2000, 'touch');
      });
      expect(useHandCursorStore.getState().pausedUntilMs).toBeGreaterThanOrEqual(
        now + 1900,
      );

      // Tracker no dispara pasos mientras dura la pausa
      const tracker = new HandCursorTracker();
      const user = makeUser(0.2);
      const perfNow = 120000;
      const pausedOutput = tracker.update({
        nowMs: perfNow,
        hands: [makeRightHand(0.25)],
        user,
        itemCount: 6,
        currentIndex: jimnyIdx,
        busy: false,
        pausedUntilMs: perfNow + 1500, // remanente proyectado
      });
      expect(pausedOutput.events.length).toBe(0);

      // Expirar la pausa (reloj unificado -> pausedUntilPerf = 0)
      act(() => {
        useHandCursorStore.setState({
          pausedUntilMs: Date.now() - 100,
        });
      });

      // El paso de mano ahora cambia prenda exitosamente
      act(() => {
        useHandCursorStore.setState({
          lastEvent: { type: 'step', index: jimnyIdx + 1, direction: 'right' } as never,
        });
      });
      await wait(700);
      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });

    it('pointerdown en DISPARAR FOTO -> tras 2 s los pasos vuelven a funcionar', async () => {
      render(<RackPanel mode="interactive" active={true} />);

      const now = Date.now();
      act(() => {
        useHandCursorStore.getState().pause(2000, 'touch');
      });
      expect(useHandCursorStore.getState().pausedUntilMs).toBeGreaterThanOrEqual(
        now + 1900,
      );

      act(() => {
        useHandCursorStore.setState({
          pausedUntilMs: Date.now() - 100,
        });
      });

      act(() => {
        useHandCursorStore.setState({
          lastEvent: { type: 'step', index: jimnyIdx + 1, direction: 'right' } as never,
        });
      });
      await wait(700);
      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });

    it('toque en el perchero -> tras 2 s los pasos vuelven a funcionar', async () => {
      render(<RackPanel mode="interactive" active={true} />);
      const rackPanel = screen.getByTestId('rack-panel');

      const now = Date.now();
      act(() => {
        fireEvent.pointerDown(rackPanel, { pointerType: 'touch' });
      });
      expect(useHandCursorStore.getState().pausedUntilMs).toBeGreaterThanOrEqual(
        now + 1900,
      );

      act(() => {
        useHandCursorStore.setState({
          pausedUntilMs: Date.now() - 100,
        });
      });

      act(() => {
        useHandCursorStore.setState({
          lastEvent: { type: 'step', index: jimnyIdx + 1, direction: 'right' } as never,
        });
      });
      await wait(700);
      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });

    it('toque en talla +/- -> tras 2 s los pasos vuelven a funcionar', async () => {
      render(<RackPanel mode="interactive" active={true} />);

      const now = Date.now();
      act(() => {
        useHandCursorStore.getState().pause(2000, 'touch');
      });
      expect(useHandCursorStore.getState().pausedUntilMs).toBeGreaterThanOrEqual(
        now + 1900,
      );

      act(() => {
        useHandCursorStore.setState({
          pausedUntilMs: Date.now() - 100,
        });
      });

      act(() => {
        useHandCursorStore.setState({
          lastEvent: { type: 'step', index: jimnyIdx + 1, direction: 'right' } as never,
        });
      });
      await wait(700);
      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });

    it('toque en REINICIAR del perchero -> tras 2 s los pasos vuelven a funcionar', async () => {
      render(<RackPanel mode="interactive" active={true} />);

      const restartBtn = screen.getByRole('button', { name: /reiniciar/i });
      const now = Date.now();
      act(() => {
        fireEvent.pointerDown(restartBtn, { pointerType: 'touch' });
      });
      expect(useHandCursorStore.getState().pausedUntilMs).toBeGreaterThanOrEqual(
        now + 1900,
      );

      act(() => {
        useHandCursorStore.setState({
          pausedUntilMs: Date.now() - 100,
        });
      });

      act(() => {
        useHandCursorStore.setState({
          lastEvent: { type: 'step', index: jimnyIdx + 1, direction: 'right' } as never,
        });
      });
      await wait(700);
      expect(useGarmentStore.getState().activeGarmentId).toBe(nextGarment.id);
    });
  });

  describe('4. Activar VERME EN VIVO con gesto del índice (sin tocar pantalla)', () => {
    it('el gesto del índice no genera pointerdown y no pausa por toque', () => {
      sessionStorage.setItem('suzuki-hand-input', '1');
      const videoRef = { current: document.createElement('video') };
      const mockPose = { landmarks: null, activeZone: null, frameId: 1 } as never;
      renderHook(() => useHandCursor(videoRef, mockPose, { active: true }));

      // Activar gesto del índice vía evento de handCursor (sin tocar la pantalla)
      act(() => {
        useHandCursorStore.setState({
          cursor: {
            ...useHandCursorStore.getState().cursor,
            active: true,
            gesture: 'Pointing_Up',
            confirmProgress: 1,
          },
          lastEvent: { type: 'confirm' } as never,
        });
      });

      // pausedUntilMs permanece en 0 y pauseOrigin en null (no hay pausa táctil)
      expect(useHandCursorStore.getState().pausedUntilMs).toBe(0);
      expect(useHandCursorStore.getState().pauseOrigin).toBeNull();
    });
  });
});
