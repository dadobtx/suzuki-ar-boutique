// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RestartButton } from '@/components/catalog/RestartButton';
import { useSizingStore } from '@/store/sizing';
import { useGarmentStore } from '@/store/garment';
import { useKioskStore } from '@/store/kiosk';

describe('RestartButton component', () => {
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

  it('resets profile and garment on second click when confirming', () => {
    render(<RestartButton />);
    const btn = screen.getByRole('button');

    fireEvent.click(btn);
    expect(btn.textContent).toContain('TOCA OTRA VEZ PARA REINICIAR');

    fireEvent.click(btn);
    expect(useSizingStore.getState().hasProfile).toBe(false);
    expect(useGarmentStore.getState().activeGarmentId).toBe(null);
  });
});
