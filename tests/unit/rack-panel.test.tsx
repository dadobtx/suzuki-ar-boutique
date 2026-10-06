// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import type { Garment } from '@/types/garment';
import { buildRack } from '@/components/rack/buildRack';
import { RackPanel } from '@/components/rack/RackPanel';
import { StagePanel } from '@/components/camera/StagePanel';
import { useGarmentStore } from '@/store/garment';
import { useSizingStore } from '@/store/sizing';
import { useSelectionUiStore, SELECTION_UI_STORAGE_KEY } from '@/store/selectionUi';
import { useLayoutStore } from '@/store/layout';
import type { PresenceState } from '@/hooks/usePresence';

const catalogJson: Garment[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'public/catalog.json'), 'utf-8'),
);

describe('Rack Panel and Showcase', () => {
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
    useSizingStore.setState({
      hasProfile: true,
      tallasElegidas: {},
    });
    useSelectionUiStore.setState({
      ui: 'clasico',
      source: 'manual',
    });
    useLayoutStore.setState({
      mode: 'portrait',
      source: 'manual',
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('buildRack con el catalog.json real: 10 items, 990F0-BKQJ5 resuelve 2 ilustraciones por variante, todas con BASE_URL', () => {
    const items = buildRack(catalogJson);
    expect(items).toHaveLength(10);

    const bkqj5 = items.find((it) => it.sku === '990F0-BKQJ5');
    expect(bkqj5).toBeDefined();
    expect(bkqj5?.variants).toHaveLength(2);
    expect(bkqj5?.illustrations).toHaveLength(2);

    const baseUrl = import.meta.env.BASE_URL ?? '/';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    items.forEach((item) => {
      if (item.illustrationUrl) {
        expect(item.illustrationUrl.startsWith(cleanBase)).toBe(true);
      }
      if (item.fallbackPhotoUrl) {
        expect(item.fallbackPhotoUrl.startsWith(cleanBase)).toBe(true);
      }
      if (item.photoThumbUrl) {
        expect(item.photoThumbUrl.startsWith(cleanBase)).toBe(true);
      }
    });
  });

  it('StagePanel: sin flag renderiza CatalogPanel / AttractPanel clásica', () => {
    useSelectionUiStore.setState({ ui: 'clasico', source: 'manual' });

    const { rerender } = render(
      <StagePanel
        kioskState="ATTRACT"
        hasProfile={true}
        presence={'absent' as PresenceState}
      />,
    );
    expect(screen.getByTestId('panel-attract')).toBeTruthy();
    expect(screen.queryByTestId('rack-panel')).toBeNull();

    rerender(
      <StagePanel
        kioskState="TRYON"
        hasProfile={true}
        presence={'present' as PresenceState}
      />,
    );
    expect(screen.getByTestId('panel-catalog')).toBeTruthy();
    expect(screen.queryByTestId('rack-panel')).toBeNull();
  });

  it('StagePanel: con "perchero" + portrait renderiza RackPanel; con "perchero" + landscape renderiza clásica', () => {
    sessionStorage.setItem(SELECTION_UI_STORAGE_KEY, 'perchero');
    useSelectionUiStore.setState({ ui: 'perchero', source: 'manual' });
    useLayoutStore.setState({ mode: 'portrait', source: 'manual' });

    const { rerender } = render(
      <StagePanel
        kioskState="ATTRACT"
        hasProfile={true}
        presence={'absent' as PresenceState}
      />,
    );
    const attractPanel = screen.getByTestId('panel-attract');
    const rackAttract = attractPanel.querySelector('[data-testid="rack-panel"]');
    expect(rackAttract).toBeTruthy();
    expect(rackAttract?.getAttribute('data-mode')).toBe('attract');

    rerender(
      <StagePanel
        kioskState="TRYON"
        hasProfile={true}
        presence={'present' as PresenceState}
      />,
    );
    const catalogPanel = screen.getByTestId('panel-catalog');
    const rackInteractive = catalogPanel.querySelector('[data-testid="rack-panel"]');
    expect(rackInteractive).toBeTruthy();
    expect(rackInteractive?.getAttribute('data-mode')).toBe('interactive');

    // Cambiar layout a landscape -> debe caer a la clásica
    act(() => {
      useLayoutStore.setState({ mode: 'landscape', source: 'manual' });
    });
    rerender(
      <StagePanel
        kioskState="TRYON"
        hasProfile={true}
        presence={'present' as PresenceState}
      />,
    );
    expect(screen.queryByTestId('rack-panel')).toBeNull();
  });

  it('attract: avanza con fake timers cada 2600 ms y no llama selectGarment ni toggleWishlist', () => {
    vi.useFakeTimers();
    const selectGarmentSpy = vi.spyOn(useGarmentStore.getState(), 'selectGarment');
    const toggleWishlistSpy = vi.spyOn(useGarmentStore.getState(), 'toggleWishlist');

    render(<RackPanel mode="attract" />);

    const slots = screen.getAllByRole('option');
    expect(slots[0].getAttribute('aria-selected')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(2600);
    });

    expect(slots[1].getAttribute('aria-selected')).toBe('true');

    expect(selectGarmentSpy).not.toHaveBeenCalled();
    expect(toggleWishlistSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('interactive: clic en un slot selecciona prenda, clic en seleccionado deselecciona, favorito toggleWishlist', async () => {
    const selectGarmentSpy = vi.fn();
    const toggleWishlistSpy = vi.fn();
    useGarmentStore.setState({
      selectGarment: selectGarmentSpy,
      toggleWishlist: toggleWishlistSpy,
    });

    const { rerender } = render(<RackPanel mode="interactive" />);

    const slots = screen.getAllByRole('option');
    const firstGarment = catalogJson[0];

    // Clic en primer slot -> selecciona
    await act(async () => {
      fireEvent.click(slots[0]);
    });
    expect(selectGarmentSpy).toHaveBeenCalledWith(firstGarment.id);

    // Simular que el store actualizó la prenda activa
    act(() => {
      useGarmentStore.setState({ activeGarmentId: firstGarment.id });
    });
    rerender(<RackPanel mode="interactive" />);

    // Clic en el slot seleccionado -> deselecciona (selectGarment(null))
    await act(async () => {
      fireEvent.click(slots[0]);
    });
    expect(selectGarmentSpy).toHaveBeenCalledWith(null);

    // Clic en botón favorito
    const heartBtn = screen.getByRole('button', {
      name: /catalog\.addWishlist|favorito/i,
    });
    fireEvent.click(heartBtn);
    expect(toggleWishlistSpy).toHaveBeenCalledWith(firstGarment.sku);
  });

  it('interactive: navegación con teclado (ArrowRight, ArrowLeft, Enter, Escape)', async () => {
    const selectGarmentSpy = vi.fn();
    useGarmentStore.setState({ selectGarment: selectGarmentSpy });

    render(<RackPanel mode="interactive" />);

    const slots = screen.getAllByRole('option');

    // ArrowRight -> abre slot 0
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(slots[0].getAttribute('aria-selected')).toBe('true');

    // ArrowRight -> abre slot 1
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(slots[1].getAttribute('aria-selected')).toBe('true');

    // Enter -> selecciona prenda 1
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    expect(selectGarmentSpy).toHaveBeenCalledWith(catalogJson[1].id);

    // Simular seleccionada en store
    act(() => {
      useGarmentStore.setState({ activeGarmentId: catalogJson[1].id });
    });

    // Escape -> deselecciona prenda
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(selectGarmentSpy).toHaveBeenCalledWith(null);
  });

  it('prenda sin ilustración se renderiza con foto (fallback) y no desaparece', () => {
    const garmentSinIlustracion: Garment = {
      id: 'no-illust-1',
      sku: 'NO-ILLUST-01',
      name: 'Prenda Especial Sin Ilustración',
      line: 'Suzuki Collection',
      category: 'top',
      price: 49,
      priceCents: 4900,
      imageUrl: '/garments/test.png',
      thumbnailUrl: '/garments/test.thumb.png',
      sizes: ['M', 'L'],
      colors: ['#000'],
      description: '',
      cutType: 'regular',
      tags: [],
      gender: 'unisex',
    };

    const rack = buildRack([garmentSinIlustracion]);
    expect(rack).toHaveLength(1);
    expect(rack[0].hasIllustration).toBe(false);
    expect(rack[0].illustrationUrl).toBeNull();
    expect(rack[0].fallbackPhotoUrl).toContain('test.thumb.png');

    useGarmentStore.setState({
      catalog: [garmentSinIlustracion],
      activeGarmentId: null,
    });

    render(<RackPanel mode="interactive" />);
    const slot = screen.getByRole('option');
    expect(slot).toBeTruthy();
    expect(screen.getByAltText('Prenda Especial Sin Ilustración')).toBeTruthy();
  });
});
