// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StagePanel } from '@/components/camera/StagePanel';
import { useGarmentStore } from '@/store/garment';
import { useSizingStore } from '@/store/sizing';
import type { PresenceState } from '@/hooks/usePresence';

describe('StagePanel condition precedence table', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      catalog: [
        {
          id: 'test-1',
          sku: 'SWF-HD-01',
          name: 'Swift Sport Hoodie',
          line: 'Swift Sport',
          category: 'top',
          price: 65,
          imageUrl: '/test.png',
          overlayUrl: '/garments/SWF-HD-01.png',
          thumbnailUrl: '/garments/SWF-HD-01.png',
          sizes: ['S', 'M', 'L'],
          colors: ['black'],
          description: '',
          cutType: 'regular',
          tags: [],
          gender: 'unisex',
        },
      ],
    });
    useSizingStore.setState({
      hasProfile: false,
      tallasElegidas: {},
    });
  });

  it('renders Onboarding when !hasProfile and presence !== "absent"', () => {
    render(
      <StagePanel
        kioskState="ATTRACT"
        hasProfile={false}
        presence={'present' as PresenceState}
      />,
    );

    expect(screen.getByTestId('panel-onboarding')).toBeTruthy();
    expect(screen.queryByTestId('panel-attract')).toBeNull();
    const catalogEl = screen.getByTestId('panel-catalog');
    expect(catalogEl.inert).toBe(true);
  });

  it('renders AttractPanel when hasProfile=true and kioskState="ATTRACT"', () => {
    render(
      <StagePanel
        kioskState="ATTRACT"
        hasProfile={true}
        presence={'absent' as PresenceState}
      />,
    );

    expect(screen.getByTestId('panel-attract')).toBeTruthy();
    expect(screen.queryByTestId('panel-onboarding')).toBeNull();
    expect(screen.getByTestId('panel-catalog').inert).toBe(true);
  });

  it('renders StatusPanel with "MANTENTE EN EL MARCO" when state is AWAKENING or CALIBRATING', () => {
    const { rerender } = render(
      <StagePanel
        kioskState="AWAKENING"
        hasProfile={true}
        presence={'present' as PresenceState}
      />,
    );

    expect(screen.getByTestId('panel-status')).toBeTruthy();
    expect(screen.getByText('MANTENTE EN EL MARCO')).toBeTruthy();
    expect(screen.getByTestId('panel-catalog').inert).toBe(true);

    rerender(
      <StagePanel
        kioskState="CALIBRATING"
        hasProfile={true}
        presence={'present' as PresenceState}
      />,
    );

    expect(screen.getByTestId('panel-status')).toBeTruthy();
    expect(screen.getByText('MANTENTE EN EL MARCO')).toBeTruthy();
  });

  it('renders CapturePanel with active garment info when state is PHOTO_COUNTDOWN', () => {
    useGarmentStore.setState({
      activeGarmentId: 'test-1',
    });
    useSizingStore.setState({
      hasProfile: true,
      tallasElegidas: { 'SWF-HD-01': 'L' },
    });

    render(
      <StagePanel
        kioskState="PHOTO_COUNTDOWN"
        hasProfile={true}
        presence={'present' as PresenceState}
      />,
    );

    const capturePanel = screen.getByTestId('panel-capture');
    expect(capturePanel).toBeTruthy();
    expect(capturePanel.textContent).toContain('Swift Sport Hoodie');
    expect(capturePanel.textContent).toContain('TALLA: L');
    expect(screen.getByTestId('panel-catalog').inert).toBe(true);
  });

  it('renders visible CatalogPanel on any other state (e.g. TRYON) with inert=false', () => {
    render(
      <StagePanel
        kioskState="TRYON"
        hasProfile={true}
        presence={'present' as PresenceState}
      />,
    );

    const catalogEl = screen.getByTestId('panel-catalog');
    expect(catalogEl).toBeTruthy();
    expect(catalogEl.inert).toBe(false);
    expect(screen.queryByTestId('panel-onboarding')).toBeNull();
    expect(screen.queryByTestId('panel-status')).toBeNull();
    expect(screen.queryByTestId('panel-attract')).toBeNull();
    expect(screen.queryByTestId('panel-capture')).toBeNull();
  });
});
