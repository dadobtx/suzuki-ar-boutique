import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { RefObject } from 'react';
import type { NormalizedLandmark } from '@/types/pose';
import type { GarmentAnchorsFile } from '@/types/garment';
import type { Point } from '@/lib/garment-warping';
import { warpGarment, computeAffineTransform } from '@/lib/garment-warping';
import {
  computeCropOffset,
  videoToCss,
  computeContainOffset,
  videoToCssContain,
} from '@/lib/center-crop';
import { useGarmentStore } from '@/store/garment';
import { resolveGarmentAssets } from '@/lib/garment-assets';
import { resolveGarmentIllustration } from '@/lib/garment-illustration';
import { OneEuroFilter } from '@/lib/one-euro-filter';
import type { PresenceState } from '@/hooks/usePresence';
import {
  computeSimilarityTransform,
  computeHeadExclusion,
  renderHeadExclusion,
  HEAD_VISIBILITY_THRESHOLD,
} from '@/lib/illustration-transform';
import type { SimilarityTransform, HeadExclusion } from '@/lib/illustration-transform';

// ── Cache for loaded garment assets ──
interface CachedGarment {
  img: HTMLImageElement;
  anchors: GarmentAnchorsFile;
}

interface LoadGarmentAssetsParams {
  key: string;
  overlayUrl: string;
  anchorsUrl: string;
}

const garmentCache = new Map<string, CachedGarment>();
const loadingKeys = new Set<string>();

async function loadGarmentAssets(
  params: LoadGarmentAssetsParams,
): Promise<CachedGarment> {
  const { key, overlayUrl, anchorsUrl } = params;
  const cached = garmentCache.get(key);
  if (cached) return cached;

  // Prevent duplicate loads
  if (loadingKeys.has(key)) {
    // Wait for existing load
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        const c = garmentCache.get(key);
        if (c) {
          clearInterval(check);
          resolve(c);
          return;
        }
        // La otra carga terminó y no dejó nada en caché => falló. Sin esta
        // salida, un 404 deja a quien espera en un polling infinito que no
        // resuelve ni rechaza, y la prenda se queda "cargando" para siempre.
        if (!loadingKeys.has(key)) {
          clearInterval(check);
          reject(new Error(`Failed to load garment assets: ${key}`));
        }
      }, 50);
    });
  }

  loadingKeys.add(key);

  const base = import.meta.env.BASE_URL;

  try {
    // Load image and anchors in parallel
    const [img, anchorsData] = await Promise.all([
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = (e) => reject(new Error(`Failed to load garment image: ${e}`));
        image.src = `${base}${overlayUrl.replace(/^\//, '')}`;
      }),
      fetch(`${base}${anchorsUrl.replace(/^\//, '')}`).then((r) => {
        if (!r.ok) throw new Error(`Failed to load anchors: ${r.statusText}`);
        return r.json() as Promise<GarmentAnchorsFile>;
      }),
    ]);

    const result: CachedGarment = { img, anchors: anchorsData };
    garmentCache.set(key, result);
    return result;
  } finally {
    // La key sale de loadingKeys SIEMPRE, también cuando la carga falla:
    // si se queda adentro, cualquier intento posterior con esa misma prenda
    // o cara entra al polling de arriba y nunca sale.
    loadingKeys.delete(key);
  }
}

// ── Exported result type ──
export interface GarmentRendererResult {
  warpLatencyMs: number | null;
  validAnchors: number;
  totalAnchors: number;
  isLoading: boolean;
  error: string | null;
  isIllustration: boolean;
}

// ── Critical anchor IDs that must be present for rendering ──
const CRITICAL_ANCHORS = new Set(['shoulderL', 'shoulderR', 'hipL', 'hipR']);
const VISIBILITY_THRESHOLD = 0.3;

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
  presence?: PresenceState,
): GarmentRendererResult {
  const [warpLatencyMs, setWarpLatencyMs] = useState<number | null>(null);
  const [validAnchors, setValidAnchors] = useState(0);
  const [totalAnchors, setTotalAnchors] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cachedRef = useRef<CachedGarment | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const callbackIdRef = useRef(0);
  const activeRef = useRef(false);

  // FIX 2: Rolling visibility buffer (5 frames) per landmark index
  const visibilityBufferRef = useRef<Map<number, number[]>>(new Map());

  // Illustration state, filters and tracking refs
  const illustLoadedAtRef = useRef<number>(0);
  const isIllustrationRef = useRef<boolean>(false);
  const lostTrackingSinceRef = useRef<number | null>(null);
  const lastValidAnchorsDstRef = useRef<Point[] | null>(null);
  const lastValidAnchorsSrcRef = useRef<Point[] | null>(null);
  const referenceScaleRef = useRef<number | null>(null);
  const lastValidTransformRef = useRef<SimilarityTransform | null>(null);
  const lastValidMsRef = useRef<Point | null>(null);
  const lastValidHeadExclusionRef = useRef<HeadExclusion | null>(null);

  const shoulderMidXFilter = useRef(new OneEuroFilter({ fcmin: 1.5, beta: 0.01 }));
  const shoulderMidYFilter = useRef(new OneEuroFilter({ fcmin: 1.5, beta: 0.01 }));
  const shoulderWidthFilter = useRef(new OneEuroFilter({ fcmin: 1.5, beta: 0.01 }));
  const shoulderToEarRatioRef = useRef<number | null>(null);
  const lastTrackingLostSustainedRef = useRef<boolean>(false);

  // Reset when user is absent
  useEffect(() => {
    if (presence === 'absent') {
      visibilityBufferRef.current.clear();
      lostTrackingSinceRef.current = null;
      illustLoadedAtRef.current = 0;
      lastValidAnchorsDstRef.current = null;
      lastValidAnchorsSrcRef.current = null;
      referenceScaleRef.current = null;
      shoulderToEarRatioRef.current = null;
      lastValidTransformRef.current = null;
      lastValidMsRef.current = null;
      lastValidHeadExclusionRef.current = null;
      shoulderMidXFilter.current.reset();
      shoulderMidYFilter.current.reset();
      shoulderWidthFilter.current.reset();
      lastTrackingLostSustainedRef.current = false;
      useGarmentStore.getState().setRuntime(null, 0, 0, 0, false);
    }
  }, [presence]);

  function smoothedVisibility(landmarkIndex: number, current: number): number {
    let buf = visibilityBufferRef.current.get(landmarkIndex);
    if (!buf) {
      buf = [];
      visibilityBufferRef.current.set(landmarkIndex, buf);
    }
    buf.push(current);
    if (buf.length > 5) buf.shift();
    return buf.reduce((a, b) => a + b, 0) / buf.length;
  }

  // Snapshot refs for frame callback (avoids stale closures)
  const landmarksRef = useRef(landmarks);
  landmarksRef.current = landmarks;
  const maskRef = useRef(mask);
  maskRef.current = mask;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Subscribe to store
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const activeVariantId = useGarmentStore((s) => s.activeVariantId);
  const catalog = useGarmentStore((s) => s.catalog);

  // Load garment assets or illustration when active garment or active variant changes
  const activeGarment = catalog.find((g) => g.id === activeGarmentId) ?? null;
  const assets = useMemo(
    () => (activeGarment ? resolveGarmentAssets(activeGarment, activeVariantId) : null),
    [activeGarment, activeVariantId],
  );
  const illustration = useMemo(() => {
    const isRecortablesEnabled = import.meta.env.VITE_AR_RECORTABLES === 'on';
    return isRecortablesEnabled && activeGarment
      ? resolveGarmentIllustration(activeGarment, activeVariantId)
      : null;
  }, [activeGarment, activeVariantId]);

  const targetAsset = useMemo(() => {
    if (illustration) {
      return {
        key: illustration.key,
        overlayUrl: illustration.illustrationUrl,
        anchorsUrl: illustration.illustrationAnchorsUrl,
        isIllustration: true,
      };
    }
    if (assets) {
      return {
        key: assets.key,
        overlayUrl: assets.overlayUrl,
        anchorsUrl: assets.anchorsUrl,
        isIllustration: false,
      };
    }
    return null;
  }, [illustration, assets]);

  const loadAssets = useCallback(async () => {
    if (!targetAsset) {
      cachedRef.current = null;
      activeKeyRef.current = null;
      isIllustrationRef.current = false;
      setIsLoading(false);
      setError(null);
      setValidAnchors(0);
      setTotalAnchors(0);
      setWarpLatencyMs(null);
      return;
    }

    if (activeKeyRef.current === targetAsset.key && cachedRef.current) {
      return; // Already loaded
    }

    setIsLoading(true);
    setError(null);
    try {
      const loaded = await loadGarmentAssets({
        key: targetAsset.key,
        overlayUrl: targetAsset.overlayUrl,
        anchorsUrl: targetAsset.anchorsUrl,
      });
      cachedRef.current = loaded;
      activeKeyRef.current = targetAsset.key;
      isIllustrationRef.current = targetAsset.isIllustration;
      if (targetAsset.isIllustration) {
        illustLoadedAtRef.current = performance.now();
      }
      setTotalAnchors(loaded.anchors.anchors.length);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
      cachedRef.current = null;
    }
  }, [targetAsset]);

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

      // FIX 1: Compute contain fit for landscape
      const containFit = computeContainOffset(
        videoWidth,
        videoHeight,
        cssWidth,
        cssHeight,
      );

      // Store updates (throttled to 10Hz, but immediate on tracking status change)
      const updateStore = (
        latency: number | null,
        valid: number,
        estimated: number,
        trackingLostSustained: boolean,
      ) => {
        const statusChanged =
          trackingLostSustained !== lastTrackingLostSustainedRef.current;
        const timeNow = performance.now();
        if (statusChanged || timeNow % 100 < 16) {
          lastTrackingLostSustainedRef.current = trackingLostSustained;
          useGarmentStore
            .getState()
            .setRuntime(
              latency,
              valid,
              cached.anchors.anchors.length,
              estimated,
              trackingLostSustained,
            );
        }
      };

      // ── BIFURCACIÓN: MODO ILUSTRACIÓN (RECORTABLES) ──
      // Similitud rígida (traslación, rotación acotada a ±15°, escala uniforme) + exclusión facial.
      // Sin deformación por caderas, sin máscara de persona (destination-in), sin blur.
      if (isIllustrationRef.current) {
        const anchorL = anchorsData.anchors.find((a) => a.id === 'shoulderL');
        const anchorR = anchorsData.anchors.find((a) => a.id === 'shoulderR');

        const vis11 = smoothedVisibility(11, lm[11]?.visibility ?? 0);
        const vis12 = smoothedVisibility(12, lm[12]?.visibility ?? 0);
        const vis7 = smoothedVisibility(7, lm[7]?.visibility ?? 0);
        const vis8 = smoothedVisibility(8, lm[8]?.visibility ?? 0);
        const vis15 = smoothedVisibility(15, lm[15]?.visibility ?? 0);
        const vis16 = smoothedVisibility(16, lm[16]?.visibility ?? 0);

        const hasShoulders = Boolean(
          anchorL &&
            anchorR &&
            lm[11] &&
            lm[12] &&
            vis11 >= VISIBILITY_THRESHOLD &&
            vis12 >= VISIBILITY_THRESHOLD,
        );

        const areEarsReliable = Boolean(
          lm[7] &&
            lm[8] &&
            vis7 >= HEAD_VISIBILITY_THRESHOLD &&
            vis8 >= HEAD_VISIBILITY_THRESHOLD,
        );

        const yShoulder = lm[11] && lm[12] ? (lm[11].y + lm[12].y) / 2 : 0;

        // Helper para proyectar coordenadas de video a coordenadas de pantalla (espejadas a mano)
        const mapToScreen = (normX: number, normY: number, offX = 0, offY = 0) => {
          const vx = (normX + offX) * videoWidth;
          const vy = (normY + offY) * videoHeight;
          const css =
            layoutRef.current === 'portrait'
              ? videoToCss(vx, vy, crop)
              : videoToCssContain(vx, vy, containFit);
          return { x: cssWidth - css.x, y: css.y };
        };

        // Zona de exclusión de cabeza estimada a partir de orejas en pantalla
        let headExclusion: HeadExclusion | null = null;
        let dEar = 0;
        if (lm[7] && lm[8]) {
          const screenEar7 = {
            ...mapToScreen(lm[7].x, lm[7].y),
            visibility: vis7,
          };
          const screenEar8 = {
            ...mapToScreen(lm[8].x, lm[8].y),
            visibility: vis8,
          };
          dEar = Math.hypot(screenEar8.x - screenEar7.x, screenEar8.y - screenEar7.y);
          headExclusion = computeHeadExclusion(
            { 7: screenEar7, 8: screenEar8 },
            anchorsData.headExclusion,
            HEAD_VISIBILITY_THRESHOLD,
          );
        }

        // Fundido de proximidad por distancia entre orejas
        let proximityAlpha = 1.0;
        if (lm[7] && lm[8]) {
          const exDx = (lm[7].x - lm[8].x) * videoWidth;
          const exDy = (lm[7].y - lm[8].y) * videoHeight;
          const earDistNormalized =
            Math.hypot(exDx, exDy) / Math.max(videoWidth, videoHeight);
          const FADE_START = 0.1;
          const FADE_END = 0.16;
          if (earDistNormalized > FADE_START) {
            const t = Math.min(
              1,
              (earDistNormalized - FADE_START) / (FADE_END - FADE_START),
            );
            proximityAlpha = 1 - t;
          }
        }

        // Tracking válido: para prendas sin exclusión facial (enabled: false) no se exige cabeza;
        // para prendas con capucha/cuello alto se exige elipse de exclusión válida.
        const isHeadValid =
          anchorsData.headExclusion?.enabled === false ? true : Boolean(headExclusion);

        const isTrackingValid = Boolean(
          hasShoulders && isHeadValid && proximityAlpha > 0,
        );

        if (!isTrackingValid || !anchorL || !anchorR || !lm[11] || !lm[12]) {
          const now = performance.now();
          if (lostTrackingSinceRef.current === null) {
            lostTrackingSinceRef.current = now;
          }
          const lostElapsed = now - lostTrackingSinceRef.current;
          const SUSTAINED_THRESHOLD_MS = 330;
          const FADE_DURATION_MS = 200;
          const sustained = lostElapsed >= SUSTAINED_THRESHOLD_MS;

          setValidAnchors(hasShoulders ? 2 : 0);
          updateStore(null, hasShoulders ? 2 : 0, 0, sustained);

          // NOTA: referenceScale y shoulderToEarRatio no se resetean aquí; son proporciones
          // anatómicas de la persona y su reset se gestiona únicamente en presence === 'absent'.

          if (lastValidTransformRef.current && lastValidMsRef.current) {
            let opacity = 1.0;
            if (sustained) {
              const fadeElapsed = lostElapsed - SUSTAINED_THRESHOLD_MS;
              opacity = Math.max(0, 1 - fadeElapsed / FADE_DURATION_MS);
            }
            opacity *= proximityAlpha;

            if (opacity > 0) {
              const t = lastValidTransformRef.current;
              const ms = lastValidMsRef.current;
              ctx.save();
              ctx.globalAlpha = opacity;
              ctx.translate(t.tx, t.ty);
              ctx.rotate(t.rotation);
              ctx.scale(t.scale, t.scale);
              ctx.drawImage(cached.img, -ms.x, -ms.y);
              ctx.restore();

              if (lastValidHeadExclusionRef.current) {
                renderHeadExclusion(ctx, lastValidHeadExclusionRef.current);
              }
            }
          }

          if (activeRef.current) {
            callbackIdRef.current = v.requestVideoFrameCallback(onFrame);
          }
          return;
        }

        // Tracking activo
        lostTrackingSinceRef.current = null;

        const screen11 = mapToScreen(
          lm[11].x,
          lm[11].y,
          anchorR.offset?.x ?? 0,
          anchorR.offset?.y ?? 0,
        );
        const screen12 = mapToScreen(
          lm[12].x,
          lm[12].y,
          anchorL.offset?.x ?? 0,
          anchorL.offset?.y ?? 0,
        );

        // En pantalla, dstShoulderL es el que aparece a la izquierda (menor x)
        // y dstShoulderR es el que aparece a la derecha (mayor x)
        const dstL = screen11.x <= screen12.x ? screen11 : screen12;
        const dstR = screen11.x <= screen12.x ? screen12 : screen11;

        // Suavizado de posición y ancho con OneEuroFilter
        const rawMidX = (dstL.x + dstR.x) / 2;
        const rawMidY = (dstL.y + dstR.y) / 2;
        const rawDx = dstR.x - dstL.x;
        const rawDy = dstR.y - dstL.y;
        const rawWidth = Math.hypot(rawDx, rawDy);
        const rawAngle = Math.atan2(rawDy, rawDx);

        const Ds = Math.hypot(
          anchorR.overlayX - anchorL.overlayX,
          anchorR.overlayY - anchorL.overlayY,
        );

        let isPostureReliable = false;

        if (shoulderToEarRatioRef.current === null) {
          // Aprendizaje inicial de k: exige ver ambas muñecas por debajo de los hombros
          const hasWristsBelow = Boolean(
            lm[15] &&
              lm[16] &&
              vis15 >= VISIBILITY_THRESHOLD &&
              vis16 >= VISIBILITY_THRESHOLD &&
              lm[15].y > yShoulder &&
              lm[16].y > yShoulder,
          );
          if (hasShoulders && hasWristsBelow && areEarsReliable && dEar > 0) {
            shoulderToEarRatioRef.current = rawWidth / dEar;
            isPostureReliable = true;
          }
        } else {
          // Una vez aprendido k: evaluación anatómica independiente de las muñecas
          const k = shoulderToEarRatioRef.current;
          if (areEarsReliable && dEar > 0) {
            const currentRatio = rawWidth / dEar;
            const ratioDev = Math.abs(currentRatio - k) / k;
            if (ratioDev <= 0.15) {
              isPostureReliable = true;
              shoulderToEarRatioRef.current = k * 0.95 + currentRatio * 0.05;
            } else {
              // |rawWidth/dEar - k| / k > 0.15: hombros no fiables (ej. brazos en alto o torso de perfil)
              isPostureReliable = false;
            }
          } else {
            // Orejas no fiables (cabeza girada, gorra, etc.): no se puede verificar con dEar
            isPostureReliable = false;
          }
        }

        let effectiveWidth = rawWidth;

        if (isPostureReliable) {
          effectiveWidth = rawWidth;
        } else {
          // Postura no fiable (brazos arriba, torso girado o postura no contrastable)
          if (areEarsReliable && dEar > 0 && shoulderToEarRatioRef.current !== null) {
            effectiveWidth = shoulderToEarRatioRef.current * dEar;
          } else if (referenceScaleRef.current !== null && Ds > 0) {
            effectiveWidth = referenceScaleRef.current * Ds;
          } else {
            effectiveWidth = rawWidth;
          }
        }

        const tNow = performance.now();
        const fMidX = shoulderMidXFilter.current.filter(rawMidX, tNow);
        const fMidY = shoulderMidYFilter.current.filter(rawMidY, tNow);
        const fWidth = shoulderWidthFilter.current.filter(effectiveWidth, tNow);

        const halfW = fWidth / 2;
        const hx = Math.cos(rawAngle) * halfW;
        const hy = Math.sin(rawAngle) * halfW;

        const smoothedDstShoulderL = { x: fMidX - hx, y: fMidY - hy };
        const smoothedDstShoulderR = { x: fMidX + hx, y: fMidY + hy };

        const transform = computeSimilarityTransform({
          srcShoulderL: { x: anchorL.overlayX, y: anchorL.overlayY },
          srcShoulderR: { x: anchorR.overlayX, y: anchorR.overlayY },
          dstShoulderL: smoothedDstShoulderL,
          dstShoulderR: smoothedDstShoulderR,
          referenceScale: referenceScaleRef.current,
          fitFactor: 1.0,
        });

        // Actualizar referenceScale ÚNICAMENTE mientras la postura sea fiable
        if (isPostureReliable) {
          const currentRawScale = Ds > 0 ? fWidth / Ds : 1.0;
          if (referenceScaleRef.current === null) {
            referenceScaleRef.current = currentRawScale;
          } else {
            referenceScaleRef.current =
              referenceScaleRef.current * 0.98 + currentRawScale * 0.02;
          }
        }

        // Rebote de colocación aplicado sobre scale
        let finalScale = transform.scale;
        if (illustLoadedAtRef.current > 0) {
          const elapsed = performance.now() - illustLoadedAtRef.current;
          const BOUNCE_DURATION_MS = 350;
          const prefersReducedMotion =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

          if (!prefersReducedMotion && elapsed < BOUNCE_DURATION_MS) {
            const t = elapsed / BOUNCE_DURATION_MS;
            const bounceFactor =
              1.0 - 0.1 * Math.cos(t * Math.PI * 2.5) * Math.exp(-3 * t);
            finalScale *= bounceFactor;
          }
        }

        const Ms = {
          x: (anchorL.overlayX + anchorR.overlayX) / 2,
          y: (anchorL.overlayY + anchorR.overlayY) / 2,
        };

        // Renderizado del recortable en coordenadas de pantalla directas (sin espejo exterior)
        ctx.save();
        ctx.globalAlpha = proximityAlpha;
        ctx.translate(transform.tx, transform.ty);
        ctx.rotate(transform.rotation);
        ctx.scale(finalScale, finalScale);
        ctx.drawImage(cached.img, -Ms.x, -Ms.y);
        ctx.restore();

        // Exclusión de cabeza mediante destination-out con borde radial suave si está activa
        if (headExclusion) {
          renderHeadExclusion(ctx, headExclusion);
        }

        lastValidTransformRef.current = { ...transform, scale: finalScale };
        lastValidMsRef.current = Ms;
        lastValidHeadExclusionRef.current = headExclusion;

        setValidAnchors(2);

        const elapsedTotal = performance.now() - start;
        const roundedElapsed = Math.round(elapsedTotal * 100) / 100;
        setWarpLatencyMs(roundedElapsed);

        updateStore(roundedElapsed, 2, 0, false);

        if (activeRef.current) {
          callbackIdRef.current = v.requestVideoFrameCallback(onFrame);
        }
        return;
      }

      // ── MODO FOTOGRÁFICO: WARP DE DELAUNAY Y MÁSCARA ──
      // a. Filter anchors by visibility
      const validAnchorsList: Array<{
        srcPt: Point;
        dstPt: Point;
        anchorId: string;
        isCritical: boolean;
      }> = [];

      for (const anchor of anchorsData.anchors) {
        const landmark = lm[anchor.landmarkIndex];
        if (!landmark) continue;
        // FIX 2: Use smoothed visibility instead of instantaneous
        const smoothedVis = smoothedVisibility(
          anchor.landmarkIndex,
          landmark.visibility ?? 0,
        );
        if (smoothedVis < VISIBILITY_THRESHOLD) continue;

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
          // FIX 1: Contain mapping (landscape) — use proper contain math
          cssPt = videoToCssContain(lmVideoX, lmVideoY, containFit);
        }

        validAnchorsList.push({
          srcPt,
          dstPt: cssPt,
          anchorId: anchor.id,
          isCritical: CRITICAL_ANCHORS.has(anchor.id),
        });
      }

      // b. Check minimum critical anchors and apply fallback estimates
      const criticalsById: Record<string, { srcPt: Point; dstPt: Point } | null> = {
        shoulderL: null,
        shoulderR: null,
        hipL: null,
        hipR: null,
      };
      for (const v of validAnchorsList) {
        if (v.isCritical && v.anchorId)
          criticalsById[v.anchorId] = { srcPt: v.srcPt, dstPt: v.dstPt };
      }

      let estimatedAnchors = 0;

      if (
        criticalsById.hipL &&
        criticalsById.hipR === null &&
        criticalsById.shoulderL &&
        criticalsById.shoulderR
      ) {
        const shoulderMidX_dst =
          (criticalsById.shoulderL.dstPt.x + criticalsById.shoulderR.dstPt.x) / 2;
        const hipL_dst = criticalsById.hipL.dstPt;
        criticalsById.hipR = {
          srcPt: { x: 704, y: 800 },
          dstPt: { x: 2 * shoulderMidX_dst - hipL_dst.x, y: hipL_dst.y },
        };
        estimatedAnchors++;
      }

      if (
        criticalsById.hipR &&
        criticalsById.hipL === null &&
        criticalsById.shoulderL &&
        criticalsById.shoulderR
      ) {
        const shoulderMidX_dst =
          (criticalsById.shoulderL.dstPt.x + criticalsById.shoulderR.dstPt.x) / 2;
        const hipR_dst = criticalsById.hipR.dstPt;
        criticalsById.hipL = {
          srcPt: { x: 320, y: 800 },
          dstPt: { x: 2 * shoulderMidX_dst - hipR_dst.x, y: hipR_dst.y },
        };
        estimatedAnchors++;
      }

      if (
        criticalsById.hipL === null &&
        criticalsById.hipR === null &&
        criticalsById.shoulderL &&
        criticalsById.shoulderR
      ) {
        const sL = criticalsById.shoulderL.dstPt;
        const sR = criticalsById.shoulderR.dstPt;
        const shoulderWidth = Math.hypot(sR.x - sL.x, sR.y - sL.y);
        const torsoHeight = shoulderWidth * 1.4;

        // sL is left shoulder, sR is right shoulder.
        // We want a vector perpendicular to the shoulder line, pointing DOWN the torso.
        // Since canvas Y goes down, pointing down means increasing Y.
        // Vector sR - sL goes from left to right shoulder.
        // We need to rotate this vector by 90 degrees.
        const angle = Math.atan2(sR.y - sL.y, sR.x - sL.x) - Math.PI / 2;
        const dx = Math.cos(angle) * torsoHeight;
        const dy = Math.sin(angle) * torsoHeight;
        criticalsById.hipL = {
          srcPt: { x: 320, y: 800 },
          dstPt: { x: sL.x + dx, y: sL.y + dy },
        };
        criticalsById.hipR = {
          srcPt: { x: 704, y: 800 },
          dstPt: { x: sR.x + dx, y: sR.y + dy },
        };
        estimatedAnchors += 2;
      }

      const allCriticals = Object.values(criticalsById).filter((v) => v !== null);
      if (allCriticals.length < 4) {
        const now = performance.now();
        if (lostTrackingSinceRef.current === null) {
          lostTrackingSinceRef.current = now;
        }
        const lostElapsed = now - lostTrackingSinceRef.current;
        const SUSTAINED_THRESHOLD_MS = 330; // ~10 frames at 30fps
        const sustained = lostElapsed >= SUSTAINED_THRESHOLD_MS;
        setValidAnchors(allCriticals.length);
        updateStore(null, allCriticals.length, estimatedAnchors, sustained);

        if (activeRef.current) {
          callbackIdRef.current = v.requestVideoFrameCallback(onFrame);
        }
        return;
      }

      lostTrackingSinceRef.current = null;
      setValidAnchors(validAnchorsList.length + estimatedAnchors);

      // Widen the hip destination points outward from their midpoint. MediaPipe's
      // hip landmarks (23, 24) tend to sit on the iliac crests (skeleton hip),
      // which is narrower than the visible silhouette of the garment at hip
      // level. Pushing them apart ~15% makes the warped garment match the
      // user's actual visible hip width rather than their bone width.
      if (criticalsById.hipL && criticalsById.hipR) {
        const HIP_WIDEN_FACTOR = 1.15;
        const midX = (criticalsById.hipL.dstPt.x + criticalsById.hipR.dstPt.x) / 2;
        criticalsById.hipL.dstPt = {
          x: midX + (criticalsById.hipL.dstPt.x - midX) * HIP_WIDEN_FACTOR,
          y: criticalsById.hipL.dstPt.y,
        };
        criticalsById.hipR.dstPt = {
          x: midX + (criticalsById.hipR.dstPt.x - midX) * HIP_WIDEN_FACTOR,
          y: criticalsById.hipR.dstPt.y,
        };
      }

      // c. Build anchor arrays (criticals only — shoulders + hips).
      // Non-critical anchors like elbows are intentionally OMITTED from the warp:
      // when the user raises an arm, the elbow landmark moves wildly and drags
      // the entire sleeve region of the warped garment with it, producing a
      // distorted oversized result. With shoulders+hips only, sleeves are
      // extrapolated via the affine transform and stay visually "arms-down".
      const anchorsSrc = allCriticals.map((a) => a!.srcPt);
      const anchorsDst = allCriticals.map((a) => a!.dstPt);

      // d. Extrapolate corners to draw the full garment (sleeves, neck) instead of clipping to torso
      const s0 = criticalsById.shoulderL?.srcPt;
      const s1 = criticalsById.shoulderR?.srcPt;
      const s2 = criticalsById.hipL?.srcPt || criticalsById.hipR?.srcPt;
      const d0 = criticalsById.shoulderL?.dstPt;
      const d1 = criticalsById.shoulderR?.dstPt;
      const d2 = criticalsById.hipL?.dstPt || criticalsById.hipR?.dstPt;

      if (s0 && s1 && s2 && d0 && d1 && d2) {
        const globalTransform = computeAffineTransform([s0, s1, s2], [d0, d1, d2]);
        if (globalTransform) {
          const [a, b, c, d, e, f] = globalTransform;
          // Use intrinsic image size or default 1024x1024
          const imgW = cached.img.naturalWidth || 1024;
          const imgH = cached.img.naturalHeight || 1024;

          // FIX: cap the top of the extrapolated region at (shoulderY - neckMargin)
          // instead of y=0. This prevents the top of the source PNG (which contains
          // empty/transparent space above the garment) from being warped to ABOVE
          // the user's shoulders, where it would cover the face/head.
          // The garment's anchors.json can override this default via `topClipY`
          // (in source PNG pixels) for collars/hoods that need a different reach.
          const NECK_MARGIN_PX = 150;
          const shoulderSrcY = Math.min(s0.y, s1.y);
          const defaultTopY = Math.max(0, shoulderSrcY - NECK_MARGIN_PX);
          const topY = cached.anchors.topClipY ?? defaultTopY;

          // Clip the bottom at the hip anchor line so the garment ends at the
          // waist instead of running down to mid-thigh. Tune HIP_BOTTOM_MARGIN_PX
          // to taste: 0 = stop at hip, negative = crop above hip, positive = a
          // bit of fabric below. Garments can override via `bottomClipY`.
          const HIP_BOTTOM_MARGIN_PX = 0;
          const defaultBottomY = Math.min(imgH, s2.y + HIP_BOTTOM_MARGIN_PX);
          const bottomY = cached.anchors.bottomClipY ?? defaultBottomY;

          const corners = [
            { x: 0, y: topY },
            { x: imgW, y: topY },
            { x: imgW, y: bottomY },
            { x: 0, y: bottomY },
          ];

          for (const pt of corners) {
            anchorsSrc.push(pt);
            anchorsDst.push({
              x: a * pt.x + c * pt.y + e,
              y: b * pt.x + d * pt.y + f,
            });
          }
        }
      }

      // Save unscaled valid anchors for soft fade retention in illustration mode
      const renderDst = anchorsDst;

      // e. Apply mirror via canvas transform
      ctx.save();
      ctx.translate(cssWidth, 0);
      ctx.scale(-1, 1);

      // Proximity fade: when the user leans close to the screen to tap the
      // catalog, MediaPipe's pose predictions get unreliable and the warp
      // distorts over the user's face. Fade the garment out before that
      // happens, using the normalized distance between the ears (landmarks
      // 7 & 8) as a proximity proxy. Fully transparent by 0.16.
      const lEar = lm[7];
      const rEar = lm[8];
      if (lEar && rEar) {
        const exDx = (lEar.x - rEar.x) * videoWidth;
        const exDy = (lEar.y - rEar.y) * videoHeight;
        const earDistNormalized =
          Math.hypot(exDx, exDy) / Math.max(videoWidth, videoHeight);
        const FADE_START = 0.1;
        const FADE_END = 0.16;
        if (earDistNormalized > FADE_START) {
          const t = Math.min(
            1,
            (earDistNormalized - FADE_START) / (FADE_END - FADE_START),
          );
          ctx.globalAlpha = 1 - t;
        }
      }

      // f. Warp garment
      warpGarment(ctx, cached.img, anchorsSrc, renderDst);

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
            // Mask is person=opaque (alpha), background=transparent
            // We want: keep garment where person is → destination-in with person mask
            imgData.data[px + 3] = alpha;
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
              crop.cropY,
              crop.visibleWidth,
              crop.visibleHeight,
              0,
              0,
              cssWidth,
              cssHeight,
            );
          } else {
            // FIX 1: Use contain fit for landscape mask compositing
            const maskFit = computeContainOffset(
              videoWidth,
              videoHeight,
              cssWidth,
              cssHeight,
            );
            ctx.drawImage(
              offscreen,
              maskFit.drawX,
              maskFit.drawY,
              maskFit.drawW,
              maskFit.drawH,
            );
          }

          ctx.restore();
        }
      }

      // h. Measure latency
      const elapsedTotal = performance.now() - start;
      const roundedElapsed = Math.round(elapsedTotal * 100) / 100;
      setWarpLatencyMs(roundedElapsed);

      updateStore(
        roundedElapsed,
        validAnchorsList.length + estimatedAnchors,
        estimatedAnchors,
        false,
      );

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
    isIllustration: isIllustrationRef.current,
  };
}
