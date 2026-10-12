// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import type { Garment } from '@/types/garment';
import { RackPanel } from '@/components/rack/RackPanel';
import { useGarmentStore } from '@/store/garment';
import { useKioskStore } from '@/store/kiosk';
import { useSizingStore } from '@/store/sizing';

const catalogJson: Garment[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'public/catalog.json'), 'utf-8'),
);

describe('RackPanel - Botón REINICIAR', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();

    useGarmentStore.setState({
      catalog: catalogJson,
      activeGarmentId: null,
      activeVariantId: null,
      wishlist: [],
    });

    useKioskStore.setState({
      state: 'TRYON',
      stateStartTime: Date.now(),
    });

    useSizingStore.setState({
      hasProfile: true,
      heightCm: 175,
      weightKg: 70,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('es visible en modo interactive y NO se muestra en modo attract', () => {
    const { unmount } = render(<RackPanel mode="interactive" active={true} />);
    expect(screen.getByRole('button', { name: /REINICIAR/i })).toBeTruthy();
    unmount();

    render(<RackPanel mode="attract" active={true} />);
    expect(screen.queryByRole('button', { name: /REINICIAR/i })).toBeNull();
  });

  it('requiere doble toque de confirmación para reiniciar la sesión', () => {
    render(<RackPanel mode="interactive" active={true} />);
    const btn = screen.getByRole('button', { name: /REINICIAR/i });

    // Primer toque: pide confirmación
    act(() => {
      fireEvent.click(btn);
    });
    expect(screen.getByText(/TOCA OTRA VEZ PARA REINICIAR/i)).toBeTruthy();

    // Segundo toque: reinicia la sesión
    act(() => {
      fireEvent.click(btn);
    });
    // Al reiniciar, hasProfile pasa a false y el estado a ATTRACT
    expect(useKioskStore.getState().state).toBe('ATTRACT');
    expect(useSizingStore.getState().hasProfile).toBe(false);
  });
});
