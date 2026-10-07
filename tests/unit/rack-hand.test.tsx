// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import type { Garment } from '@/types/garment';
import { RackPanel } from '@/components/rack/RackPanel';
import { useGarmentStore } from '@/store/garment';
import { useHandCursorStore } from '@/store/handCursor';

const catalogJson: Garment[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'public/catalog.json'), 'utf-8'),
);

describe('RackPanel - Hand Interaction Integration (tests/unit/rack-hand.test.tsx)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
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

    useHandCursorStore.setState({
      cursor: {
        active: false,
        x: 0.5,
        y: 0.5,
        index: 0,
        dwellProgress: 0,
        gesture: 'None',
      },
      lastEvent: null,
      isBusy: false,
      pausedUntilMs: 0,
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('con el store simulado, cambio de índice → foco del perchero', () => {
    render(<RackPanel mode="interactive" active={true} />);

    const slots = screen.getAllByRole('option');
    expect(slots).toHaveLength(10);

    // Cambiar índice de mano a 2 con cursor activo
    act(() => {
      useHandCursorStore.setState({
        cursor: {
          active: true,
          x: 0.5,
          y: 0.5,
          index: 2,
          dwellProgress: 0,
          gesture: 'Open_Palm',
        },
      });
    });

    expect(slots[2].getAttribute('aria-selected')).toBe('true');

    // Cambiar índice de mano a 4
    act(() => {
      useHandCursorStore.setState({
        cursor: {
          active: true,
          x: 0.7,
          y: 0.5,
          index: 4,
          dwellProgress: 0.5,
          gesture: 'Open_Palm',
        },
      });
    });

    expect(slots[4].getAttribute('aria-selected')).toBe('true');
  });

  it('evento take → selectGarment', async () => {
    const selectGarmentSpy = vi.fn();
    useGarmentStore.setState({ selectGarment: selectGarmentSpy });

    render(<RackPanel mode="interactive" active={true} />);

    // Disparar evento take en slot 3
    await act(async () => {
      useHandCursorStore.setState({
        lastEvent: {
          type: 'take',
          index: 3,
          method: 'hand_dwell',
        },
      });
    });

    expect(selectGarmentSpy).toHaveBeenCalledWith(catalogJson[3].id);
    // lastEvent debe limpiarse
    expect(useHandCursorStore.getState().lastEvent).toBeNull();
  });

  it('con active=false nada (no cambia foco ni selecciona prenda)', async () => {
    const selectGarmentSpy = vi.fn();
    useGarmentStore.setState({ selectGarment: selectGarmentSpy });

    render(<RackPanel mode="interactive" active={false} />);

    const slots = screen.getAllByRole('option');

    // Cambiar índice de mano con active=false en el rack
    act(() => {
      useHandCursorStore.setState({
        cursor: {
          active: true,
          x: 0.5,
          y: 0.5,
          index: 2,
          dwellProgress: 0,
          gesture: 'Open_Palm',
        },
      });
    });

    expect(slots[2].getAttribute('aria-selected')).not.toBe('true');

    // Emitir evento take con active=false
    await act(async () => {
      useHandCursorStore.setState({
        lastEvent: {
          type: 'take',
          index: 2,
          method: 'hand_dwell',
        },
      });
    });

    expect(selectGarmentSpy).not.toHaveBeenCalled();
  });

  it('pointer pausa 2 s el cursor de mano', () => {
    render(<RackPanel mode="interactive" active={true} />);

    const rackPanel = screen.getByTestId('rack-panel');
    const now = Date.now();

    act(() => {
      fireEvent.pointerMove(rackPanel, { clientX: 200, clientY: 100 });
    });

    const pausedUntilMs = useHandCursorStore.getState().pausedUntilMs;
    expect(pausedUntilMs).toBeGreaterThanOrEqual(now + 1900);
    expect(pausedUntilMs).toBeLessThanOrEqual(now + 2500);
  });
});
