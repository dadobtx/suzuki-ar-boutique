// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CatalogCard } from '@/components/catalog/CatalogCard';
import { useGarmentStore } from '@/store/garment';
import { useSizingStore } from '@/store/sizing';
import { useAnalyticsStore } from '@/store/analytics';
import type { Garment } from '@/types/garment';

const garmentWithBack: Garment = {
  id: '990F0-BKTM1',
  line: 'Team Black',
  name: 'Team Black T-Shirt',
  category: 'top',
  sku: '990F0-BKTM1',
  sizes: ['S', 'M', 'L'],
  colors: ['#0A0E12'],
  priceCents: 3529,
  overlayUrl: '/garments/990F0-BKTM1.png',
  anchorsUrl: '/garments/990F0-BKTM1.anchors.json',
  thumbnailUrl: '/garments/990F0-BKTM1.thumb.png',
  backImageUrl: '/garments/990F0-BKTM1.back.png',
  backThumbnailUrl: '/garments/990F0-BKTM1.back.thumb.png',
  flip: true,
};

const garmentWithoutBack: Garment = {
  id: '990F0-BKBW5',
  line: 'Team Black',
  name: 'Team Black Vest',
  category: 'top',
  sku: '990F0-BKBW5',
  sizes: ['S', 'M', 'L'],
  colors: ['#191C20'],
  priceCents: 8648,
  overlayUrl: '/garments/990F0-BKBW5.png',
  anchorsUrl: '/garments/990F0-BKBW5.anchors.json',
  thumbnailUrl: '/garments/990F0-BKBW5.thumb.png',
};

describe('CatalogCard vista posterior automática al seleccionar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    useGarmentStore.setState({
      activeGarmentId: null,
      activeVariantId: null,
      wishlist: [],
    });
    useSizingStore.setState({
      sessionId: 'session-test-card',
    });
    useAnalyticsStore.setState({
      events: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('seleccionar tarjeta con back view -> a los 600 ms view="back", a los 2600 ms view="front"', () => {
    // Marcamos tease para aislar la prueba de preview automático de 600ms/2000ms
    sessionStorage.setItem('suzuki_ar_back_view_teased_session', 'session-test-card');

    const { container } = render(<CatalogCard garment={garmentWithBack} />);
    const card = container.querySelector('[role="article"]') as HTMLElement;
    expect(card.getAttribute('data-view')).toBe('front');

    // Seleccionar la tarjeta (pasa de false a true)
    act(() => {
      useGarmentStore.getState().selectGarment(garmentWithBack.id);
    });

    // Antes de 600 ms sigue en front
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(card.getAttribute('data-view')).toBe('front');

    // A los 600 ms pasa a back
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(card.getAttribute('data-view')).toBe('back');

    // Durante los 2000 ms siguientes permanece en back (ej. a los 2000 ms totales)
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(card.getAttribute('data-view')).toBe('back');

    // A los 2600 ms totales (2000 ms después de girar) vuelve a front
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(card.getAttribute('data-view')).toBe('front');

    // El giro automático NO registra garment_back_viewed
    const events = useAnalyticsStore.getState().events;
    const backEvents = events.filter((e) => e.type === 'garment_back_viewed');
    expect(backEvents).toHaveLength(0);
  });

  it('con toque manual a los 1000 ms los timers se cancelan', () => {
    sessionStorage.setItem('suzuki_ar_back_view_teased_session', 'session-test-card');

    const { container } = render(<CatalogCard garment={garmentWithBack} />);
    const card = container.querySelector('[role="article"]') as HTMLElement;

    // Seleccionamos la tarjeta
    act(() => {
      useGarmentStore.getState().selectGarment(garmentWithBack.id);
    });

    // A los 600 ms cambia a back
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(card.getAttribute('data-view')).toBe('back');

    // Avanzamos a los 1000 ms totales (400 ms después de ponerse en back)
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(card.getAttribute('data-view')).toBe('back');

    // A los 1000 ms, el usuario toca manualmente el botón de volteo
    const flipButton = screen.getByRole('button', { name: /viewFrontAria/i });
    fireEvent.click(flipButton);

    // Vuelve inmediatamente a front por toque manual
    expect(card.getAttribute('data-view')).toBe('front');

    // Avanzamos 3000 ms más (pasando de largo los 2600 ms)
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Como los timers se cancelaron con el toque manual, se queda en front y no vuelve a cambiar
    expect(card.getAttribute('data-view')).toBe('front');
  });

  it('tarjeta sin back view -> no cambia y se mantiene siempre en front', () => {
    const { container } = render(<CatalogCard garment={garmentWithoutBack} />);
    const card = container.querySelector('[role="article"]') as HTMLElement;
    expect(card.getAttribute('data-view')).toBe('front');

    act(() => {
      useGarmentStore.getState().selectGarment(garmentWithoutBack.id);
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(card.getAttribute('data-view')).toBe('front');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(card.getAttribute('data-view')).toBe('front');

    // No debe existir botón de volteo
    const buttons = screen.getAllByRole('button');
    const hasFlipBtn = buttons.some(
      (b) =>
        b.getAttribute('aria-label')?.includes('trasera') ||
        b.textContent?.includes('ATRÁS'),
    );
    expect(hasFlipBtn).toBe(false);
  });

  it('el contenedor del nombre reserva alto mínimo de 2 líneas con min-h-[2.75em] para nombres cortos y largos', () => {
    // 1. Prenda con nombre corto ("Team Black T-Shirt" -> displayName "T-Shirt")
    const { container: c1 } = render(<CatalogCard garment={garmentWithBack} />);
    const nameEl1 = c1.querySelector('.font-display');
    expect(nameEl1).toBeTruthy();
    expect(nameEl1?.className).toContain('min-h-[2.75em]');

    // 2. Prenda con nombre largo que ocupa 2 líneas ("Functional Hooded Sweat Jacket")
    const garmentLongName: Garment = {
      ...garmentWithoutBack,
      name: 'Team Black Functional Hooded Sweat Jacket',
    };
    const { container: c2 } = render(<CatalogCard garment={garmentLongName} />);
    const nameEl2 = c2.querySelector('.font-display');
    expect(nameEl2).toBeTruthy();
    expect(nameEl2?.className).toContain('min-h-[2.75em]');
  });
});
