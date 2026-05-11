import { useRef } from 'react';
import type { RefObject } from 'react';
import type { NormalizedLandmark } from '@/types/pose';
import { useDprCanvas } from '@/hooks/useDprCanvas';
import { useGarmentRenderer } from '@/hooks/useGarmentRenderer';
import type { GarmentRendererResult } from '@/hooks/useGarmentRenderer';

interface GarmentOverlayProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  containerRef: RefObject<HTMLElement | null>;
  landmarks: NormalizedLandmark[] | null;
  mask: Uint8ClampedArray | null;
  layout: 'landscape' | 'portrait';
  /** Only render when camera is granted and user is present */
  active: boolean;
}

/**
 * Overlay canvas that renders the warped garment on top of the user.
 *
 * Z-order: video < garment < skeleton-debug < HUD
 * Uses its own canvas separate from PoseDebug.
 */
export function GarmentOverlay({
  videoRef,
  containerRef,
  landmarks,
  mask,
  layout,
  active,
}: GarmentOverlayProps): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // DPR-aware sizing for this canvas
  useDprCanvas(canvasRef, containerRef);

  // Garment rendering hook
  const renderer: GarmentRendererResult = useGarmentRenderer(
    videoRef,
    active ? canvasRef : { current: null }, // disable rendering when not active
    layout,
    active ? landmarks : null,
    active ? mask : null,
  );

  // Expose renderer result via data attributes for DiagPage consumption
  // (DiagPage reads from the store, not from here)

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }} // Between video (0) and skeleton debug (20)
      aria-label="Garment overlay"
      data-warp-latency={renderer.warpLatencyMs}
      data-valid-anchors={renderer.validAnchors}
      data-total-anchors={renderer.totalAnchors}
    />
  );
}

// Re-export the result type for consumers
export type { GarmentRendererResult };
