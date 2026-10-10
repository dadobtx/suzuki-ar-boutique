// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CatalogCard } from '@/components/catalog/CatalogCard';
import { useGarmentStore } from '@/store/garment';
import { useSizingStore } from '@/store/sizing';
import { useAnalyticsStore } from '@/store/analytics';
import type { Garment } from '@/types/garment';

// jsdom's cssstyle does not support container query units like 'cqi'
if (typeof document !== 'undefined') {
  const styleProto = Object.getPrototypeOf(document.createElement('div').style);
  const origDesc = Object.getOwnPropertyDescriptor(styleProto, 'fontSize');
  if (origDesc) {
    const customValues = new WeakMap<object, string>();
    Object.defineProperty(styleProto, 'fontSize', {
      get() {
        return customValues.get(this) || origDesc.get?.call(this) || '';
      },
      set(val: string) {
        customValues.set(this, val);
        origDesc.set?.call(this, val);
      },
      configurable: true,
    });
  }
}

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

  it('ambos caminos usan flex-1 min-h-0 en el contenedor de imagen y el img sin vista posterior esta en absolute inset-0', () => {
    // 1. Camino con vista posterior
    const { container: withBack } = render(<CatalogCard garment={garmentWithBack} />);
    const imgAreaWithBack = withBack.querySelector('.bg-white');
    expect(imgAreaWithBack).toBeTruthy();
    expect(imgAreaWithBack?.className).toContain('flex-1');
    expect(imgAreaWithBack?.className).toContain('min-h-0');

    // 2. Camino sin vista posterior
    const { container: withoutBack } = render(
      <CatalogCard garment={garmentWithoutBack} />,
    );
    const imgAreaWithoutBack = withoutBack.querySelector('.bg-white');
    expect(imgAreaWithoutBack).toBeTruthy();
    expect(imgAreaWithoutBack?.className).toContain('flex-1');
    expect(imgAreaWithoutBack?.className).toContain('min-h-0');

    // El img sin vista posterior debe estar dentro de un contenedor absolute inset-0
    const imgEl = withoutBack.querySelector('img');
    expect(imgEl).toBeTruthy();
    const parentContainer = imgEl?.parentElement;
    expect(parentContainer).toBeTruthy();
    expect(parentContainer?.className).toContain('absolute');
    expect(parentContainer?.className).toContain('inset-0');
  });

  it('boton ATRAS/FRENTE tiene container-type:inline-size y el texto b usa clamp(11px, 17cqi, 16px)', () => {
    const { container } = render(<CatalogCard garment={garmentWithBack} />);
    const flipButton = container.querySelector(
      'button[aria-label*="trasera"], button[aria-label*="viewBackAria"], button:has(b)',
    );
    expect(flipButton).toBeTruthy();
    expect(flipButton?.className).toContain('[container-type:inline-size]');

    const bText = flipButton?.querySelector('b');
    expect(bText).toBeTruthy();
    expect(bText?.className).toContain('tracking-normal');
    expect(bText?.className).toContain('whitespace-nowrap');
    expect(bText?.className).toContain('max-w-[86%]');
    expect(bText?.style.fontSize).toBe('clamp(11px, 17cqi, 16px)');
  });

  it('boton de favoritos se renderiza dentro de .bg-white en ambos caminos y fuera de .faces en prenda con espalda', () => {
    // 1. Prenda con vista posterior
    const { container: withBack } = render(<CatalogCard garment={garmentWithBack} />);
    const imgBoxWithBack = withBack.querySelector('.bg-white');
    expect(imgBoxWithBack).toBeTruthy();
    const heartBtnWithBack = imgBoxWithBack?.querySelector(
      'button[aria-label*="favoritos"], button[aria-label*="Wishlist"]',
    );
    expect(heartBtnWithBack).toBeTruthy();
    expect(heartBtnWithBack?.className).toContain('absolute');
    expect(heartBtnWithBack?.className).toContain('top-2');
    expect(heartBtnWithBack?.className).toContain('right-2');
    expect(heartBtnWithBack?.className).toContain('z-20');
    expect(heartBtnWithBack?.className).toContain('pointer-events-auto');

    // Comprobar que NO está dentro de .faces
    const faces = withBack.querySelector('.faces');
    expect(faces).toBeTruthy();
    expect(faces?.contains(heartBtnWithBack)).toBe(false);

    // 2. Prenda sin vista posterior
    const { container: withoutBack } = render(
      <CatalogCard garment={garmentWithoutBack} />,
    );
    const imgBoxWithoutBack = withoutBack.querySelector('.bg-white');
    expect(imgBoxWithoutBack).toBeTruthy();
    const heartBtnWithoutBack = imgBoxWithoutBack?.querySelector(
      'button[aria-label*="favoritos"], button[aria-label*="Wishlist"]',
    );
    expect(heartBtnWithoutBack).toBeTruthy();
    expect(heartBtnWithoutBack?.className).toContain('absolute');
    expect(heartBtnWithoutBack?.className).toContain('top-2');
    expect(heartBtnWithoutBack?.className).toContain('right-2');
    expect(heartBtnWithoutBack?.className).toContain('z-20');
    expect(heartBtnWithoutBack?.className).toContain('pointer-events-auto');
  });

  it('linea de la prenda tiene text-accent-cyan y barrita roja acento', () => {
    const { container } = render(<CatalogCard garment={garmentWithBack} />);
    const lineEl = container.querySelector('.font-mono.text-base');
    expect(lineEl).toBeTruthy();
    expect(lineEl?.className).toContain('text-accent-cyan');
    expect(lineEl?.className).toContain('tracking-[0.16em]');

    const barEl = lineEl?.querySelector('span.bg-brand-red');
    expect(barEl).toBeTruthy();
    expect(barEl?.className).toContain('w-[12px]');
    expect(barEl?.className).toContain('h-[2px]');
  });

  it('el precio tiene text-2xl font-semibold text-fg tabular-nums', () => {
    const { container } = render(<CatalogCard garment={garmentWithBack} />);
    const priceEl = container.querySelector('.font-mono.text-2xl');
    expect(priceEl).toBeTruthy();
    expect(priceEl?.className).toContain('font-semibold');
    expect(priceEl?.className).toContain('text-fg');
    expect(priceEl?.className).toContain('tabular-nums');
    expect(priceEl?.textContent).toContain('$35.29');
  });
});
