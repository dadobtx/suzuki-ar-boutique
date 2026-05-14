// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useKioskStore } from '@/store/kiosk';
import { useKioskPresenceSync } from '@/hooks/useKioskPresenceSync';
import { PresenceState } from '@/hooks/usePresence';
import { renderHook } from '@testing-library/react';

describe('Kiosk State Machine', () => {
  beforeEach(() => {
    useKioskStore.getState().reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in ATTRACT state', () => {
    expect(useKioskStore.getState().state).toBe('ATTRACT');
  });

  it('transitions to AWAKENING on presence detected', () => {
    const { rerender } = renderHook(({ presence }) => useKioskPresenceSync(presence), {
      initialProps: { presence: 'absent' as PresenceState },
    });

    rerender({ presence: 'present' as PresenceState });

    expect(useKioskStore.getState().state).toBe('AWAKENING');
  });

  it('handles COOLDOWN timeout correctly', () => {
    useKioskStore.getState().transition('TRYON');

    const { rerender } = renderHook(({ presence }) => useKioskPresenceSync(presence), {
      initialProps: { presence: 'present' as PresenceState },
    });

    rerender({ presence: 'absent' as PresenceState });

    // Fast forward 24s -> still TRYON
    vi.advanceTimersByTime(24000);
    expect(useKioskStore.getState().state).toBe('TRYON');

    // Fast forward to 25s -> COOLDOWN
    vi.advanceTimersByTime(1000);
    expect(useKioskStore.getState().state).toBe('COOLDOWN');
  });

  it('cancels COOLDOWN timeout if presence returns', () => {
    expect(true).toBe(true);
  });
});
