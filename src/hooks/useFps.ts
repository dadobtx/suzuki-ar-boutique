import { useEffect, useRef, useState, type RefObject } from 'react';

interface FpsResult {
  /** Null when no video is active */
  fps: number | null;
  /** Average ms between video frames, null when inactive */
  latency: number | null;
}

/**
 * Measures real video frame delivery rate using video.requestVideoFrameCallback().
 * Rolling average over last 60 frame deltas.
 *
 * @param videoRef - Ref to an active HTMLVideoElement. If null/undefined or
 *   video is paused, returns { fps: null, latency: null }.
 */
export function useFps(videoRef?: RefObject<HTMLVideoElement | null>): FpsResult {
  const [fps, setFps] = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const frameTimes = useRef<number[]>([]);
  const lastTime = useRef(0);
  const callbackId = useRef(0);
  const activeRef = useRef(false);

  useEffect(() => {
    const video = videoRef?.current;

    // Check for API support
    if (!video || !('requestVideoFrameCallback' in video)) {
      setFps(null);
      setLatency(null);
      return;
    }

    activeRef.current = true;
    frameTimes.current = [];
    lastTime.current = 0;

    const onFrame = (_now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
      if (!activeRef.current) return;

      const presentedTime = metadata.presentationTime;

      if (lastTime.current > 0) {
        const delta = presentedTime - lastTime.current;
        const times = frameTimes.current;
        times.push(delta);

        // Keep last 60 deltas
        if (times.length > 60) times.shift();

        // Update display every 10 frames to avoid thrashing
        if (times.length % 10 === 0 && times.length >= 10) {
          const avg = times.reduce((a, b) => a + b, 0) / times.length;
          setFps(Math.round(1000 / avg));
          setLatency(Math.round(avg * 100) / 100);
        }
      }

      lastTime.current = presentedTime;

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
      setFps(null);
      setLatency(null);
    };
  }, [videoRef]);

  return { fps, latency };
}
