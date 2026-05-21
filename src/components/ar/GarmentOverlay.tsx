import { useEffect, useRef } from 'react';
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

  // When the overlay goes inactive (e.g. kiosk transitions out of TRYON into
  // PHOTO_COUNTDOWN), the renderer stops drawing — but the canvas keeps the
  // last frame painted. If the user was leaning forward to tap the photo
  // button, that last frame is a heavily distorted warp that then "freezes"
  // over the user during the 3-2-1 countdown. Clear the canvas on the way out
  // so they get a clean view of themselves during countdown.
  useEffect(() => {
    if (!active && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, [active]);

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
      style={{
        zIndex: 10, // Between video (0) and skeleton debug (20)
        // 0.5px Gaussian softens visible Delaunay triangle seams along sleeves
        // and shoulders without making the garment look blurry overall.
        filter: 'blur(0.5px)',
        // Hide immediately when inactive. The clearRect in the useEffect above
        // handles freeing the pixel buffer, but due to a race with pending
        // requestVideoFrameCallback frames it can briefly flash the last
        // distorted warp. visibility:hidden is synchronous and deterministic.
        visibility: active ? 'visible' : 'hidden',
      }}
      aria-label="Garment overlay"
      data-warp-latency={renderer.warpLatencyMs}
      data-valid-anchors={renderer.validAnchors}
      data-total-anchors={renderer.totalAnchors}
    />
  );
}

// Re-export the result type for consumers
export type { GarmentRendererResult };
