// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import type { Garment } from '@/types/garment';
import { RackPanel } from '@/components/rack/RackPanel';
import { DiagnosticOverlay } from '@/components/debug/DiagnosticOverlay';
import { useGarmentStore } from '@/store/garment';
import { useHandCursorStore } from '@/store/handCursor';
import { useLayoutStore } from '@/store/layout';
import { useSelectionUiStore } from '@/store/selectionUi';
import { useHandCursor } from '@/hooks/useHandCursor';
import type { UsePoseResult } from '@/hooks/usePose';

const catalogJson: Garment[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'public/catalog.json'), 'utf-8'),
);

describe('Pausa táctil vs Mouse Hover (tests/unit/rack-pointer-pause.test.tsx)', () => {
  const originalLocation = window.location;

  function setMockLocation(search: string, hash: string = '') {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...originalLocation,
        search,
        hash,
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    setMockLocation('');
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

    useHandCursorStore.setState({
      cursor: {
        active: true,
        x: 0.5,
        y: 0.5,
        index: 0,
        dwellProgress: 0,
        gesture: 'None',
        anchorX: null,
        displacement: 0,
        leverState: 'neutral',
        directionArrow: null,
        confirmProgress: 0,
        ownerReason: 'wrist',
        activeHandSide: 'Right',
        handSwitchCount: 0,
        poseSide: 'Right',
        classifierSide: 'Right',
        indexSource: 'pose',
        isStepDisarmed: false,
        pulseArrow: null,
        anchorOffsetSw: null,
        swWidth: null,
        stepBlockedReason: 'ninguno',
      },
      lastEvent: null,
      isBusy: false,
      pausedUntilMs: 0,
      pauseOrigin: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  it('pointermove con pointerType mouse y buttons 0 sobre el perchero, repetido cada 200 ms durante 5 s, con cursor activo → pausedUntilMs no cambia y los pasos funcionan', () => {
    render(<RackPanel mode="interactive" active={true} />);

    const rackPanel = screen.getByTestId('rack-panel');
    expect(useHandCursorStore.getState().pausedUntilMs).toBe(0);

    // Simular movimientos de mouse (hover: buttons = 0) cada 200 ms por 5000 ms (25 repeticiones)
    for (let t = 0; t < 25; t++) {
      act(() => {
        fireEvent.pointerMove(rackPanel, {
          pointerType: 'mouse',
          buttons: 0,
          clientX: 100 + (t % 5) * 40,
          clientY: 200,
        });
      });
    }

    // pausedUntilMs debe permanecer intacto en 0
    expect(useHandCursorStore.getState().pausedUntilMs).toBe(0);

    // Comprobar que los pasos por mano funcionan sin ser bloqueados
    act(() => {
      useHandCursorStore.setState({
        lastEvent: {
          type: 'step',
          index: 1,
          timestamp: Date.now(),
        },
      });
    });

    // La prenda con índice 1 debe haberse seleccionado
    expect(useGarmentStore.getState().activeGarmentId).toBe(catalogJson[1]?.id);
    expect(useHandCursorStore.getState().lastEvent).toBeNull();
  });

  it('pointermove touch → pausa 2 s con origen touch', () => {
    render(<RackPanel mode="interactive" active={true} />);

    const rackPanel = screen.getByTestId('rack-panel');
    const now = Date.now();

    act(() => {
      fireEvent.pointerMove(rackPanel, {
        pointerType: 'touch',
        buttons: 1,
        clientX: 250,
        clientY: 100,
      });
    });

    const state = useHandCursorStore.getState();
    expect(state.pausedUntilMs).toBeGreaterThanOrEqual(now + 1900);
    expect(state.pausedUntilMs).toBeLessThanOrEqual(now + 2500);
    expect(state.pauseOrigin).toBe('touch');
  });

  it('pointermove mouse con botón presionado → pausa 2 s con origen mouse con botón', () => {
    render(<RackPanel mode="interactive" active={true} />);

    const rackPanel = screen.getByTestId('rack-panel');
    const now = Date.now();

    act(() => {
      fireEvent.pointerMove(rackPanel, {
        pointerType: 'mouse',
        buttons: 1,
        clientX: 250,
        clientY: 100,
      });
    });

    const state = useHandCursorStore.getState();
    expect(state.pausedUntilMs).toBeGreaterThanOrEqual(now + 1900);
    expect(state.pausedUntilMs).toBeLessThanOrEqual(now + 2500);
    expect(state.pauseOrigin).toBe('mouse con botón');
  });

  it('pointerdown dentro del overlay de debug → sin pausa; pointerdown en el perchero → pausa 2 s', () => {
    sessionStorage.setItem('suzuki-hand-input', '1');

    const videoRef = { current: document.createElement('video') };
    const mockPose = {
      landmarks: null,
      activeZone: null,
      frameId: 1,
    } as unknown as UsePoseResult;
    renderHook(() => useHandCursor(videoRef, mockPose, { active: true }));

    // Renderizar perchero y overlay con debug activado
    setMockLocation('?debug=1');
    const { container } = render(
      <div>
        <DiagnosticOverlay />
        <RackPanel mode="interactive" active={true} />
      </div>,
    );

    const debugContainer = container.querySelector('[data-debug-overlay]');
    expect(debugContainer).not.toBeNull();
    const rackPanel = screen.getByTestId('rack-panel');

    // Clic dentro del overlay de debug
    act(() => {
      fireEvent.pointerDown(debugContainer!, { pointerType: 'mouse' });
    });

    // No debe pausar
    expect(useHandCursorStore.getState().pausedUntilMs).toBe(0);

    // Clic en el perchero
    const now = Date.now();
    act(() => {
      fireEvent.pointerDown(rackPanel, { pointerType: 'mouse' });
    });

    // Debe pausar 2 s con origen clic
    const state = useHandCursorStore.getState();
    expect(state.pausedUntilMs).toBeGreaterThanOrEqual(now + 1900);
    expect(state.pausedUntilMs).toBeLessThanOrEqual(now + 2500);
    expect(state.pauseOrigin).toBe('clic');
  });

  it('DiagnosticOverlay muestra Paso bloqueado por: pausado (táctil: origen, X s)', () => {
    sessionStorage.setItem('suzuki-hand-input', '1');
    setMockLocation('?debug=1');

    const now = Date.now();
    useHandCursorStore.setState({
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        stepBlockedReason: 'pausado (táctil)',
      },
      pausedUntilMs: now + 1400,
      pauseOrigin: 'touch',
    });

    render(<DiagnosticOverlay />);

    expect(screen.getByText(/pausado \(táctil: touch, 1\.4 s\)/)).toBeTruthy();
  });
});
