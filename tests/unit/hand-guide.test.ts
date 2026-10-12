import { describe, it, expect } from 'vitest';
import {
  deriveHandGuide,
  deriveHandGuideEdgeType,
  type HandGuideCursorInput,
  type HandGuideLiveInput,
  type HandGuideRackInput,
} from '@/lib/hand-guide';

describe('deriveHandGuide - pure function state derivation', () => {
  const defaultCursor: HandGuideCursorInput = {
    active: false,
    activeHandSide: 'None',
    isStepDisarmed: false,
    confirmProgress: 0,
  };

  const defaultLive: HandGuideLiveInput = {
    isLiveActive: false,
    isLiveLoading: false,
    isLiveAvailable: true,
  };

  const defaultRack: HandGuideRackInput = {
    isInteractive: true,
    currentIndex: 2,
    itemCount: 6,
  };

  it('returns "raise" when no hand is raised', () => {
    const state = deriveHandGuide(
      { ...defaultCursor, active: false },
      defaultLive,
      defaultRack,
    );
    expect(state).toBe('raise');
  });

  it('returns "move-right" when right hand is active, armed, and can step right', () => {
    const state = deriveHandGuide(
      { ...defaultCursor, active: true, activeHandSide: 'Right' },
      defaultLive,
      { ...defaultRack, currentIndex: 2, itemCount: 6 },
    );
    expect(state).toBe('move-right');
  });

  it('returns "move-left" when left hand is active, armed, and can step left', () => {
    const state = deriveHandGuide(
      { ...defaultCursor, active: true, activeHandSide: 'Left' },
      defaultLive,
      { ...defaultRack, currentIndex: 2, itemCount: 6 },
    );
    expect(state).toBe('move-left');
  });

  it('returns "recenter" when hand just stepped and trigger is disarmed', () => {
    const state = deriveHandGuide(
      { ...defaultCursor, active: true, activeHandSide: 'Right', isStepDisarmed: true },
      defaultLive,
      defaultRack,
    );
    expect(state).toBe('recenter');
  });

  it('returns "edge" when right hand points at the last item of the rack', () => {
    const state = deriveHandGuide(
      { ...defaultCursor, active: true, activeHandSide: 'Right' },
      defaultLive,
      { ...defaultRack, currentIndex: 5, itemCount: 6 },
    );
    expect(state).toBe('edge');
    expect(
      deriveHandGuideEdgeType(
        { ...defaultCursor, active: true, activeHandSide: 'Right' },
        { ...defaultRack, currentIndex: 5, itemCount: 6 },
      ),
    ).toBe('last');
  });

  it('returns "edge" when left hand points at the first item of the rack', () => {
    const state = deriveHandGuide(
      { ...defaultCursor, active: true, activeHandSide: 'Left' },
      defaultLive,
      { ...defaultRack, currentIndex: 0, itemCount: 6 },
    );
    expect(state).toBe('edge');
    expect(
      deriveHandGuideEdgeType(
        { ...defaultCursor, active: true, activeHandSide: 'Left' },
        { ...defaultRack, currentIndex: 0, itemCount: 6 },
      ),
    ).toBe('first');
  });

  it('returns "index" when index finger is up and advancing confirmation (> 0)', () => {
    const state = deriveHandGuide(
      { ...defaultCursor, active: true, confirmProgress: 0.4 },
      defaultLive,
      defaultRack,
    );
    expect(state).toBe('index');
  });

  it('returns "live-loading" when live session is connecting', () => {
    const state = deriveHandGuide(
      { ...defaultCursor, active: true },
      { ...defaultLive, isLiveLoading: true },
      defaultRack,
    );
    expect(state).toBe('live-loading');
  });

  it('returns "live-active" when live session is active', () => {
    const state = deriveHandGuide(
      { ...defaultCursor, active: true },
      { ...defaultLive, isLiveActive: true },
      defaultRack,
    );
    expect(state).toBe('live-active');
  });

  it('returns "hidden" when rack is not interactive', () => {
    const state = deriveHandGuide(
      { ...defaultCursor, active: true, activeHandSide: 'Right' },
      defaultLive,
      { ...defaultRack, isInteractive: false },
    );
    expect(state).toBe('hidden');
  });
});

describe('deriveHandGuide - strict priority validation', () => {
  const allActiveCursor: HandGuideCursorInput = {
    active: true,
    activeHandSide: 'Right',
    isStepDisarmed: true,
    confirmProgress: 0.8,
  };

  it('priority 1: live-active overrides everything else (live-loading, hidden, index, etc.)', () => {
    const state = deriveHandGuide(
      allActiveCursor,
      { isLiveActive: true, isLiveLoading: true, isLiveAvailable: true },
      { isInteractive: false, currentIndex: 5, itemCount: 6 },
    );
    expect(state).toBe('live-active');
  });

  it('priority 2: live-loading overrides hidden, index, recenter, edge, move-*', () => {
    const state = deriveHandGuide(
      allActiveCursor,
      { isLiveActive: false, isLiveLoading: true, isLiveAvailable: true },
      { isInteractive: false, currentIndex: 5, itemCount: 6 },
    );
    expect(state).toBe('live-loading');
  });

  it('priority 3: hidden overrides index, recenter, edge, move-*', () => {
    const state = deriveHandGuide(
      allActiveCursor,
      { isLiveActive: false, isLiveLoading: false, isLiveAvailable: true },
      { isInteractive: false, currentIndex: 5, itemCount: 6 },
    );
    expect(state).toBe('hidden');
  });

  it('priority 4: index overrides recenter, edge, move-*', () => {
    const state = deriveHandGuide(
      {
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: true,
        confirmProgress: 0.5,
      },
      { isLiveActive: false, isLiveLoading: false },
      { isInteractive: true, currentIndex: 5, itemCount: 6 },
    );
    expect(state).toBe('index');
  });

  it('priority 5: recenter overrides edge, move-*', () => {
    const state = deriveHandGuide(
      {
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: true,
        confirmProgress: 0,
      },
      { isLiveActive: false, isLiveLoading: false },
      { isInteractive: true, currentIndex: 5, itemCount: 6 },
    );
    expect(state).toBe('recenter');
  });

  it('priority 6: edge overrides move-* when at boundary', () => {
    const state = deriveHandGuide(
      {
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: false,
        confirmProgress: 0,
      },
      { isLiveActive: false, isLiveLoading: false },
      { isInteractive: true, currentIndex: 5, itemCount: 6 },
    );
    expect(state).toBe('edge');
  });

  it('priority 7: move-* takes precedence when inside boundary', () => {
    const state = deriveHandGuide(
      {
        active: true,
        activeHandSide: 'Right',
        isStepDisarmed: false,
        confirmProgress: 0,
      },
      { isLiveActive: false, isLiveLoading: false },
      { isInteractive: true, currentIndex: 2, itemCount: 6 },
    );
    expect(state).toBe('move-right');
  });

  it('priority 8: raise is fallback when no hand is active', () => {
    const state = deriveHandGuide(
      {
        active: false,
        activeHandSide: 'Right',
        isStepDisarmed: false,
        confirmProgress: 0,
      },
      { isLiveActive: false, isLiveLoading: false },
      { isInteractive: true, currentIndex: 2, itemCount: 6 },
    );
    expect(state).toBe('raise');
  });
});
