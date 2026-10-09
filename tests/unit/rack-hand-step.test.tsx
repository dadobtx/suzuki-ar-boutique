// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import type { Garment } from '@/types/garment';
import { RackPanel } from '@/components/rack/RackPanel';
import { useGarmentStore } from '@/store/garment';
import { useHandCursorStore } from '@/store/handCursor';

const catalogJson: Garment[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'public/catalog.json'), 'utf-8'),
);

function fireStep(index: number) {
  act(() => {
    useHandCursorStore.setState({
      lastEvent: { type: 'step', index, direction: 'right' },
    } as never);
  });
}

const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

describe('RackPanel - hand_step (tests/unit/rack-hand-step.test.tsx)', () => {
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
      lastEvent: null,
      isBusy: false,
      pausedUntilMs: 0,
    });
  });

  it('un step pone la prenda y consume el evento', async () => {
    render(<RackPanel mode="interactive" active={true} />);
    fireStep(3);
    await wait(700);
    expect(useGarmentStore.getState().activeGarmentId).toBe(catalogJson[3].id);
    expect(useHandCursorStore.getState().lastEvent).toBeNull();
  });

  it('varios pasos durante un vuelo: queda el último', async () => {
    render(<RackPanel mode="interactive" active={true} />);
    fireStep(2);
    fireStep(3);
    fireStep(4);
    await wait(1500);
    expect(useGarmentStore.getState().activeGarmentId).toBe(catalogJson[4].id);
  });

  it('un step sobre la prenda ya puesta no la devuelve', async () => {
    render(<RackPanel mode="interactive" active={true} />);
    fireStep(3);
    await wait(700);
    fireStep(3);
    await wait(700);
    expect(useGarmentStore.getState().activeGarmentId).toBe(catalogJson[3].id);
  });

  it('con active=false el step no cambia la prenda', async () => {
    render(<RackPanel mode="interactive" active={false} />);
    fireStep(3);
    await wait(700);
    expect(useGarmentStore.getState().activeGarmentId).toBeNull();
  });

  it('con una sesión en vivo activa (isLiveActive=true), gestos de paso → 0 cambios de prenda', async () => {
    render(<RackPanel mode="interactive" active={true} isLiveActive={true} />);
    fireStep(3);
    await wait(700);
    expect(useGarmentStore.getState().activeGarmentId).toBeNull();
  });

  it('activar el cursor sin step no selecciona nada', async () => {
    render(<RackPanel mode="interactive" active={true} />);
    act(() => {
      useHandCursorStore.setState({
        cursor: {
          active: true,
          x: 0.5,
          y: 0.5,
          index: 3,
          dwellProgress: 0,
          gesture: 'Open_Palm',
        },
      } as never);
    });
    await wait(700);
    expect(useGarmentStore.getState().activeGarmentId).toBeNull();
  });

  it('con el cursor inactivo, el foco del perchero no cambia aunque el tracker se reinicie', async () => {
    const { getAllByRole } = render(<RackPanel mode="interactive" active={true} />);
    const slots = getAllByRole('option');

    // Cambiar a foco en 4 con cursor activo
    act(() => {
      useHandCursorStore.setState({
        cursor: {
          active: true,
          x: 0.5,
          y: 0.5,
          index: 4,
          dwellProgress: 0,
          gesture: 'Open_Palm',
        },
      } as never);
    });
    expect(slots[4].getAttribute('aria-selected')).toBe('true');

    // Ahora el cursor pasa a inactivo / reset
    act(() => {
      useHandCursorStore.getState().reset();
    });

    // El foco del perchero NO debe haber vuelto a 0, se mantiene en 4
    expect(slots[4].getAttribute('aria-selected')).toBe('true');
    expect(slots[0].getAttribute('aria-selected')).toBe('false');
  });
});
