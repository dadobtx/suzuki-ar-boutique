// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { KioskGuide } from '@/components/kiosk/KioskGuide';
import { useHandCursorStore } from '@/store/handCursor';
import { useLiveTryonStore } from '@/store/liveTryon';
import { useGarmentStore } from '@/store/garment';
import { useKioskStore } from '@/store/kiosk';
import { useSizingStore } from '@/store/sizing';
import { useSelectionUiStore } from '@/store/selectionUi';
import { useLayoutStore } from '@/store/layout';

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

describe('KioskGuide component - synchronized hand states', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.setItem('suzuki-hand-input', '1');
    useSelectionUiStore.setState({ ui: 'perchero', source: 'manual' });
    useLayoutStore.setState({ mode: 'portrait', source: 'manual' });
    useKioskStore.setState({ state: 'TRYON' });
    useSizingStore.setState({ hasProfile: true });
    useGarmentStore.setState({
      activeGarmentId: 'garment-1',
      catalog: [
        { id: 'garment-1', sku: 'SKU1', name: 'G1', category: 'top' },
        { id: 'garment-2', sku: 'SKU2', name: 'G2', category: 'top' },
        { id: 'garment-3', sku: 'SKU3', name: 'G3', category: 'top' },
      ] as any,
    });
    useLiveTryonStore.setState({
      isLiveActive: false,
      isLiveLoading: false,
      isLiveAvailable: false,
    });
    useHandCursorStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "✋ LEVANTA UNA MANO ABIERTA" on state "raise"', () => {
    useHandCursorStore.setState({
      cursor: { ...useHandCursorStore.getState().cursor, active: false },
    });

    render(<KioskGuide presence="present" layout="portrait" />);
    expect(screen.getByText(/LEVANTA UNA MANO ABIERTA/i)).toBeTruthy();
  });

  it('renders "MUEVE TU MANO DERECHA ▶ PARA LA SIGUIENTE" without live suffix on "move-right" when showLiveButton=false', () => {
    useHandCursorStore.setState({
      rackFocusIndex: 0,
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: false,
        confirmProgress: 0,
      },
    });

    render(<KioskGuide presence="present" layout="portrait" showLiveButton={false} />);
    expect(screen.getByText(/MUEVE TU MANO DERECHA ▶ PARA LA SIGUIENTE/i)).toBeTruthy();
    expect(screen.queryByText(/VERTE EN VIVO/i)).toBeNull();
  });

  it('renders "move-right" WITH live suffix when showLiveButton=true', () => {
    useHandCursorStore.setState({
      rackFocusIndex: 0,
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: false,
        confirmProgress: 0,
      },
    });

    render(<KioskGuide presence="present" layout="portrait" showLiveButton={true} />);
    expect(
      screen.getByText(
        /MUEVE TU MANO DERECHA ▶ PARA LA SIGUIENTE · ☝ ÍNDICE: VERTE EN VIVO/i,
      ),
    ).toBeTruthy();
  });

  it('renders "◀ MUEVE TU MANO IZQUIERDA PARA LA ANTERIOR" on "move-left"', () => {
    useHandCursorStore.setState({
      rackFocusIndex: 2,
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Left',
        isStepDisarmed: false,
        confirmProgress: 0,
      },
    });

    render(<KioskGuide presence="present" layout="portrait" showLiveButton={false} />);
    expect(screen.getByText(/◀ MUEVE TU MANO IZQUIERDA PARA LA ANTERIOR/i)).toBeTruthy();
  });

  it('renders "VUELVE LA MANO AL CENTRO" on "recenter"', () => {
    useHandCursorStore.setState({
      rackFocusIndex: 1,
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: true,
        confirmProgress: 0,
      },
    });

    render(<KioskGuide presence="present" layout="portrait" />);
    expect(screen.getByText(/VUELVE LA MANO AL CENTRO/i)).toBeTruthy();
  });

  it('renders "ES LA ÚLTIMA PRENDA · USA LA OTRA MANO" on "edge" at the last item', () => {
    useHandCursorStore.setState({
      rackFocusIndex: 2, // last of 3
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: false,
        confirmProgress: 0,
      },
    });

    render(<KioskGuide presence="present" layout="portrait" />);
    expect(screen.getByText(/ES LA ÚLTIMA PRENDA · USA LA OTRA MANO/i)).toBeTruthy();
  });

  it('renders "ES LA PRIMERA PRENDA · USA LA OTRA MANO" on "edge" at the first item', () => {
    useHandCursorStore.setState({
      rackFocusIndex: 0, // first of 3
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Left',
        isStepDisarmed: false,
        confirmProgress: 0,
      },
    });

    render(<KioskGuide presence="present" layout="portrait" />);
    expect(screen.getByText(/ES LA PRIMERA PRENDA · USA LA OTRA MANO/i)).toBeTruthy();
  });

  it('renders "MANTÉN EL ÍNDICE ☝ … VERME EN VIVO" on "index"', () => {
    useHandCursorStore.setState({
      rackFocusIndex: 1,
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: false,
        confirmProgress: 0.5,
      },
    });

    render(<KioskGuide presence="present" layout="portrait" />);
    expect(screen.getByText(/MANTÉN EL ÍNDICE ☝ … VERME EN VIVO/i)).toBeTruthy();
  });

  it('renders "PREPARANDO TU PRUEBA EN VIVO…" immediately on "live-loading"', () => {
    useLiveTryonStore.setState({ isLiveLoading: true });

    render(<KioskGuide presence="present" layout="portrait" />);
    expect(screen.getByText(/PREPARANDO TU PRUEBA EN VIVO…/i)).toBeTruthy();
  });

  it('renders no hand gesture banner during "live-active", but distance warnings can still appear', () => {
    useLiveTryonStore.setState({ isLiveActive: true });

    // Without framing issue -> no banner
    const { unmount } = render(
      <KioskGuide presence="present" layout="portrait" framing="ok" />,
    );
    expect(screen.queryByText(/LEVANTA/i)).toBeNull();
    expect(screen.queryByText(/MUEVE/i)).toBeNull();
    unmount();

    // With framing issue -> distance warning shown!
    render(<KioskGuide presence="present" layout="portrait" framing="tooClose" />);
    expect(screen.getByText(/DA UN PASO ATRÁS/i)).toBeTruthy();
  });

  it('debounces rapid state changes by holding state for at least 300ms before changing', () => {
    useHandCursorStore.setState({
      rackFocusIndex: 0,
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: false,
        confirmProgress: 0,
      },
    });

    const { rerender } = render(<KioskGuide presence="present" layout="portrait" />);
    expect(screen.getByText(/MUEVE TU MANO DERECHA ▶/i)).toBeTruthy();

    // 100ms later, state flips to recenter
    act(() => {
      vi.advanceTimersByTime(100);
      useHandCursorStore.setState({
        cursor: {
          ...useHandCursorStore.getState().cursor,
          isStepDisarmed: true,
        },
      });
    });
    rerender(<KioskGuide presence="present" layout="portrait" />);

    // Should still show previous state because 300ms has not elapsed
    expect(screen.getByText(/MUEVE TU MANO DERECHA ▶/i)).toBeTruthy();

    // Advance time past the 300ms threshold + 250ms Framer Motion exit animation
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // Now it updates to recenter!
    expect(screen.getByText(/VUELVE LA MANO AL CENTRO/i)).toBeTruthy();
  });
});
