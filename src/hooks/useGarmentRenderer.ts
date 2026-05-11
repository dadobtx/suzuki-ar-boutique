import { useEffect, useRef, useCallback, useState } from 'react';
import type { RefObject } from 'react';
import type { NormalizedLandmark } from '@/types/pose';
import type { Garment, GarmentAnchorsFile } from '@/types/garment';
import type { Point } from '@/lib/garment-warping';
import { warpGarment } from '@/lib/garment-warping';
import { computeCropOffset, videoToCss } from '@/lib/center-crop';
import { useGarmentStore } from '@/store/garment';

// ── Cache for loaded garment assets ──
interface CachedGarment {
  img: HTMLImageElement;
  anchors: GarmentAnchorsFile;
}

const garmentCache = new Map<string, CachedGarment>();
const loadingSkus = new Set<string>();

async function loadGarmentAssets(garment: Garment): Promise<CachedGarment> {
  const cached = garmentCache.get(garment.sku);
  if (cached) return cached;

  // Prevent duplicate loads
  if (loadingSkus.has(garment.sku)) {
    // Wait for existing load
    return new Promise((resolve) => {
      const check = setInterval(() => {
        const c = garmentCache.get(garment.sku);
        if (c) {
          clearInterval(check);
          resolve(c);
        }
      }, 50);
    });
  }

  loadingSkus.add(garment.sku);

  const base = import.meta.env.BASE_URL;

  // Load image and anchors in parallel
  const [img, anchorsData] = await Promise.all([
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = (e) => reject(new Error(`Failed to load garment image: ${e}`));
      image.src = `${base}garments/${garment.sku}.png`;
    }),
    fetch(`${base}garments/${garment.sku}.anchors.json`).then((r) => {
      if (!r.ok) throw new Error(`Failed to load anchors: ${r.statusText}`);
      return r.json() as Promise<GarmentAnchorsFile>;
    }),
  ]);

  const result: CachedGarment = { img, anchors: anchorsData };
  garmentCache.set(garment.sku, result);
  loadingSkus.delete(garment.sku);
  return result;
}

// ── Exported result type ──
export interface GarmentRendererResult {
  warpLatencyMs: number | null;
  validAnchors: number;
  totalAnchors: number;
  isLoading: boolean;
  error: string | null;
}

// ── Critical anchor IDs that must be present for rendering ──
const CRITICAL_ANCHORS = new Set(['shoulderL', 'shoulderR', 'hipL', 'hipR']);
const VISIBILITY_THRESHOLD = 0.3;
const MIN_CRITICAL = 3;

/**
 * Renders the active garment warped onto the user's body.
 * Uses requestVideoFrameCallback for frame-synced rendering.
 */
export function useGarmentRenderer(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  layout: 'landscape' | 'portrait',
  landmarks: NormalizedLandmark[] | null,
  mask: Uint8ClampedArray | null,
): GarmentRendererResult {
  const [warpLatencyMs, setWarpLatencyMs] = useState<number | null>(null);
  const [validAnchors, setValidAnchors] = useState(0);
  const [totalAnchors, setTotalAnchors] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cachedRef = useRef<CachedGarment | null>(null);
  const activeSkuRef = useRef<string | null>(null);
  const callbackIdRef = useRef(0);
  const activeRef = useRef(false);

  // Snapshot refs for frame callback (avoids stale closures)
  const landmarksRef = useRef(landmarks);
  landmarksRef.current = landmarks;
  const maskRef = useRef(mask);
  maskRef.current = mask;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Subscribe to store
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const catalog = useGarmentStore((s) => s.catalog);

  // Load garment assets when active garment changes
  const activeGarment = catalog.find((g) => g.id === activeGarmentId) ?? null;

  const loadAssets = useCallback(async () => {
    if (!activeGarment) {
      cachedRef.current = null;
      activeSkuRef.current = null;
      setIsLoading(false);
      setError(null);
      setValidAnchors(0);
      setTotalAnchors(0);
      setWarpLatencyMs(null);
      return;
    }

    if (activeSkuRef.current === activeGarment.sku && cachedRef.current) {
      return; // Already loaded
    }

    setIsLoading(true);
    setError(null);
    try {
      const assets = await loadGarmentAssets(activeGarment);
      cachedRef.current = assets;
      activeSkuRef.current = activeGarment.sku;
      setTotalAnchors(assets.anchors.anchors.length);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
      cachedRef.current = null;
    }
  }, [activeGarment]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // Frame rendering loop via requestVideoFrameCallback
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !('requestVideoFrameCallback' in video)) {
      return;
    }

    // Capture ref for cleanup (react-hooks/exhaustive-deps)
    const videoForCleanup = video;

    activeRef.current = true;

    const onFrame = () => {
      if (!activeRef.current) return;

      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c || v.videoWidth === 0 || v.videoHeight === 0) {
        if (v && activeRef.current) {
          callbackIdRef.current = v.requestVideoFrameCallback(onFrame);
        }
        return;
      }

      const ctx = c.getContext('2d');
      if (!ctx) {
        if (activeRef.current) {
          callbackIdRef.current = v.requestVideoFrameCallback(onFrame);
        }
        return;
      }

      // Clear
      const cssWidth = c.clientWidth;
      const cssHeight = c.clientHeight;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.restore();

      const cached = cachedRef.current;
      const lm = landmarksRef.current;

      if (!cached || !lm || lm.length === 0) {
        setValidAnchors(0);
        if (activeRef.current) {
          callbackIdRef.current = v.requestVideoFrameCallback(onFrame);
        }
        return;
      }

      const start = performance.now();

      const { videoWidth, videoHeight } = v;
      const anchorsData = cached.anchors;
      const crop = computeCropOffset(videoWidth, videoHeight, cssWidth, cssHeight);

      // a. Filter anchors by visibility
      const validAnchorsList: Array<{
        srcPt: Point;
        dstPt: Point;
        isCritical: boolean;
      }> = [];

      for (const anchor of anchorsData.anchors) {
        const landmark = lm[anchor.landmarkIndex];
        if (!landmark) continue;
        if ((landmark.visibility ?? 0) < VISIBILITY_THRESHOLD) continue;

        // Source point: pixel position in the overlay image
        const srcPt: Point = {
          x: anchor.overlayX,
          y: anchor.overlayY,
        };

        // Destination: landmark in video coords, then mapped to CSS
        const lmVideoX = (landmark.x + (anchor.offset?.x ?? 0)) * videoWidth;
        const lmVideoY = (landmark.y + (anchor.offset?.y ?? 0)) * videoHeight;

        let cssPt: { x: number; y: number };

        if (layoutRef.current === 'portrait') {
          cssPt = videoToCss(lmVideoX, lmVideoY, crop);
        } else {
          // Contain mapping (landscape)
          const drawW = videoWidth * crop.scale;
          const drawH = videoHeight * crop.scale;
          const drawX = (cssWidth - drawW) / 2;
          const drawY = (cssHeight - drawH) / 2;
          cssPt = {
            x: drawX + lmVideoX * crop.scale,
            y: drawY + lmVideoY * crop.scale,
          };
        }

        validAnchorsList.push({
          srcPt,
          dstPt: cssPt,
          isCritical: CRITICAL_ANCHORS.has(anchor.id),
        });
      }

      setValidAnchors(validAnchorsList.length);

      // b. Check minimum critical anchors
      const criticalCount = validAnchorsList.filter((a) => a.isCritical).length;
      if (criticalCount < MIN_CRITICAL) {
        if (activeRef.current) {
          callbackIdRef.current = v.requestVideoFrameCallback(onFrame);
        }
        return;
      }

      // c. Build anchor arrays
      const anchorsSrc = validAnchorsList.map((a) => a.srcPt);
      const anchorsDst = validAnchorsList.map((a) => a.dstPt);

      // e. Apply mirror via canvas transform
      ctx.save();
      ctx.translate(cssWidth, 0);
      ctx.scale(-1, 1);

      // f. Warp garment
      warpGarment(ctx, cached.img, anchorsSrc, anchorsDst);

      ctx.restore();

      // g. Mask compositing (if available)
      const currentMask = maskRef.current;
      if (currentMask && currentMask.length === videoWidth * videoHeight) {
        // Create offscreen mask canvas
        const offscreen = new OffscreenCanvas(videoWidth, videoHeight);
        const offCtx = offscreen.getContext('2d');
        if (offCtx) {
          const imgData = offCtx.createImageData(videoWidth, videoHeight);
          for (let i = 0; i < currentMask.length; i++) {
            const alpha = currentMask[i] ?? 0;
            const px = i * 4;
            imgData.data[px] = 255;
            imgData.data[px + 1] = 255;
            imgData.data[px + 2] = 255;
            // Mask is person=opaque(255-alpha from F3 inversion), background=transparent
            // We want: keep garment where person is → destination-in with person mask
            imgData.data[px + 3] = 255 - alpha;
          }
          offCtx.putImageData(imgData, 0, 0);

          // Apply mask using destination-in composite
          ctx.save();
          ctx.globalCompositeOperation = 'destination-in';

          // Mirror the mask too
          ctx.translate(cssWidth, 0);
          ctx.scale(-1, 1);

          if (layoutRef.current === 'portrait') {
            ctx.drawImage(
              offscreen,
              crop.cropX,
              0,
              crop.visibleWidth,
              videoHeight,
              0,
              0,
              cssWidth,
              cssHeight,
            );
          } else {
            const drawW = videoWidth * crop.scale;
            const drawH = videoHeight * crop.scale;
            const drawX = (cssWidth - drawW) / 2;
            const drawY = (cssHeight - drawH) / 2;
            ctx.drawImage(offscreen, drawX, drawY, drawW, drawH);
          }

          ctx.restore();
        }
      }

      // h. Measure latency
      const elapsed = performance.now() - start;
      setWarpLatencyMs(Math.round(elapsed * 100) / 100);

      if (activeRef.current) {
        callbackIdRef.current = v.requestVideoFrameCallback(onFrame);
      }
    };

    callbackIdRef.current = video.requestVideoFrameCallback(onFrame);

    return () => {
      activeRef.current = false;
      if (callbackIdRef.current && videoForCleanup) {
        videoForCleanup.cancelVideoFrameCallback(callbackIdRef.current);
      }
    };
  }, [videoRef, canvasRef]);

  return {
    warpLatencyMs,
    validAnchors,
    totalAnchors,
    isLoading,
    error,
  };
}
