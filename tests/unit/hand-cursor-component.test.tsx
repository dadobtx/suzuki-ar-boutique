// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HandCursor } from '@/components/hand/HandCursor';
import { useHandCursorStore } from '@/store/handCursor';
import { useLiveTryonStore } from '@/store/liveTryon';
import { useGarmentStore } from '@/store/garment';
import { useKioskStore } from '@/store/kiosk';
import { useSizingStore } from '@/store/sizing';
import { useSelectionUiStore } from '@/store/selectionUi';
import { useLayoutStore } from '@/store/layout';

describe('HandCursor component - synchronized guide and directional arrows', () => {
  beforeEach(() => {
    useSelectionUiStore.setState({ ui: 'perchero', source: 'manual' });
    useLayoutStore.setState({ mode: 'portrait', source: 'manual' });
    useKioskStore.setState({ state: 'TRYON' });
    useSizingStore.setState({ hasProfile: true });
    useGarmentStore.setState({
      catalog: [
        { id: '1', sku: 'SKU1', name: 'Item 1', category: 'top' },
        { id: '2', sku: 'SKU2', name: 'Item 2', category: 'top' },
        { id: '3', sku: 'SKU3', name: 'Item 3', category: 'top' },
      ] as any,
    });
    useLiveTryonStore.setState({
      isLiveActive: false,
      isLiveLoading: false,
      isLiveAvailable: true,
    });
    useHandCursorStore.getState().reset();
  });

  it('renders nothing when cursor is not active', () => {
    useHandCursorStore.setState({
      cursor: { ...useHandCursorStore.getState().cursor, active: false },
    });
    const { container } = render(<HandCursor />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when live-loading or live-active or hidden', () => {
    useHandCursorStore.setState({
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Right',
      },
    });

    useLiveTryonStore.setState({ isLiveLoading: true });
    const { rerender } = render(<HandCursor />);
    expect(screen.queryByTestId('hand-cursor')).toBeNull();

    useLiveTryonStore.setState({ isLiveLoading: false, isLiveActive: true });
    rerender(<HandCursor />);
    expect(screen.queryByTestId('hand-cursor')).toBeNull();
  });

  it('renders right arrow on "move-right" (Right hand active at item 0 of 3)', () => {
    useHandCursorStore.setState({
      rackFocusIndex: 0,
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: false,
        confirmProgress: 0,
      },
    });

    render(<HandCursor />);
    expect(screen.getByTestId('hand-cursor')).toBeTruthy();
    expect(screen.getByTestId('cursor-arrow-right')).toBeTruthy();
    expect(screen.queryByTestId('cursor-arrow-left')).toBeNull();
  });

  it('renders left arrow on "move-left" (Left hand active at item 2 of 3)', () => {
    useHandCursorStore.setState({
      rackFocusIndex: 2,
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Left',
        isStepDisarmed: false,
        confirmProgress: 0,
      },
    });

    render(<HandCursor />);
    expect(screen.getByTestId('cursor-arrow-left')).toBeTruthy();
    expect(screen.queryByTestId('cursor-arrow-right')).toBeNull();
  });

  it('renders dimmed arrow (opacity-30) without animation on "edge"', () => {
    useHandCursorStore.setState({
      rackFocusIndex: 2, // last item of 3
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: false,
        confirmProgress: 0,
      },
    });

    render(<HandCursor />);
    const arrow = screen.getByTestId('cursor-arrow-right');
    expect(arrow.className).toContain('opacity-30');
    expect(arrow.className).not.toContain('animate-hand-arrow-right');
  });

  it('renders recenter dot and no arrows on "recenter"', () => {
    useHandCursorStore.setState({
      rackFocusIndex: 1,
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: true,
        confirmProgress: 0,
      },
    });

    render(<HandCursor />);
    expect(screen.getByTestId('cursor-rearm-dot')).toBeTruthy();
    expect(screen.queryByTestId('cursor-arrow-right')).toBeNull();
    expect(screen.queryByTestId('cursor-arrow-left')).toBeNull();
  });

  it('renders progress ring and no arrows on "index"', () => {
    useHandCursorStore.setState({
      rackFocusIndex: 1,
      cursor: {
        ...useHandCursorStore.getState().cursor,
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: false,
        confirmProgress: 0.5,
      },
    });

    render(<HandCursor />);
    expect(screen.getByTestId('cursor-progress-ring')).toBeTruthy();
    expect(screen.queryByTestId('cursor-arrow-right')).toBeNull();
    expect(screen.queryByTestId('cursor-arrow-left')).toBeNull();
  });
});
