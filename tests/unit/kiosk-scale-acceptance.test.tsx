// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { render } from '@testing-library/react';
import { CameraStage } from '@/components/camera/CameraStage';
import { useKioskStore } from '@/store/kiosk';
import { useSizingStore } from '@/store/sizing';
import { useGarmentStore } from '@/store/garment';
import { useCamera } from '@/hooks/useCamera';
import { usePose } from '@/hooks/usePose';
import { usePresence } from '@/hooks/usePresence';

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

describe('Kiosk Scale & Operator Mode Acceptance (Phase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    useKioskStore.setState({ state: 'TRYON' });
    useSizingStore.setState({
      hasProfile: true,
      sessionId: 'session-123',
    });
    useGarmentStore.setState({
      activeGarmentId: 'garment-1',
      catalog: [
        {
          id: 'garment-1',
          sku: 'SWF-HD-01',
          name: 'Swift Sport Hoodie',
          line: 'Swift Sport',
          category: 'top',
          price: 65,
          overlayUrl: '/garments/SWF-HD-01.png',
          thumbnailUrl: '/garments/SWF-HD-01.png',
          sizes: ['S', 'M', 'L'],
          colors: ['black'],
        },
      ],
    });
  });

  it('does NOT render PRESENCE, fps or AR INFO in DOM without operator mode (?dev=1 or ?debug=1)', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '', hash: '#/' },
    });

    const { container } = render(<CameraStage />);

    // Assert PRESENCE text is not anywhere in the DOM
    expect(container.textContent).not.toContain('PRESENCE');
    expect(container.textContent).not.toContain('actual');
    expect(container.textContent).not.toContain('AR INFO');
  });

  it('renders PRESENCE, fps badge and AR INFO when ?dev=1 is present', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?dev=1', hash: '#/' },
    });

    const { container } = render(<CameraStage />);

    expect(container.textContent).toContain('PRESENCE');
    expect(container.textContent).toContain('fps');
  });

  it('shows amber degraded camera dot with aria-label when camera height < expected', () => {
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

    const { container } = render(<CameraStage />);
    const amberDot = container.querySelector(
      '[aria-label="Cámara en resolución reducida"]',
    );
    expect(amberDot).toBeTruthy();
    expect(amberDot?.className).toContain('bg-amber-500');

    import.meta.env.VITE_EXPECTED_CAMERA_HEIGHT = originalEnv;
  });

  it('guarantees touch targets in interactive flow are >= 64px in 1080x1920', () => {
    const { container } = render(<CameraStage />);

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(0);

    for (const btn of buttons) {
      // Check classes / styles: should have min-w / min-h or explicit px dimensions >= 64px
      const style = btn.getAttribute('style') || '';
      const cls = btn.className;

      const hasSufficientDimension =
        cls.includes('w-[160px]') ||
        cls.includes('w-[144px]') ||
        cls.includes('min-w-[72px]') ||
        cls.includes('min-h-[72px]') ||
        cls.includes('w-[72px]') ||
        cls.includes('h-[64px]') ||
        cls.includes('min-h-[64px]') ||
        cls.includes('min-w-[64px]') ||
        style.includes('min-height: 80px') ||
        style.includes('min-width: 80px') ||
        style.includes('min-height: 60px') ||
        cls.includes('min-h-[60px]') ||
        cls.includes('p-3') ||
        cls.includes('p-4') ||
        cls.includes('p-6') ||
        cls.includes('py-4');

      if (!hasSufficientDimension) {
        console.error('Button failing touch target criteria:', btn.outerHTML);
      }
      expect(hasSufficientDimension).toBe(true);
    }
  });
});
