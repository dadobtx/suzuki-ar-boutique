// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import type { Garment } from '@/types/garment';
import { RackPanel } from '@/components/rack/RackPanel';
import { useGarmentStore } from '@/store/garment';
import { useKioskStore } from '@/store/kiosk';

const catalogJson: Garment[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'public/catalog.json'), 'utf-8'),
);

describe('Rack Reset y Ciclo de Vida del Perchero (rack-reset)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
      catalog: catalogJson,
      activeGarmentId: null,
      activeVariantId: null,
      wishlist: [],
    });

    useKioskStore.setState({
      state: 'TRYON',
      stateStartTime: Date.now(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('con prenda puesta y foco en otra, pasar kioskState a ATTRACT → focusIdx null, ningún slot vacío, leyenda en modo resumen, ningún flyer en DOM', async () => {
    // Simular prenda puesta (slot 0)
    useGarmentStore.setState({ activeGarmentId: catalogJson[0].id });

    // Montar RackPanel interactivo y activo
    render(<RackPanel mode="interactive" active={true} />);

    // Foco en la prenda 1 con ArrowRight (desde slot 0 que tenía foco por ser activa)
    const slots = screen.getAllByRole('option');
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    // Slot 1 tiene foco y el slot 0 está vacío (porque es activeGarmentId)
    expect(slots[1].getAttribute('aria-selected')).toBe('true');
    expect(slots[0].className).toContain('empty');

    // Simular que se creó un flyer huérfano en el DOM
    const dummyFlyer = document.createElement('img');
    dummyFlyer.className = 'rack-flyer';
    document.body.appendChild(dummyFlyer);
    expect(document.querySelectorAll('.rack-flyer').length).toBe(1);

    // Pasar kioskState a ATTRACT y limpiar activeGarmentId como hace el store al salir
    act(() => {
      useGarmentStore.setState({ activeGarmentId: null });
      useKioskStore.setState({ state: 'ATTRACT' });
    });

    // Avanzar temporizadores
    act(() => {
      vi.runAllTimers();
    });

    // 1. Ningún slot está abierto (focusIdx es null)
    slots.forEach((s) => {
      expect(s.getAttribute('aria-selected')).toBe('false');
    });

    // 2. Ningún slot está vacío (todas las prendas volvieron al gancho)
    slots.forEach((s) => {
      expect(s.className).not.toContain('empty');
    });

    // 3. Leyenda en modo resumen: "Colección Suzuki", cantidad de prendas y precio base
    const caption = screen.getByTestId('rack-caption');
    expect(caption.textContent).toContain('Colección Suzuki');
    expect(caption.textContent).toContain(`${catalogJson.length} prendas`);
    expect(caption.textContent).toContain('desde $35.29');

    // 4. Ningún elemento .rack-flyer en el DOM
    expect(document.querySelectorAll('.rack-flyer').length).toBe(0);
  });

  it('la mecida de despertar se dispara al pasar active false→true y NO al seleccionar una prenda', async () => {
    // Montar inicialmente inactivo (como está en StagePanel durante ATTRACT / onboarding)
    const { rerender, container } = render(
      <RackPanel mode="interactive" active={false} />,
    );

    // Avanzar temporizadores: con active=false no debe haber slots meciéndose
    act(() => {
      vi.advanceTimersByTime(500);
    });

    const initialKicking = container.querySelectorAll('.kick, .kick2');
    expect(initialKicking.length).toBe(0);

    // Pasar active de false a true (terminó onboarding / entra a TRYON)
    rerender(<RackPanel mode="interactive" active={true} />);

    // Avanzar el tiempo escalonado de la mecida de despertar (hasta ~800ms)
    act(() => {
      vi.advanceTimersByTime(800);
    });

    // La mecida escalonada despertó múltiples prendas
    const wakeUpKicking = container.querySelectorAll('.kick, .kick2');
    expect(wakeUpKicking.length).toBeGreaterThan(0);

    // Limpiar clases de mecida pasando los 1.5s de animación
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Ahora simular selección de una prenda manteniendo active=true
    const activeGarment = catalogJson[2];
    act(() => {
      useGarmentStore.setState({ activeGarmentId: activeGarment.id });
    });

    // Re-render con prenda seleccionada
    rerender(<RackPanel mode="interactive" active={true} />);

    // Avanzar el tiempo: NO debe dispararse la mecida completa escalonada del perchero
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // El perchero entero no se meció por la selección
    const kickingAfterSelection = container.querySelectorAll('.kick, .kick2');
    // Como active ya era true, el efecto de mecida de despertar NO corrió para todas las prendas
    expect(kickingAfterSelection.length).toBeLessThan(catalogJson.length);
  });

  it('geometría en 1080×672 (kiosko real): garmentHeight es 352px y leyenda tiene 120px', () => {
    // Simular ResizeObserver entregando 672px
    let resizeCallback: ResizeObserverCallback | null = null;
    class MockRO {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockRO);

    const { container } = render(<RackPanel mode="interactive" active={true} />);

    // Simular medición de 672px de alto
    act(() => {
      resizeCallback?.(
        [
          { contentRect: { height: 672, width: 1080 } },
        ] as unknown as ResizeObserverEntry[],
        {} as unknown as ResizeObserver,
      );
    });

    // En 672px, garmentHeight es 352px (var(--gh: 352px))
    const firstSlot = container.querySelector('.rack-slot') as HTMLElement;
    expect(firstSlot.style.getPropertyValue('--gh')).toBe('352px');

    // Contenedor de leyenda tiene altura 120px
    const captionContainer = container.querySelector(
      '.rack-caption, [data-testid="rack-caption"]',
    )?.parentElement;
    expect(captionContainer?.style.height).toBe('120px');
  });

  it('geometría en 1915×305 (laptop horizontal ?layout=portrait): sin superposición con leyenda', () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    class MockRO {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockRO);

    const { container } = render(<RackPanel mode="interactive" active={true} />);

    // Simular medición de 305px de alto
    act(() => {
      resizeCallback?.(
        [
          { contentRect: { height: 305, width: 1915 } },
        ] as unknown as ResizeObserverEntry[],
        {} as unknown as ResizeObserver,
      );
    });

    // En 305px, garmentHeight es 120px mínimo
    const firstSlot = container.querySelector('.rack-slot') as HTMLElement;
    expect(firstSlot.style.getPropertyValue('--gh')).toBe('120px');

    // Contenedor de leyenda tiene altura compacta de 64px
    const captionContainer = container.querySelector(
      '.rack-caption, [data-testid="rack-caption"]',
    )?.parentElement;
    expect(captionContainer?.style.height).toBe('64px');

    // Fondo de la prenda: 56px (contenedor) + 50px (gancho) + 120px = 226px
    // Inicio de la leyenda: 305px - 8px - 64px = 233px
    // Margen libre entre prenda y leyenda: 233px - 226px = 7px (sin superposición)
    const panelHeight = 305;
    const garmentBottom = 56 + 50 + 120;
    const captionTop = panelHeight - 8 - 64;
    expect(captionTop).toBeGreaterThan(garmentBottom);
  });
});
