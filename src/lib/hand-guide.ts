import { useHandCursorStore } from '@/store/handCursor';
import { useLiveTryonStore } from '@/store/liveTryon';
import { useGarmentStore } from '@/store/garment';
import { useKioskStore } from '@/store/kiosk';
import { useSizingStore } from '@/store/sizing';
import { useSelectionUi } from '@/hooks/useSelectionUi';
import type { HandednessSide } from './hand-cursor';

export type HandGuideState =
  | 'raise'
  | 'move-right'
  | 'move-left'
  | 'recenter'
  | 'edge'
  | 'index'
  | 'live-loading'
  | 'live-active'
  | 'hidden';

export type HandGuideEdgeType = 'first' | 'last' | null;

export interface HandGuideCursorInput {
  active: boolean;
  activeHandSide?: HandednessSide;
  isStepDisarmed?: boolean;
  confirmProgress?: number;
}

export interface HandGuideLiveInput {
  isLiveAvailable?: boolean;
  isLiveLoading?: boolean;
  isLiveActive?: boolean;
}

export interface HandGuideRackInput {
  isInteractive?: boolean;
  currentIndex?: number | null;
  itemCount?: number;
}

/**
 * Pure function that derives the single source of truth for the hand guide state.
 *
 * Strict Priority:
 * live-active > live-loading > hidden > index > recenter > edge > move-* > raise
 */
export function deriveHandGuide(
  cursor: HandGuideCursorInput,
  live: HandGuideLiveInput,
  rack: HandGuideRackInput,
): HandGuideState {
  // 1. live-active
  if (live.isLiveActive) {
    return 'live-active';
  }

  // 2. live-loading
  if (live.isLiveLoading) {
    return 'live-loading';
  }

  // 3. hidden (perchero no interactivo o aviso de cuerpo activo)
  if (rack.isInteractive === false) {
    return 'hidden';
  }

  // 4. index (índice levantado con confirmProgress > 0)
  if (cursor.active && (cursor.confirmProgress ?? 0) > 0) {
    return 'index';
  }

  // 5. recenter (acaba de dar un paso: disparador desarmado esperando volver al centro)
  if (cursor.active && cursor.isStepDisarmed) {
    return 'recenter';
  }

  // 6. edge (mano activa armada apuntando a un extremo del perchero)
  const idx = rack.currentIndex ?? 0;
  const count = rack.itemCount ?? 0;

  if (cursor.active) {
    if (cursor.activeHandSide === 'Right' && count > 0 && idx >= count - 1) {
      return 'edge';
    }
    if (cursor.activeHandSide === 'Left' && count > 0 && idx <= 0) {
      return 'edge';
    }

    // 7. move-* (mano activa armada con prendas disponibles en esa dirección)
    if (cursor.activeHandSide === 'Right') {
      return 'move-right';
    }
    if (cursor.activeHandSide === 'Left') {
      return 'move-left';
    }
  }

  // 8. raise (sin mano levantada o mano activa sin lado identificado)
  return 'raise';
}

/**
 * Helper to determine which edge the user is facing when state === 'edge'.
 */
export function deriveHandGuideEdgeType(
  cursor: HandGuideCursorInput,
  rack: HandGuideRackInput,
): HandGuideEdgeType {
  const idx = rack.currentIndex ?? 0;
  const count = rack.itemCount ?? 0;
  if (cursor.active && cursor.activeHandSide === 'Left' && count > 0 && idx <= 0) {
    return 'first';
  }
  if (
    cursor.active &&
    cursor.activeHandSide === 'Right' &&
    count > 0 &&
    idx >= count - 1
  ) {
    return 'last';
  }
  return null;
}

export interface UseHandGuideOptions {
  isInteractive?: boolean;
  showLiveButton?: boolean;
}

export interface HandGuideResult {
  state: HandGuideState;
  edgeType: HandGuideEdgeType;
  isLiveAvailable: boolean;
  confirmProgress: number;
}

/**
 * React hook to consume the synchronized hand guide state across KioskGuide and HandCursor.
 */
export function useHandGuide(options?: UseHandGuideOptions): HandGuideResult {
  const cursor = useHandCursorStore((s) => s.cursor);
  const rackFocusIndex = useHandCursorStore((s) => s.rackFocusIndex);
  const isBusy = useHandCursorStore((s) => s.isBusy);

  const catalog = useGarmentStore((s) => s.catalog);
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const kioskState = useKioskStore((s) => s.state);
  const hasProfile = useSizingStore((s) => s.hasProfile);
  const { effectiveSelectionUi } = useSelectionUi();

  const isLiveActive = useLiveTryonStore((s) => s.isLiveActive);
  const isLiveLoading = useLiveTryonStore((s) => s.isLiveLoading);
  const isLiveAvailable = useLiveTryonStore((s) => s.isLiveAvailable);

  const isInteractive =
    options?.isInteractive ??
    (effectiveSelectionUi === 'perchero' &&
      (kioskState === 'TRYON' || (kioskState === 'ATTRACT' && hasProfile)) &&
      !isBusy);

  const currentIndex =
    rackFocusIndex !== null
      ? rackFocusIndex
      : Math.max(
          0,
          catalog.findIndex((g) => g.id === activeGarmentId),
        );

  const state = deriveHandGuide(
    cursor,
    {
      isLiveActive,
      isLiveLoading,
      isLiveAvailable,
    },
    {
      isInteractive,
      currentIndex,
      itemCount: catalog.length,
    },
  );

  const edgeType = deriveHandGuideEdgeType(cursor, {
    currentIndex,
    itemCount: catalog.length,
  });

  return {
    state,
    edgeType,
    isLiveAvailable: Boolean(options?.showLiveButton ?? isLiveAvailable),
    confirmProgress: cursor.confirmProgress ?? 0,
  };
}
