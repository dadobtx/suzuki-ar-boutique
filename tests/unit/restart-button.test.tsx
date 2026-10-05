// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RestartButton } from '@/components/catalog/RestartButton';
import { useSizingStore } from '@/store/sizing';
import { useGarmentStore } from '@/store/garment';
import { useKioskStore, restartSession } from '@/store/kiosk';
import { useAnalyticsStore } from '@/store/analytics';

describe('RestartButton component and restartSession action', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSizingStore.setState({
      hasProfile: true,
      tallaHabitual: 'M',
      preferenciaFit: 'regular',
      tallasElegidas: { 'SWF-01': 'M' },
    });
    useGarmentStore.setState({
      activeGarmentId: 'garment-1',
      wishlist: ['SWF-01'],
      filters: {
        line: 'Todas',
        category: null,
        sizes: [],
        colors: [],
      },
    });
    useKioskStore.setState({
      state: 'TRYON',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders in idle state with REINICIAR text', () => {
    render(<RestartButton />);
    const btn = screen.getByRole('button');
    expect(btn.textContent).toContain('REINICIAR');
    expect(btn.className).toContain('border-line');
  });

  it('transitions to confirming state on first click, reverts after 3s', () => {
    render(<RestartButton />);
    const btn = screen.getByRole('button');

    fireEvent.click(btn);
    expect(btn.textContent).toContain('TOCA OTRA VEZ PARA REINICIAR');
    expect(btn.className).toContain('border-brand-red');

    // Fast-forward 3000ms
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(btn.textContent).toContain('REINICIAR');
  });

  it('resets session on second click when confirming', () => {
    render(<RestartButton />);
    const btn = screen.getByRole('button');

    fireEvent.click(btn);
    expect(btn.textContent).toContain('TOCA OTRA VEZ PARA REINICIAR');

    fireEvent.click(btn);
    expect(useSizingStore.getState().hasProfile).toBe(false);
    expect(useGarmentStore.getState().activeGarmentId).toBe(null);
    expect(useGarmentStore.getState().wishlist).toEqual([]);
    expect(useKioskStore.getState().state).toBe('ATTRACT');
  });

  it('con perfil M, prenda activa, 1 favorito, filtro de línea y sessionId -> restartSession() deja hasProfile=false, activeGarmentId=null, wishlist=[], filtros vacíos, kiosk state ATTRACT, y analytics registra session_end', () => {
    useAnalyticsStore.getState().startSession();
    const sid = useAnalyticsStore.getState().currentSessionId;
    expect(sid).toBeTruthy();

    useSizingStore.setState({
      hasProfile: true,
      tallaHabitual: 'M',
      preferenciaFit: 'regular',
      sessionId: sid,
    });
    useGarmentStore.setState({
      activeGarmentId: 'test-garment-1',
      wishlist: ['SWF-HD-01'],
      filters: {
        line: 'Team Black',
        category: 'top',
        sizes: ['M'],
        colors: ['black'],
      },
    });
    useKioskStore.setState({
      state: 'TRYON',
    });

    restartSession();

    expect(useSizingStore.getState().hasProfile).toBe(false);
    expect(useGarmentStore.getState().activeGarmentId).toBe(null);
    expect(useGarmentStore.getState().wishlist).toEqual([]);
    expect(useGarmentStore.getState().filters).toEqual({
      line: 'Todas',
      category: null,
      sizes: [],
      colors: [],
    });
    expect(useKioskStore.getState().state).toBe('ATTRACT');

    const endEvents = useAnalyticsStore.getState().query({ type: 'session_ended' });
    expect(endEvents.length).toBeGreaterThan(0);
    const lastEnd = endEvents[endEvents.length - 1];
    expect(lastEnd.sessionId).toBe(sid);
  });
});
