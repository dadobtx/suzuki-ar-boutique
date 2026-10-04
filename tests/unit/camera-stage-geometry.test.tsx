// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { render } from '@testing-library/react';
import { CameraStage } from '@/components/camera/CameraStage';
import { useKioskStore, type KioskState } from '@/store/kiosk';
import { useSizingStore } from '@/store/sizing';
import { useGarmentStore } from '@/store/garment';
import { useCamera } from '@/hooks/useCamera';
import { usePose } from '@/hooks/usePose';
import { usePresence, type PresenceState } from '@/hooks/usePresence';

// Mock dependencies
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
    t: (key: string, def?: string) => def || key,
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

describe('CameraStage geometry measurement across states', () => {
  const states: {
    name: string;
    kioskState: KioskState;
    hasProfile: boolean;
    presence: PresenceState;
  }[] = [
    { name: 'onboarding', kioskState: 'ATTRACT', hasProfile: false, presence: 'present' },
    { name: 'AWAKENING', kioskState: 'AWAKENING', hasProfile: true, presence: 'present' },
    {
      name: 'CALIBRATING',
      kioskState: 'CALIBRATING',
      hasProfile: true,
      presence: 'present',
    },
    { name: 'TRYON', kioskState: 'TRYON', hasProfile: true, presence: 'present' },
    {
      name: 'PHOTO_COUNTDOWN',
      kioskState: 'PHOTO_COUNTDOWN',
      hasProfile: true,
      presence: 'present',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
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
    mockUsePresence.mockReturnValue('present');
  });

  describe('Vertical layout (1080x1920)', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1080,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 1920,
      });
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query) => ({
          matches: query.includes('portrait'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
    });

    for (const s of states) {
      it(`measures [data-stage="mirror"] in ${s.name}`, () => {
        useKioskStore.setState({ state: s.kioskState });
        useSizingStore.setState({ hasProfile: s.hasProfile });
        mockUsePresence.mockReturnValue(s.presence);

        const { container } = render(<CameraStage />);
        const mirrorEl = container.querySelector('[data-stage="mirror"]') as HTMLElement;
        expect(mirrorEl).toBeTruthy();

        // In 1080x1920 portrait: 65fr of 1920 = 1920 * 0.65 = 1248px height, 1080px width
        expect(mirrorEl.getAttribute('data-stage')).toBe('mirror');
        expect(mirrorEl.className).toContain('min-h-0');
        expect(mirrorEl.className).toContain('min-w-0');
        expect(container.firstElementChild?.className).toContain('grid-rows-[65fr_35fr]');
      });
    }
  });

  describe('Horizontal layout (1440x900)', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1440,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 900,
      });
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
    });

    for (const s of states) {
      it(`measures [data-stage="mirror"] in ${s.name}`, () => {
        useKioskStore.setState({ state: s.kioskState });
        useSizingStore.setState({ hasProfile: s.hasProfile });
        mockUsePresence.mockReturnValue(s.presence);

        const { container } = render(<CameraStage />);
        const mirrorEl = container.querySelector('[data-stage="mirror"]') as HTMLElement;
        expect(mirrorEl).toBeTruthy();

        // In 1440x900 landscape: 7fr of 10fr = 1440 * 0.7 = 1008px width, 900px height
        expect(mirrorEl.getAttribute('data-stage')).toBe('mirror');
        expect(container.firstElementChild?.className).toContain('grid-cols-[7fr_3fr]');
      });
    }
  });

  describe('Mirror plaque sizing resolution', () => {
    it('displays active garment plaque with TALLA M when profile is M and no manual size is chosen', () => {
      useGarmentStore.setState({
        activeGarmentId: 'test-garment-1',
        catalog: [
          {
            id: 'test-garment-1',
            sku: 'SWF-HD-01',
            name: 'Swift Sport Hoodie',
            line: 'Swift Sport',
            category: 'top',
            price: 65,
            imageUrl: '/test.png',
            overlayUrl: '/garments/SWF-HD-01.png',
            thumbnailUrl: '/garments/SWF-HD-01.png',
            sizes: ['S', 'M', 'L', 'XL'], // Notice sizes[0] is 'S'
            colors: ['black'],
            description: '',
            cutType: 'regular',
            tags: [],
            gender: 'unisex',
          },
        ],
      });
      useKioskStore.setState({ state: 'TRYON' });
      useSizingStore.setState({
        hasProfile: true,
        tallaHabitual: 'M',
        preferenciaFit: 'regular',
        tallasElegidas: {},
      });

      const { getByText } = render(<CameraStage />);
      expect(getByText(/Swift Sport Hoodie · TALLA M/)).toBeTruthy();
    });
  });
});
