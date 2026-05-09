import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { POSE_MODEL_VERSION } from '../../scripts/download-models';

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

// Types for messages
export type PoseWorkerMessage =
  | { type: 'init' }
  | { type: 'process'; frame: ImageBitmap; timestamp: number }
  | { type: 'terminate' };

export type PoseWorkerResponse =
  | { type: 'init_done'; backend: 'WebGL2' | 'CPU'; modelVersion: string }
  | { type: 'error'; error: string }
  | {
      type: 'result';
      landmarks: NormalizedLandmark[] | null;
      worldLandmarks: NormalizedLandmark[] | null;
      mask: Uint8ClampedArray | null;
      fps: number;
      latencyMs: number;
      timestamp: number;
    };

// State
let landmarker: PoseLandmarker | null = null;
let backend: 'WebGL2' | 'CPU' = 'CPU';

// Metrics
let lastProcessTime = performance.now();
const latencyHistory: number[] = [];

async function init() {
  if (landmarker) {
    self.postMessage({ type: 'init_done', backend, modelVersion: POSE_MODEL_VERSION });
    return;
  }

  try {
    const resolver = await FilesetResolver.forVisionTasks('/mediapipe/wasm');

    try {
      // Try WebGL2 first
      landmarker = await PoseLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: '/mediapipe/pose_landmarker_full.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputSegmentationMasks: true,
        numPoses: 1,
      });
      backend = 'WebGL2';
    } catch (e) {
      console.warn('[pose.worker] WebGL2 failed, falling back to CPU', e);
      landmarker = await PoseLandmarker.createFromOptions(resolver, {
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

    self.postMessage({ type: 'init_done', backend, modelVersion: POSE_MODEL_VERSION });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'error', error: errorMsg });
  }
}

function processFrame(frame: ImageBitmap, timestamp: number) {
  if (!landmarker) {
    frame.close();
    return;
  }

  // Throttling logic: check if we should drop this frame
  const avgLatency =
    latencyHistory.length > 0
      ? latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length
      : 0;

  let skipFrames = 0;
  if (avgLatency > 40) {
    skipFrames = Math.ceil(avgLatency / 33) - 1;
  }

  if (skipFrames > 0) {
    const minSpacing = (skipFrames + 1) * 33;
    if (performance.now() - lastProcessTime < minSpacing) {
      frame.close(); // Drop
      return;
    }
  }

  const start = performance.now();

  try {
    const result = landmarker.detectForVideo(frame, timestamp);
    const latency = performance.now() - start;

    latencyHistory.push(latency);
    if (latencyHistory.length > 30) latencyHistory.shift();

    const fps = Math.round(1000 / latency);
    lastProcessTime = performance.now();

    const pose = (result.landmarks[0] as NormalizedLandmark[]) ?? null;
    const worldPose = (result.worldLandmarks[0] as NormalizedLandmark[]) ?? null;
    const maskInfo = result.segmentationMasks?.[0] ?? null;

    let maskArray: Uint8ClampedArray | null = null;
    if (maskInfo) {
      const raw = maskInfo.getAsUint8Array();
      maskArray = new Uint8ClampedArray(raw);
      // Clean up GPU/WASM buffer
      maskInfo.close();
    }

    // Some versions of MP Tasks Vision recommend closing the result object if it has close()
    if (
      'close' in result &&
      typeof (result as Record<string, unknown>).close === 'function'
    ) {
      ((result as Record<string, unknown>).close as () => void)();
    }

    // Zero-copy transfer: maskArray buffer is neutralized in the worker after this call
    self.postMessage(
      {
        type: 'result',
        landmarks: pose,
        worldLandmarks: worldPose,
        mask: maskArray,
        fps,
        latencyMs: latency,
        timestamp,
      } as PoseWorkerResponse,
      maskArray ? [maskArray.buffer] : [],
    );
  } catch (err: unknown) {
    console.error('[pose.worker] Error in processing:', err);
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    frame.close();
  }
}

self.onmessage = (e: MessageEvent<PoseWorkerMessage>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    init();
  } else if (msg.type === 'process') {
    processFrame(msg.frame, msg.timestamp);
  } else if (msg.type === 'terminate') {
    if (landmarker) {
      landmarker.close();
      landmarker = null;
    }
    self.close();
  }
};
