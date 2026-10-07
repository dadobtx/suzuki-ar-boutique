import { useEffect } from 'react';
import type { RefObject } from 'react';
import { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@/types/pose';
import {
  computeCropOffset,
  videoToCss,
  computeContainOffset,
  videoToCssContain,
} from '@/lib/center-crop';
import type { ActiveZonePoseTelemetry } from '@/hooks/usePose';
import { parseActiveZoneConfig, type CandidateReason } from '@/lib/active-zone';
import { useDebugToggle } from '@/hooks/useDebugToggle';
import { isDebugMode } from '@/lib/debug-mode';
import { REACH } from '@/lib/hand-cursor';
import { isHandInputEnabled } from '@/lib/hand-input-flag';

interface PoseDebugProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  landmarks: NormalizedLandmark[] | null;
  mask: Uint8ClampedArray | null;
  layout: 'landscape' | 'portrait';
  activeZone?: ActiveZonePoseTelemetry;
}

export function PoseDebug({
  canvasRef,
  videoRef,
  landmarks,
  mask,
  layout,
  activeZone,
}: PoseDebugProps) {
  const { showDebug } = useDebugToggle();
  const shouldDraw = isDebugMode() || showDebug;

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas every frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!shouldDraw || !video || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const { videoWidth, videoHeight } = video;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;

    const crop = computeCropOffset(videoWidth, videoHeight, cssWidth, cssHeight);

    // 1. Draw Segmentation Mask
    if (mask) {
      const offscreen = new OffscreenCanvas(videoWidth, videoHeight);
      const offCtx = offscreen.getContext('2d');
      if (offCtx) {
        const imgData = offCtx.createImageData(videoWidth, videoHeight);
        if (mask.length === videoWidth * videoHeight) {
          for (let i = 0; i < mask.length; i++) {
            const alpha = mask[i] ?? 0;
            const px = i * 4;
            imgData.data[px] = 0; // R
            imgData.data[px + 1] = 255; // G
            imgData.data[px + 2] = 255; // B
            imgData.data[px + 3] = 255 - alpha; // A
          }
          offCtx.putImageData(imgData, 0, 0);

          ctx.save();
          ctx.globalAlpha = 0.3; // Translucent mask

          // Mirroring
          ctx.translate(cssWidth, 0);
          ctx.scale(-1, 1);

          if (layout === 'portrait') {
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
            const fit = computeContainOffset(
              videoWidth,
              videoHeight,
              cssWidth,
              cssHeight,
            );
            ctx.drawImage(offscreen, fit.drawX, fit.drawY, fit.drawW, fit.drawH);
          }
          ctx.restore();
        }
      }
    }

    // 2. Draw Landmarks
    if (landmarks && landmarks.length > 0) {
      ctx.save();

      // Mirroring
      ctx.translate(cssWidth, 0);
      ctx.scale(-1, 1);

      const mapCoord = (normX: number, normY: number) => {
        const vx = normX * videoWidth;
        const vy = normY * videoHeight;

        if (layout === 'portrait') {
          return videoToCss(vx, vy, crop);
        } else {
          const fit = computeContainOffset(videoWidth, videoHeight, cssWidth, cssHeight);
          return videoToCssContain(vx, vy, fit);
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
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
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
          ctx.fillStyle = '#00FF00';
        } else if (vis > 0.4) {
          ctx.fillStyle = '#FFFF00';
        } else {
          ctx.fillStyle = '#FF0000';
        }

        ctx.fill();
      }

      ctx.restore();
    }

    // 3. Draw Active Zone Overlay (Lines & Candidate Bounding Boxes)
    if (activeZone && activeZone.enabled) {
      const config = parseActiveZoneConfig();
      const xLeft = (0.5 - config.CENTER_BAND) * cssWidth;
      const xRight = (0.5 + config.CENTER_BAND) * cssWidth;

      // Líneas verticales de CENTER_BAND
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 230, 0, 0.65)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(xLeft, 0);
      ctx.lineTo(xLeft, cssHeight);
      ctx.moveTo(xRight, 0);
      ctx.lineTo(xRight, cssHeight);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 230, 0, 0.85)';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('ZONA ACTIVA', xLeft + 6, 24);
      ctx.restore();

      // Recuadros por candidata
      const reasonMap: Record<CandidateReason, string> = {
        locked: 'FIJADA',
        far: 'lejos',
        offCenter: 'descentrada',
        moving: 'moviéndose',
        lowVis: 'poco visible',
        candidate: 'candidata',
      };

      for (const cand of activeZone.candidates) {
        if (!cand.box) continue;

        // Las coordenadas visibles en espejo selfie:
        // screenX = (1 - visX) * cssWidth
        const screenLeft = (1 - cand.box.maxX) * cssWidth;
        const screenRight = (1 - cand.box.minX) * cssWidth;
        const screenTop = cand.box.minY * cssHeight;
        const screenBottom = cand.box.maxY * cssHeight;

        const boxWidth = Math.max(30, screenRight - screenLeft);
        const boxHeight = Math.max(40, screenBottom - screenTop);

        const isLocked = cand.reason === 'locked';
        const strokeColor = isLocked ? '#00FF66' : 'rgba(160, 160, 160, 0.8)';
        const bgColor = isLocked ? 'rgba(0, 255, 102, 0.12)' : 'rgba(0, 0, 0, 0.35)';
        const tagBg = isLocked ? '#00FF66' : 'rgba(120, 120, 120, 0.85)';
        const tagTextColor = isLocked ? '#000000' : '#FFFFFF';

        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isLocked ? 3 : 1.5;
        ctx.fillStyle = bgColor;
        ctx.strokeRect(screenLeft, screenTop, boxWidth, boxHeight);
        ctx.fillRect(screenLeft, screenTop, boxWidth, boxHeight);

        const reasonText = reasonMap[cand.reason] ?? cand.reason;
        const metricsText = `sw: ${cand.sw.toFixed(2)} | cx: ${cand.cx.toFixed(2)} | spd: ${cand.speed.toFixed(2)}`;

        // Etiqueta superior
        ctx.font = 'bold 11px monospace';
        const tagWidth = ctx.measureText(reasonText).width + 12;
        ctx.fillStyle = tagBg;
        ctx.fillRect(screenLeft, Math.max(0, screenTop - 20), tagWidth, 18);
        ctx.fillStyle = tagTextColor;
        ctx.fillText(reasonText, screenLeft + 6, Math.max(0, screenTop - 20) + 13);

        // Métricas inferiores
        ctx.font = '10px monospace';
        ctx.fillStyle = isLocked ? '#00FF66' : '#D0D0D0';
        ctx.fillText(metricsText, screenLeft + 2, screenTop + boxHeight + 14);
        ctx.restore();
      }

      // 4. Rango del mapeo de mano (dos líneas verticales en cx ± REACH · sw)
      if (isHandInputEnabled()) {
        const lockedCand =
          activeZone.lockedIndex !== null
            ? activeZone.candidates[activeZone.lockedIndex]
            : null;
        if (lockedCand) {
          const screenCx = (1 - lockedCand.cx) * cssWidth;
          const rangeHalfW = REACH * lockedCand.sw * cssWidth;
          const xLeftHand = screenCx - rangeHalfW;
          const xRightHand = screenCx + rangeHalfW;

          ctx.save();
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.75)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(xLeftHand, 0);
          ctx.lineTo(xLeftHand, cssHeight);
          ctx.moveTo(xRightHand, 0);
          ctx.lineTo(xRightHand, cssHeight);
          ctx.stroke();

          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(0, 240, 255, 0.9)';
          ctx.font = 'bold 11px monospace';
          ctx.fillText('RANGO MANO', xLeftHand + 6, 40);
          ctx.fillText('RANGO MANO', xRightHand - 85, 40);
          ctx.restore();
        }
      }
    }
  }, [canvasRef, videoRef, landmarks, mask, layout, showDebug, activeZone, shouldDraw]);

  return null;
}
