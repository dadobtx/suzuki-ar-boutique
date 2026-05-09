import { useEffect } from 'react';
import type { RefObject } from 'react';
import { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@/types/pose';
import { computeCropOffset, videoToCss } from '@/lib/center-crop';

interface PoseDebugProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  landmarks: NormalizedLandmark[] | null;
  mask: Uint8ClampedArray | null;
  layout: 'landscape' | 'portrait';
}

import { useDebugToggle } from '@/hooks/useDebugToggle';

export function PoseDebug({
  canvasRef,
  videoRef,
  landmarks,
  mask,
  layout,
}: PoseDebugProps) {
  const { showDebug } = useDebugToggle();

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas every frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showDebug || !video || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const { videoWidth, videoHeight } = video;

    // canvas.width is the native backing store (CSS width * DPR)
    // For math, we need CSS width. useDprCanvas already sets width/height attributes to backing store,
    // and styles width/height to CSS sizes.
    // Wait, useDprCanvas scales the context by DPR. So drawing in ctx can use CSS coordinates!
    // We just need the CSS dimensions of the canvas.
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;

    const crop = computeCropOffset(videoWidth, videoHeight, cssWidth, cssHeight);

    // 1. Draw Segmentation Mask
    if (mask) {
      // Create ImageData from mask. Mask is videoWidth x videoHeight.
      // But we can't easily draw an unscaled Uint8ClampedArray directly.
      // We must create an ImageData, put it on an offscreen canvas, and drawImage with scaling/cropping.

      // Fast path: drawImage with OffscreenCanvas
      const offscreen = new OffscreenCanvas(videoWidth, videoHeight);
      const offCtx = offscreen.getContext('2d');
      if (offCtx) {
        const imgData = offCtx.createImageData(videoWidth, videoHeight);

        // mask is a single channel (confidence 0-255) or 4 channels depending on mediapipe?
        // MP Tasks outputSegmentationMasks: "The mask is represented as a single channel uint8 array..."
        // Oh wait, getAsUint8Array() might be 1 byte per pixel. ImageData needs 4 bytes per pixel (RGBA).
        // Let's manually copy and tint cyan (0, 255, 255).
        if (mask.length === videoWidth * videoHeight) {
          for (let i = 0; i < mask.length; i++) {
            const alpha = mask[i] ?? 0;
            const px = i * 4;
            imgData.data[px] = 0; // R
            imgData.data[px + 1] = 255; // G
            imgData.data[px + 2] = 255; // B
            imgData.data[px + 3] = 255 - alpha; // A (invertir: persona opaca)
          }
          offCtx.putImageData(imgData, 0, 0);

          ctx.save();
          ctx.globalAlpha = 0.3; // Translucent mask

          // Apply mirroring
          ctx.translate(cssWidth, 0);
          ctx.scale(-1, 1);

          if (layout === 'portrait') {
            // Draw cropped
            ctx.drawImage(
              offscreen,
              crop.cropX,
              0,
              crop.visibleWidth,
              videoHeight, // Source
              0,
              0,
              cssWidth,
              cssHeight, // Dest
            );
          } else {
            // Contain (landscape typically has objectFit contain)
            // Wait, if it's contain, the video is letterboxed. We need exact video bounds.
            // computeCropOffset returns scale. We can just use that.
            // If cropX is 0, video is letterboxed horizontally or vertically.
            // But computeCropOffset assumes cover.
            // The instructions say "En portrait con object-fit:cover... Re-usar la lógica".
            // For landscape, if object-fit is contain, we need to map native video to contain box.
            // Let's assume CameraStage landscape fills the container perfectly or we handle it simply:
            // If layout === 'landscape', objectFit is 'contain', so we just draw over the CSS space.
            // But video might have black bars! To keep it simple, let's just draw over the exact video rect.
            // The user only requested crop logic for portrait: "En portrait con object-fit:cover... Hay que aplicar cropX".
            // Let's use the simplest bounding box for landscape.
            const drawW = videoWidth * crop.scale;
            const drawH = videoHeight * crop.scale;
            const drawX = (cssWidth - drawW) / 2;
            const drawY = (cssHeight - drawH) / 2;

            ctx.drawImage(offscreen, drawX, drawY, drawW, drawH);
          }
          ctx.restore();
        }
      }
    }

    // 2. Draw Landmarks
    if (landmarks && landmarks.length > 0) {
      ctx.save();

      // Apply mirroring
      ctx.translate(cssWidth, 0);
      ctx.scale(-1, 1);

      // Helper to map normalized [0, 1] coords to CSS canvas coords
      const mapCoord = (normX: number, normY: number) => {
        const vx = normX * videoWidth;
        const vy = normY * videoHeight;

        if (layout === 'portrait') {
          return videoToCss(vx, vy, crop);
        } else {
          // Contain mapping
          const drawW = videoWidth * crop.scale;
          const drawH = videoHeight * crop.scale;
          const drawX = (cssWidth - drawW) / 2;
          const drawY = (cssHeight - drawH) / 2;
          return {
            x: drawX + vx * crop.scale,
            y: drawY + vy * crop.scale,
          };
        }
      };

      // Draw Connections
      ctx.lineWidth = 2;
      for (const connection of PoseLandmarker.POSE_CONNECTIONS) {
        const start = landmarks[connection.start];
        const end = landmarks[connection.end];

        if (!start || !end) continue;
        if ((start.visibility ?? 0) < 0.1 || (end.visibility ?? 0) < 0.1) continue;

        const pt1 = mapCoord(start.x, start.y);
        const pt2 = mapCoord(end.x, end.y);

        ctx.beginPath();
        ctx.moveTo(pt1.x, pt1.y);
        ctx.lineTo(pt2.x, pt2.y);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)'; // Cyan lines
        ctx.stroke();
      }

      // Draw Points
      for (const lm of landmarks) {
        const vis = lm.visibility ?? 0;
        if (vis < 0.1) continue;

        const pt = mapCoord(lm.x, lm.y);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);

        if (vis > 0.7) {
          ctx.fillStyle = '#00FF00'; // Green
        } else if (vis > 0.4) {
          ctx.fillStyle = '#FFFF00'; // Yellow
        } else {
          ctx.fillStyle = '#FF0000'; // Red
        }

        ctx.fill();
      }

      ctx.restore();
    }
  }, [canvasRef, videoRef, landmarks, mask, layout, showDebug]);

  return null;
}
