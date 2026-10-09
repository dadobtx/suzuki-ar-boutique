// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { CameraStage } from '@/components/camera/CameraStage';
import { useKioskStore } from '@/store/kiosk';
import { useCamera } from '@/hooks/useCamera';
import { usePose } from '@/hooks/usePose';
import { usePresence, type PresenceState } from '@/hooks/usePresence';

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

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

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

describe('CameraStage - QA override hooks restricted to debug mode', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    delete (window as unknown as { location: unknown }).location;
    window.location = new URL('http://localhost/') as unknown as Location;

    const mockVideo = document.createElement('video');
    (useCamera as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      videoRef: { current: mockVideo },
      status: 'granted',
      error: null,
      settings: { width: 1280, height: 720, frameRate: 30 },
      retry: vi.fn(),
      deviceLabel: 'Camera',
      availableCameras: [],
      switchCamera: vi.fn(),
    });

    (usePose as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      landmarks: null,
      worldLandmarks: null,
      mask: null,
      fps: 30,
      latency: 20,
      modelVersion: 'full',
      backend: 'WebGL2',
      inferring: false,
      error: null,
      frameId: 1,
      activeZone: {
        enabled: false,
        lockedIndex: null,
        candidates: [],
        approaching: false,
      },
      lockedWrists: { left: null, right: null },
    });

    (usePresence as unknown as ReturnType<typeof vi.fn>).mockReturnValue('absent');

    useKioskStore.setState({
      state: 'ATTRACT',
      arrivedAt: null,
      cooldownStartedAt: null,
    });

    delete (window as unknown as { __presenceOverride?: PresenceState })
      .__presenceOverride;
    delete (window as unknown as { __landmarksOverride?: unknown }).__landmarksOverride;
    delete (window as unknown as { __activeZoneOverride?: unknown }).__activeZoneOverride;
  });

  afterEach(() => {
    window.location = originalLocation;
    delete (window as unknown as { __presenceOverride?: PresenceState })
      .__presenceOverride;
    delete (window as unknown as { __landmarksOverride?: unknown }).__landmarksOverride;
    delete (window as unknown as { __activeZoneOverride?: unknown }).__activeZoneOverride;
    vi.clearAllMocks();
  });

  it('sin ?debug=1, despachar kiosk-presence con un override no cambia la presencia ni registra listeners de QA', async () => {
    window.location = new URL('http://localhost/') as unknown as Location;

    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    render(<CameraStage />);

    // Listeners de QA no deben haberse registrado
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      'kiosk-presence',
      expect.any(Function),
    );
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      'kiosk-landmarks',
      expect.any(Function),
    );
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      'kiosk-active-zone',
      expect.any(Function),
    );

    // KioskGuide muestra que el usuario sigue ausente
    expect(screen.getByText(/PÁRATE EN LA MARCA DEL PISO/i)).toBeTruthy();

    // Intentar override
    (window as unknown as { __presenceOverride: PresenceState }).__presenceOverride =
      'present';

    act(() => {
      window.dispatchEvent(new CustomEvent('kiosk-presence'));
    });

    // Sin ?debug=1, el override no tiene efecto: presencia sigue en absent
    expect(screen.getByText(/PÁRATE EN LA MARCA DEL PISO/i)).toBeTruthy();
    expect(screen.queryByText(/PRESENCE: PRESENT/i)).toBeNull();
  });

  it('con ?debug=1, registra listeners de QA y despachar kiosk-presence sí cambia la presencia', async () => {
    window.location = new URL('http://localhost/?debug=1') as unknown as Location;

    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    render(<CameraStage />);

    // Listeners de QA sí deben haberse registrado
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'kiosk-presence',
      expect.any(Function),
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'kiosk-landmarks',
      expect.any(Function),
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'kiosk-active-zone',
      expect.any(Function),
    );

    // Estado inicial en debug HUD: PRESENCE: ABSENT
    expect(screen.getByText(/PRESENCE: ABSENT/i)).toBeTruthy();

    // Override en debug mode
    (window as unknown as { __presenceOverride: PresenceState }).__presenceOverride =
      'present';

    act(() => {
      window.dispatchEvent(new CustomEvent('kiosk-presence'));
    });

    // En debug mode, se procesa el override y actualiza la presencia a PRESENT en el HUD
    expect(screen.getByText(/PRESENCE: PRESENT/i)).toBeTruthy();
  });
});
