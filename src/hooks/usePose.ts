import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { Point3DFilter } from '@/lib/one-euro-filter';
import { POSE_MODEL_VERSION } from '@/lib/model-version';

import type { NormalizedLandmark } from '@/types/pose';

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
}

// Singleton landmarker (initialized once per page lifetime)
let landmarker: PoseLandmarker | null = null;
let initPromise: Promise<{
  landmarker: PoseLandmarker;
  backend: 'WebGL2' | 'CPU';
}> | null = null;

async function initLandmarker() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const resolver = await FilesetResolver.forVisionTasks('/mediapipe/wasm');

    let backend: 'WebGL2' | 'CPU' = 'WebGL2';
    let lm: PoseLandmarker;
    try {
      lm = await PoseLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: '/mediapipe/pose_landmarker_full.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputSegmentationMasks: true,
        numPoses: 1,
      });
    } catch (e) {
      console.warn('[usePose] WebGL2 failed, falling back to CPU', e);
      lm = await PoseLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: '/mediapipe/pose_landmarker_full.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        outputSegmentationMasks: true,
        numPoses: 1,
      });
      backend = 'CPU';
    }
    landmarker = lm;
    return { landmarker: lm, backend };
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

  const filterRef = useRef<Point3DFilter[]>([]);
  const callbackId = useRef(0);
  const activeRef = useRef(false);
  const latencyHistory = useRef<number[]>([]);
  const lastProcessTime = useRef(performance.now());

  // Initialize 33 One-Euro filters
  if (filterRef.current.length === 0) {
    for (let i = 0; i < 33; i++) {
      filterRef.current.push(new Point3DFilter());
    }
  }

  // Initialize MediaPipe once
  useEffect(() => {
    let cancelled = false;
    initLandmarker()
      .then(({ backend }) => {
        if (cancelled) return;
        setBackend(backend);
        setModelVersion(POSE_MODEL_VERSION);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

          const pose = (result.landmarks[0] as NormalizedLandmark[] | undefined) ?? null;
          const worldPose =
            (result.worldLandmarks[0] as NormalizedLandmark[] | undefined) ?? null;

          if (pose) {
            const filtered = pose.map((lm, i) => {
              const f = filterRef.current[i];
              if (!f) return lm;
              return f.filterPoint(lm, metadata.presentationTime) as NormalizedLandmark;
            });
            setLandmarks(filtered);
          } else {
            setLandmarks(null);
            filterRef.current.forEach((f) => f.reset());
          }
          setWorldLandmarks(worldPose);

          const maskInfo = result.segmentationMasks?.[0] ?? null;
          if (maskInfo) {
            const raw = maskInfo.getAsUint8Array();
            setMask(new Uint8ClampedArray(raw));
            maskInfo.close();
          } else {
            setMask(null);
          }

          if (
            'close' in result &&
            typeof (result as unknown as Record<string, unknown>).close === 'function'
          ) {
            ((result as unknown as Record<string, unknown>).close as () => void)();
          }
        } catch (err) {
          console.error('[usePose] Inference error:', err);
          setError(err instanceof Error ? err.message : String(err));
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
  }, [videoRef]);

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
  };
}
