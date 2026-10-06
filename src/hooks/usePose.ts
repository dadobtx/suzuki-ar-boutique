import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { Point3DFilter } from '@/lib/one-euro-filter';
import { POSE_MODEL_VERSION } from '@/lib/model-version';

import type { NormalizedLandmark } from '@/types/pose';
import { isDebugMode } from '@/lib/debug-mode';
import { debugTelemetry, setMediaPipeStatus } from '@/lib/debug-mediapipe';
import {
  isActiveZoneEnabled,
  POSE_MAX_PERSONS,
  selectUser,
  toVisibleCoordinates,
  parseActiveZoneConfig,
  type ActiveZoneState,
  type CandidateReason,
  type CandidateInput,
  type CandidateBoundingBox,
} from '@/lib/active-zone';
import { useLayoutStore } from '@/store/layout';

export interface ActiveZoneCandidateTelemetry {
  sw: number;
  cx: number;
  vis: number;
  speed: number;
  score?: number;
  reason: CandidateReason;
  box?: CandidateBoundingBox;
}

export interface ActiveZonePoseTelemetry {
  enabled: boolean;
  lockedIndex: number | null;
  candidates: ActiveZoneCandidateTelemetry[];
  approaching: boolean;
}

export interface UsePoseResult {
  landmarks: NormalizedLandmark[] | null;
  worldLandmarks: NormalizedLandmark[] | null;
  mask: Uint8ClampedArray | null;
  fps: number;
  latency: number;
  modelVersion: string | null;
  backend: 'WebGL2' | 'CPU' | null;
  inferring: boolean;
  error: string | null;
  frameId: number;
  activeZone: ActiveZonePoseTelemetry;
  lockedWrists: {
    left: NormalizedLandmark | null;
    right: NormalizedLandmark | null;
  };
}

// Singleton landmarker (initialized once per page lifetime)
let landmarker: PoseLandmarker | null = null;
let initPromise: Promise<{
  landmarker: PoseLandmarker;
  backend: 'WebGL2' | 'CPU';
}> | null = null;

export function _resetLandmarkerForTesting() {
  landmarker = null;
  initPromise = null;
}

async function initLandmarker(numPoses: number = 1) {
  if (initPromise) {
    const res = await initPromise;
    try {
      await res.landmarker.setOptions({ numPoses });
    } catch (e) {
      console.warn('[usePose] setOptions failed:', e);
    }
    return res;
  }

  if (isDebugMode()) {
    setMediaPipeStatus('loading');
  }

  initPromise = (async () => {
    try {
      const resolver = await FilesetResolver.forVisionTasks(
        `${import.meta.env.BASE_URL}mediapipe/wasm`,
      );

      let backend: 'WebGL2' | 'CPU' = 'WebGL2';
      let lm: PoseLandmarker;
      try {
        lm = await PoseLandmarker.createFromOptions(resolver, {
          baseOptions: {
            modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/pose_landmarker_full.task`,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          outputSegmentationMasks: true,
          numPoses,
        });
      } catch (e) {
        console.warn('[usePose] WebGL2 failed, falling back to CPU', e);
        lm = await PoseLandmarker.createFromOptions(resolver, {
          baseOptions: {
            modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/pose_landmarker_full.task`,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          outputSegmentationMasks: true,
          numPoses,
        });
        backend = 'CPU';
      }
      landmarker = lm;
      if (isDebugMode()) {
        setMediaPipeStatus('ready', backend === 'WebGL2' ? 'GPU' : 'CPU');
      }
      return { landmarker: lm, backend };
    } catch (err) {
      console.warn('[usePose] initLandmarker failed:', err);
      if (isDebugMode()) {
        setMediaPipeStatus(
          'error',
          null,
          err instanceof Error ? err.message : String(err),
        );
      }
      throw err;
    }
  })();
  return initPromise;
}

export function usePose(videoRef?: RefObject<HTMLVideoElement | null>): UsePoseResult {
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null);
  const [worldLandmarks, setWorldLandmarks] = useState<NormalizedLandmark[] | null>(null);
  const [mask, setMask] = useState<Uint8ClampedArray | null>(null);
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0);
  const [backend, setBackend] = useState<'WebGL2' | 'CPU' | null>(null);
  const [modelVersion, setModelVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inferring, setInferring] = useState(false);
  const [frameId, setFrameId] = useState(0);

  const isZonaEnabled = isActiveZoneEnabled();
  const [activeZone, setActiveZone] = useState<ActiveZonePoseTelemetry>({
    enabled: isZonaEnabled,
    lockedIndex: null,
    candidates: [],
    approaching: false,
  });
  const [lockedWrists, setLockedWrists] = useState<{
    left: NormalizedLandmark | null;
    right: NormalizedLandmark | null;
  }>({
    left: null,
    right: null,
  });

  const filterRef = useRef<Point3DFilter[]>([]);
  const callbackId = useRef(0);
  const activeRef = useRef(false);
  const latencyHistory = useRef<number[]>([]);
  const recentInferencesRef = useRef<Array<{ time: number; latency: number }>>([]);
  const lastProcessTime = useRef(performance.now());
  const activeZoneStateRef = useRef<ActiveZoneState | null>(null);
  const lastLockedPersonKeyRef = useRef<string | null>(null);

  // Initialize 33 One-Euro filters
  if (filterRef.current.length === 0) {
    for (let i = 0; i < 33; i++) {
      filterRef.current.push(new Point3DFilter());
    }
  }

  // Initialize MediaPipe once
  useEffect(() => {
    let cancelled = false;
    const targetNumPoses = isZonaEnabled ? POSE_MAX_PERSONS : 1;
    initLandmarker(targetNumPoses)
      .then(({ backend }) => {
        if (cancelled) return;
        setBackend(backend);
        setModelVersion(POSE_MODEL_VERSION);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[usePose] initLandmarker caught error:', err);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [isZonaEnabled]);

  // Frame processing loop
  useEffect(() => {
    const video = videoRef?.current;
    if (!video || !('requestVideoFrameCallback' in video)) {
      setInferring(false);
      return;
    }

    activeRef.current = true;

    const onFrame = (_now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
      if (!activeRef.current || !video || !landmarker) {
        if (activeRef.current && video) {
          callbackId.current = video.requestVideoFrameCallback(onFrame);
        }
        return;
      }

      // Throttle if latency is high
      const avgLatency =
        latencyHistory.current.length > 0
          ? latencyHistory.current.reduce((a, b) => a + b, 0) /
            latencyHistory.current.length
          : 0;
      if (avgLatency > 40) {
        const skip = Math.ceil(avgLatency / 33) - 1;
        if (skip > 0) {
          const minSpacing = (skip + 1) * 33;
          if (performance.now() - lastProcessTime.current < minSpacing) {
            callbackId.current = video.requestVideoFrameCallback(onFrame);
            return;
          }
        }
      }

      if (video.readyState >= 2 && video.videoWidth > 0) {
        const start = performance.now();
        try {
          const result = landmarker.detectForVideo(video, metadata.presentationTime);
          setFrameId((prev) => prev + 1);
          const lat = performance.now() - start;
          latencyHistory.current.push(lat);
          if (latencyHistory.current.length > 30) {
            latencyHistory.current.shift();
          }
          lastProcessTime.current = performance.now();

          setFps(Math.round(1000 / lat));
          setLatency(lat);
          setInferring(true);
          setError(null);

          let pose: NormalizedLandmark[] | null = null;
          let worldPose: NormalizedLandmark[] | null = null;
          let maskInfo: { getAsUint8Array: () => Uint8Array; close: () => void } | null =
            null;
          let currentLockedWrists = {
            left: null as NormalizedLandmark | null,
            right: null as NormalizedLandmark | null,
          };
          let nextActiveZoneTelemetry: ActiveZonePoseTelemetry = {
            enabled: isZonaEnabled,
            lockedIndex: null,
            candidates: [],
            approaching: false,
          };

          if (isZonaEnabled) {
            const rawLandmarksList = (result.landmarks ?? []) as NormalizedLandmark[][];
            const layout = useLayoutStore.getState().mode;
            const containerWidth =
              video.clientWidth || (layout === 'portrait' ? 1080 : 1920);
            const containerHeight =
              video.clientHeight || (layout === 'portrait' ? 1920 : 1080);

            const candidateInputs: CandidateInput[] = rawLandmarksList.map((lms) => {
              const visibleLandmarks = lms.map((lm) =>
                toVisibleCoordinates(
                  lm,
                  layout,
                  video.videoWidth,
                  video.videoHeight,
                  containerWidth,
                  containerHeight,
                ),
              );
              return { landmarks: lms, visibleLandmarks };
            });

            const config = parseActiveZoneConfig();
            const selectionResult = selectUser(
              candidateInputs,
              activeZoneStateRef.current,
              config,
              performance.now(),
            );
            activeZoneStateRef.current = selectionResult.state;

            nextActiveZoneTelemetry = {
              enabled: true,
              lockedIndex: selectionResult.lockedIndex,
              candidates: selectionResult.candidates.map((c) => ({
                sw: c.sw,
                cx: c.cx,
                vis: c.vis,
                speed: c.speed,
                score: c.score,
                reason: c.reason,
                box: c.box,
              })),
              approaching: selectionResult.approaching,
            };

            const lockedIdx = selectionResult.lockedIndex;
            if (lockedIdx !== null && rawLandmarksList[lockedIdx]) {
              pose = rawLandmarksList[lockedIdx];
              worldPose =
                (result.worldLandmarks?.[lockedIdx] as NormalizedLandmark[]) ?? null;
              maskInfo =
                (result.segmentationMasks?.[lockedIdx] as unknown as {
                  getAsUint8Array: () => Uint8Array;
                  close: () => void;
                }) ?? null;
              currentLockedWrists = {
                left: pose[15] ?? null,
                right: pose[16] ?? null,
              };

              const currentPersonKey = selectionResult.state.lockedPerson
                ? String(selectionResult.state.lockedPerson.lockedSinceMs)
                : null;
              if (lastLockedPersonKeyRef.current !== currentPersonKey) {
                filterRef.current.forEach((f) => f.reset());
                lastLockedPersonKeyRef.current = currentPersonKey;
              }
            } else {
              pose = null;
              worldPose = null;
              maskInfo = null;
              currentLockedWrists = { left: null, right: null };
              if (lastLockedPersonKeyRef.current !== null) {
                filterRef.current.forEach((f) => f.reset());
                lastLockedPersonKeyRef.current = null;
              }
            }
          } else {
            // Zona OFF: Comportamiento idéntico al actual
            pose = (result.landmarks[0] as NormalizedLandmark[] | undefined) ?? null;
            worldPose =
              (result.worldLandmarks[0] as NormalizedLandmark[] | undefined) ?? null;
            maskInfo =
              (result.segmentationMasks?.[0] as unknown as {
                getAsUint8Array: () => Uint8Array;
                close: () => void;
              }) ?? null;
            if (pose) {
              currentLockedWrists = {
                left: pose[15] ?? null,
                right: pose[16] ?? null,
              };
            }
          }

          setActiveZone(nextActiveZoneTelemetry);
          setLockedWrists(currentLockedWrists);

          const nowPerf = performance.now();
          recentInferencesRef.current.push({ time: nowPerf, latency: lat });
          const cutoff = nowPerf - 5000;
          recentInferencesRef.current = recentInferencesRef.current.filter(
            (item) => item.time >= cutoff,
          );

          const count5s = recentInferencesRef.current.length;
          const fps5s =
            count5s > 1
              ? Math.round(
                  (count5s * 1000) /
                    Math.max(1, nowPerf - recentInferencesRef.current[0]!.time),
                )
              : Math.round(1000 / lat);

          const sortedLats = recentInferencesRef.current
            .map((item) => item.latency)
            .sort((a, b) => a - b);
          const p95Idx = Math.min(
            sortedLats.length - 1,
            Math.floor(sortedLats.length * 0.95),
          );
          const latencyP95 = sortedLats[p95Idx] ?? lat;

          let heapUsedMB: number | null = null;
          if (
            typeof performance !== 'undefined' &&
            (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
          ) {
            heapUsedMB = Number(
              (
                (performance as unknown as { memory: { usedJSHeapSize: number } }).memory
                  .usedJSHeapSize /
                (1024 * 1024)
              ).toFixed(1),
            );
          }

          if (isDebugMode()) {
            debugTelemetry.mediapipe.fps = Math.round(1000 / lat);
            debugTelemetry.mediapipe.latency = lat;
            debugTelemetry.mediapipe.fps5s = fps5s;
            debugTelemetry.mediapipe.latencyP95 = latencyP95;
            debugTelemetry.mediapipe.heapUsedMB = heapUsedMB;
            debugTelemetry.mediapipe.landmarksCount = pose ? pose.length : 0;
            debugTelemetry.mediapipe.modelVersion = POSE_MODEL_VERSION;
            debugTelemetry.mediapipe.error = null;
          }

          if (pose) {
            const filtered = pose.map((lm, i) => {
              const f = filterRef.current[i];
              if (!f) return lm;
              return f.filterPoint(lm, metadata.presentationTime) as NormalizedLandmark;
            });
            setLandmarks(filtered);
          } else {
            setLandmarks(null);
            if (!isZonaEnabled) {
              filterRef.current.forEach((f) => f.reset());
            }
          }
          setWorldLandmarks(worldPose);

          if (maskInfo) {
            const raw = maskInfo.getAsUint8Array();
            setMask(new Uint8ClampedArray(raw));
          } else {
            setMask(null);
          }

          // CERRAR TODAS las máscaras de segmentationMasks para evitar fuga de GPU
          if (result.segmentationMasks && result.segmentationMasks.length > 0) {
            for (const m of result.segmentationMasks) {
              try {
                m.close();
              } catch (closeErr) {
                console.warn('[usePose] mask.close() failed:', closeErr);
              }
            }
          }

          if (
            'close' in result &&
            typeof (result as unknown as Record<string, unknown>).close === 'function'
          ) {
            try {
              ((result as unknown as Record<string, unknown>).close as () => void)();
            } catch (closeErr) {
              console.warn('[usePose] result.close() failed:', closeErr);
            }
          }
        } catch (err) {
          console.warn('[usePose] Inference error caught:', err);
          console.error('[usePose] Inference error:', err);
          setError(err instanceof Error ? err.message : String(err));
          if (isDebugMode()) {
            debugTelemetry.mediapipe.error =
              err instanceof Error ? err.message : String(err);
          }
        }
      }

      if (activeRef.current) {
        callbackId.current = video.requestVideoFrameCallback(onFrame);
      }
    };

    callbackId.current = video.requestVideoFrameCallback(onFrame);

    return () => {
      activeRef.current = false;
      if (callbackId.current && video) {
        video.cancelVideoFrameCallback(callbackId.current);
      }
    };
  }, [videoRef, isZonaEnabled]);

  return {
    landmarks,
    worldLandmarks,
    mask,
    fps,
    latency,
    modelVersion,
    backend,
    inferring,
    error,
    frameId,
    activeZone,
    lockedWrists,
  };
}
