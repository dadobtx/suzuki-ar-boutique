// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockedFunction,
} from 'vitest';
import { render, screen, act } from '@testing-library/react';
import realCatalog from '../../public/catalog.json';
import type { Garment } from '@/types/garment';
import {
  buildShowcaseSlides,
  type ShowcaseSlide,
} from '@/components/kiosk/showcase/buildShowcaseSlides';
import { ShowcaseSlide as ShowcaseSlideComponent } from '@/components/kiosk/showcase/ShowcaseSlide';
import { AttractPanel } from '@/components/kiosk/AttractPanel';
import { AttractLoop } from '@/components/kiosk/AttractLoop';
import { CameraStage } from '@/components/camera/CameraStage';
import { useGarmentStore } from '@/store/garment';
import { useKioskStore } from '@/store/kiosk';
import { useCamera } from '@/hooks/useCamera';
import { usePose } from '@/hooks/usePose';
import { usePresence } from '@/hooks/usePresence';

// Mock dependencies for CameraStage
vi.mock('@/hooks/useCamera', () => ({
  useCamera: vi.fn(),
}));

vi.mock('@/hooks/usePose', () => ({
  usePose: vi.fn(),
}));

vi.mock('@/hooks/usePresence', () => ({
  usePresence: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defOrParams?: string | Record<string, unknown>,
      params?: Record<string, unknown>,
    ) => {
      let def: string | undefined;
      let values: Record<string, unknown> | undefined;
      if (typeof defOrParams === 'string') {
        def = defOrParams;
        values = params;
      } else {
        values = defOrParams;
      }
      if (key === 'kiosk.attract.standOnMark') return 'PÁRATE EN LA MARCA DEL PISO';
      if (key === 'kiosk.attract.title') return 'PRUÉBATE LA COLECCIÓN SUZUKI';
      if (key === 'kiosk.attract.showcase.backView') return 'ASÍ ES POR DETRÁS';
      if (key === 'kiosk.attract.showcase.backViewAlt') return 'vista posterior';
      if (key === 'kiosk.attract.showcase.sizes') return 'TALLAS';
      if (key === 'kiosk.attract.showcase.colors') return `${values?.count} COLORES`;
      if (key === 'kiosk.attract.showcase.cta') return 'PRUÉBATELA EN EL ESPEJO';
      if (key === 'kiosk.attract.showcase.summaryTitle') return 'COLECCIÓN SUZUKI';
      if (key === 'kiosk.attract.showcase.summaryCount')
        return `${values?.count} PRENDAS`;
      if (key === 'kiosk.attract.showcase.summaryFrom') return 'DESDE';
      if (key === 'kiosk.attract.showcase.summaryCta')
        return 'PÁRATE FRENTE AL ESPEJO Y PRUÉBATELAS';
      return def || key;
    },
  }),
}));

const mockUseCamera = useCamera as unknown as MockedFunction<typeof useCamera>;
const mockUsePose = usePose as unknown as MockedFunction<typeof usePose>;
const mockUsePresence = usePresence as unknown as MockedFunction<typeof usePresence>;

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

describe('Attract Showcase & Impeccable Improvements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
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
      catalog: realCatalog as unknown as Garment[],
      activeGarmentId: null,
    });
    mockUseCamera.mockReturnValue({
      videoRef: { current: document.createElement('video') },
      status: 'granted',
      error: null,
      settings: { width: 1920, height: 1080, frameRate: 30 },
      retry: vi.fn(),
      deviceLabel: 'Camera',
      availableCameras: [],
      switchCamera: vi.fn(),
    });
    mockUsePose.mockReturnValue({
      landmarks: null,
      worldLandmarks: null,
      mask: null,
      frameId: 1,
      timestamp: 0,
    });
    mockUsePresence.mockReturnValue('absent');
    useKioskStore.setState({ state: 'ATTRACT' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('buildShowcaseSlides', () => {
    it('builds exactly 11 slides (10 garments + 1 summary) from real catalog.json', () => {
      const slides = buildShowcaseSlides(realCatalog as unknown as Garment[]);
      expect(slides).toHaveLength(11);

      const garmentSlides = slides.filter(
        (s): s is Extract<ShowcaseSlide, { kind: 'garment' }> => s.kind === 'garment',
      );
      expect(garmentSlides).toHaveLength(10);

      // 990F0-BKQJ5 has 2 variants with illustrations and photos
      const bkqj5Slide = garmentSlides.find((s) => s.garment.id === '990F0-BKQJ5');
      expect(bkqj5Slide).toBeDefined();
      expect(bkqj5Slide?.illustrations).toHaveLength(2);
      expect(bkqj5Slide?.photos).toHaveLength(2);
      expect(bkqj5Slide?.photos[1]?.thumb).toMatch(/990F0-BKQJ5_2\.thumb\.png$/);
      expect(bkqj5Slide?.colorCount).toBe(2);

      // The other 9 garments have 1 illustration
      const otherSlides = garmentSlides.filter((s) => s.garment.id !== '990F0-BKQJ5');
      expect(otherSlides).toHaveLength(9);
      otherSlides.forEach((s) => {
        expect(s.illustrations).toHaveLength(1);
      });

      // Summary slide specifications
      const summarySlide = slides.find(
        (s): s is Extract<ShowcaseSlide, { kind: 'summary' }> => s.kind === 'summary',
      );
      expect(summarySlide).toBeDefined();
      expect(summarySlide?.count).toBe(10);
      expect(summarySlide?.minPriceCents).toBe(3529);
      expect(summarySlide?.illustrations.length).toBeLessThanOrEqual(6);
      expect(summarySlide?.illustrations.length).toBeGreaterThanOrEqual(1);

      // All URLs must start with BASE_URL
      const baseUrl = import.meta.env.BASE_URL;
      slides.forEach((s) => {
        if (s.kind === 'garment') {
          s.illustrations.forEach((url) => {
            expect(url.startsWith(baseUrl)).toBe(true);
          });
          s.photos.forEach((p) => {
            if (p.thumb) expect(p.thumb.startsWith(baseUrl)).toBe(true);
            if (p.full) expect(p.full.startsWith(baseUrl)).toBe(true);
          });
        } else {
          s.illustrations.forEach((url) => {
            expect(url.startsWith(baseUrl)).toBe(true);
          });
        }
      });
    });

    it('handles garments without illustration with illustrations [] and renders without "ASÍ ES POR DETRÁS"', () => {
      const customGarment: Garment = {
        id: 'no-illust-1',
        sku: 'TEST-SKU-1',
        name: 'Prenda Sin Ilustración',
        line: 'Team Suzuki',
        category: 'top',
        thumbnailUrl: '/garments/test-thumb.png',
        overlayUrl: '/garments/test-overlay.png',
        sizes: ['M'],
        colors: ['#000000'],
        priceCents: 5000,
      } as Garment;

      const slides = buildShowcaseSlides([customGarment]);
      expect(slides).toHaveLength(2); // 1 garment + 1 summary
      const garmentSlide = slides[0] as Extract<ShowcaseSlide, { kind: 'garment' }>;
      expect(garmentSlide.illustrations).toEqual([]);
      expect(garmentSlide.photos[0]?.thumb).toBeDefined();

      useGarmentStore.setState({ catalog: [customGarment] });
      render(<AttractPanel />);

      expect(screen.getByText('Prenda Sin Ilustración')).toBeTruthy();
      // Should NOT render the small "ASÍ ES POR DETRÁS" card badge
      expect(screen.queryByText('ASÍ ES POR DETRÁS')).toBeNull();
    });

    it('skips garments that have neither illustration NOR photo', () => {
      const emptyGarment: Garment = {
        id: 'empty-1',
        sku: 'EMPTY-SKU',
        name: 'Prenda Fantasma',
        line: 'Team Suzuki',
        category: 'top',
        sizes: ['M'],
        colors: ['#000000'],
      } as Garment;

      const slides = buildShowcaseSlides([emptyGarment]);
      expect(slides).toHaveLength(0);
    });
  });

  describe('ShowcaseSlide Back View Card ("ASÍ ES POR DETRÁS")', () => {
    it('populates back thumbnail in buildShowcaseSlides only for garments with back view', () => {
      const slides = buildShowcaseSlides(realCatalog as unknown as Garment[]);
      const garmentSlides = slides.filter(
        (s): s is Extract<ShowcaseSlide, { kind: 'garment' }> => s.kind === 'garment',
      );

      const withBackSkus = [
        '990F0-BKTM1',
        '990F0-BKPM5',
        '990F0-BKHM0',
        '990F0-BLMJ4',
        '990F0-BLPK0',
        '990F0-JYFJ1',
        '990F0-FCHJ0',
      ];
      const withoutBackSkus = ['990F0-BKBW5', '990F0-BKQJ5', '990F0-RSSM0'];

      withBackSkus.forEach((id) => {
        const slide = garmentSlides.find((s) => s.garment.id === id);
        expect(slide).toBeDefined();
        expect(slide?.photos[0]?.back).toBeDefined();
        expect(slide?.photos[0]?.back).toMatch(/\.back\.thumb\.png$/);
      });

      withoutBackSkus.forEach((id) => {
        const slide = garmentSlides.find((s) => s.garment.id === id);
        expect(slide).toBeDefined();
        slide?.photos.forEach((photo) => {
          expect(photo.back).toBeUndefined();
        });
      });
    });

    it('renders "ASÍ ES POR DETRÁS" card for 990F0-BKTM1 with correct image and alt text', () => {
      const slides = buildShowcaseSlides(realCatalog as unknown as Garment[]);
      const bktm1Slide = slides.find(
        (s): s is Extract<ShowcaseSlide, { kind: 'garment' }> =>
          s.kind === 'garment' && s.garment.id === '990F0-BKTM1',
      );
      expect(bktm1Slide).toBeDefined();

      const { container } = render(<ShowcaseSlideComponent slide={bktm1Slide!} />);
      expect(screen.getByText('ASÍ ES POR DETRÁS')).toBeTruthy();

      const backImg = container.querySelector(
        'img[src*="990F0-BKTM1.back.thumb.png"]',
      ) as HTMLImageElement;
      expect(backImg).toBeTruthy();
      const baseUrl = import.meta.env.BASE_URL;
      const srcAttr = backImg.getAttribute('src') || '';
      expect(srcAttr.startsWith(baseUrl)).toBe(true);
      expect(backImg.alt).toBe('Team Black T-Shirt — vista posterior');
    });

    it('does NOT render card for 990F0-BKBW5 or 990F0-BKQJ5 (both variants)', () => {
      vi.useFakeTimers();
      const slides = buildShowcaseSlides(realCatalog as unknown as Garment[]);

      // 990F0-BKBW5
      const bkbw5Slide = slides.find(
        (s): s is Extract<ShowcaseSlide, { kind: 'garment' }> =>
          s.kind === 'garment' && s.garment.id === '990F0-BKBW5',
      );
      expect(bkbw5Slide).toBeDefined();
      const { unmount } = render(<ShowcaseSlideComponent slide={bkbw5Slide!} />);
      expect(screen.queryByText('ASÍ ES POR DETRÁS')).toBeNull();
      unmount();

      // 990F0-BKQJ5 (2 variants)
      const bkqj5Slide = slides.find(
        (s): s is Extract<ShowcaseSlide, { kind: 'garment' }> =>
          s.kind === 'garment' && s.garment.id === '990F0-BKQJ5',
      );
      expect(bkqj5Slide).toBeDefined();
      const { unmount: unmount2 } = render(
        <ShowcaseSlideComponent slide={bkqj5Slide!} />,
      );
      expect(screen.queryByText('ASÍ ES POR DETRÁS')).toBeNull();

      // Cycle to second variant (after 1600ms)
      act(() => {
        vi.advanceTimersByTime(1600);
      });
      expect(screen.queryByText('ASÍ ES POR DETRÁS')).toBeNull();
      unmount2();
    });
  });

  describe('AttractPanel orchestration & behaviors', () => {
    it('advances slides after SLIDE_MS (5500 ms) and pauses when document.hidden is true', () => {
      vi.useFakeTimers();

      render(<AttractPanel />);

      // First garment from catalog.json is Team Black T-Shirt
      expect(screen.getByText('Team Black T-Shirt')).toBeTruthy();

      // Advance by SLIDE_MS (5500 ms)
      act(() => {
        vi.advanceTimersByTime(5500);
      });

      // Second garment is Team Black Polo
      expect(screen.getByText('Team Black Polo')).toBeTruthy();

      // Now hide document
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      // Advance time while hidden: slide must NOT advance
      act(() => {
        vi.advanceTimersByTime(5500);
      });
      expect(screen.getByText('Team Black Polo')).toBeTruthy();

      // Restore visibility: slide should advance
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => false,
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(5500);
      });
      expect(screen.getByText('Team Black Hoodie')).toBeTruthy();
    });

    it('never calls selectGarment or toggleWishlist (is completely passive)', () => {
      vi.useFakeTimers();

      const selectGarmentSpy = vi.fn();
      const toggleWishlistSpy = vi.fn();

      useGarmentStore.setState({
        selectGarment: selectGarmentSpy,
        toggleWishlist: toggleWishlistSpy,
      });

      render(<AttractPanel />);

      act(() => {
        vi.advanceTimersByTime(11000);
      });

      expect(selectGarmentSpy).not.toHaveBeenCalled();
      expect(toggleWishlistSpy).not.toHaveBeenCalled();
    });

    it('does NOT contain "PÁRATE EN LA MARCA DEL PISO" in AttractPanel, but AttractLoop DOES', () => {
      const { unmount } = render(<AttractPanel />);
      expect(screen.queryByText(/PÁRATE EN LA MARCA DEL PISO/i)).toBeNull();
      unmount();

      render(<AttractLoop />);
      expect(screen.getByText(/PÁRATE EN LA MARCA DEL PISO/i)).toBeTruthy();
    });
  });

  describe('CameraStage Degraded Indicator (6.2)', () => {
    it('does NOT display amber degraded dot without operator mode (?debug=1 or ?dev=1), even if height < expected', () => {
      const originalEnv = import.meta.env.VITE_EXPECTED_CAMERA_HEIGHT;
      import.meta.env.VITE_EXPECTED_CAMERA_HEIGHT = '1440';

      mockUseCamera.mockReturnValue({
        videoRef: { current: document.createElement('video') },
        status: 'granted',
        error: null,
        settings: { width: 1920, height: 1080, frameRate: 30 },
        retry: vi.fn(),
        deviceLabel: 'Camera',
        availableCameras: [],
        switchCamera: vi.fn(),
      });

      Object.defineProperty(window, 'location', {
        writable: true,
        value: { search: '', hash: '#/' },
      });

      const { container } = render(<CameraStage />);
      const amberDot = container.querySelector(
        '[aria-label="Cámara en resolución reducida"]',
      );
      expect(amberDot).toBeNull();

      import.meta.env.VITE_EXPECTED_CAMERA_HEIGHT = originalEnv;
    });

    it('displays amber degraded dot with ?debug=1 when height < expected', () => {
      const originalEnv = import.meta.env.VITE_EXPECTED_CAMERA_HEIGHT;
      import.meta.env.VITE_EXPECTED_CAMERA_HEIGHT = '1440';

      mockUseCamera.mockReturnValue({
        videoRef: { current: document.createElement('video') },
        status: 'granted',
        error: null,
        settings: { width: 1920, height: 1080, frameRate: 30 },
        retry: vi.fn(),
        deviceLabel: 'Camera',
        availableCameras: [],
        switchCamera: vi.fn(),
      });

      Object.defineProperty(window, 'location', {
        writable: true,
        value: { search: '?debug=1', hash: '#/' },
      });

      const { container } = render(<CameraStage />);
      const amberDot = container.querySelector(
        '[aria-label="Cámara en resolución reducida"]',
      );
      expect(amberDot).toBeTruthy();
      expect(amberDot?.className).toContain('bg-amber-500');

      import.meta.env.VITE_EXPECTED_CAMERA_HEIGHT = originalEnv;
    });
  });
});
