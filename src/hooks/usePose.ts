import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Point3DFilter } from '@/lib/one-euro-filter';
import type {
  PoseWorkerMessage,
  PoseWorkerResponse,
  NormalizedLandmark,
} from '@/workers/pose.worker';
// Vite ?worker import: bundlea como classic worker (IIFE).
// Necesario para MediaPipe Tasks Vision (usa importScripts internamente
// que no está disponible en module workers).
import PoseWorker from '@/workers/pose.worker?worker';

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

// Singleton worker instance to prevent memory leaks across remounts
let sharedWorker: Worker | null = null;
let activeSubscribers = 0;

function getSharedWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new PoseWorker();
    sharedWorker.postMessage({ type: 'init' } as PoseWorkerMessage);
  }
  activeSubscribers++;
  return sharedWorker;
}

function releaseSharedWorker() {
  activeSubscribers--;
  if (activeSubscribers <= 0 && sharedWorker) {
    sharedWorker.postMessage({ type: 'terminate' } as PoseWorkerMessage);
    sharedWorker.terminate();
    sharedWorker = null;
    activeSubscribers = 0;
  }
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

  const workerRef = useRef<Worker | null>(null);
  const filterRef = useRef<Point3DFilter[]>([]);
  const callbackId = useRef(0);
  const activeRef = useRef(false);

  // Initialize One-Euro filters (33 for landmarks)
  if (filterRef.current.length === 0) {
    for (let i = 0; i < 33; i++) {
      filterRef.current.push(new Point3DFilter());
    }
  }

  useEffect(() => {
    workerRef.current = getSharedWorker();

    const onMessage = (e: MessageEvent<PoseWorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'init_done') {
        setBackend(msg.backend);
        setModelVersion(msg.modelVersion);
      } else if (msg.type === 'error') {
        setError(msg.error);
        setInferring(false);
      } else if (msg.type === 'result') {
        setFps(msg.fps);
        setLatency(msg.latencyMs);
        setMask(msg.mask);
        setInferring(true);
        setError(null);

        // Apply One-Euro filter on main thread
        if (msg.landmarks) {
          const filtered = msg.landmarks.map((lm, i) => {
            const f = filterRef.current[i];
            if (!f) return lm;
            // The filter returns {x, y, z, visibility}
            return f.filterPoint(lm, msg.timestamp) as NormalizedLandmark;
          });
          setLandmarks(filtered);
        } else {
          setLandmarks(null);
          // Optional: reset filters when tracking is lost
          filterRef.current.forEach((f) => f.reset());
        }

        if (msg.worldLandmarks) {
          // World landmarks generally don't need UI-level jitter filtering as they are metric
          setWorldLandmarks(msg.worldLandmarks);
        } else {
          setWorldLandmarks(null);
        }
      }
    };

    workerRef.current.addEventListener('message', onMessage);

    return () => {
      if (workerRef.current) {
        workerRef.current.removeEventListener('message', onMessage);
      }
      releaseSharedWorker();
      workerRef.current = null;
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

    const onFrame = async (
      _now: DOMHighResTimeStamp,
      metadata: VideoFrameCallbackMetadata,
    ) => {
      if (!activeRef.current || !workerRef.current || !video) return;

      // Ensure video is playing and has dimensions
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        try {
          // createImageBitmap for zero-copy transfer
          const bitmap = await createImageBitmap(video);

          workerRef.current.postMessage(
            {
              type: 'process',
              frame: bitmap,
              timestamp: metadata.presentationTime,
            } as PoseWorkerMessage,
            [bitmap],
          );
        } catch (err) {
          console.warn('[usePose] Error extracting frame:', err);
        }
      }

      // Schedule next
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
