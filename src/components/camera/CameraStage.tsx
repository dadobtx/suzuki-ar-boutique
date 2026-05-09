import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCamera } from '@/hooks/useCamera';
import { useLayout } from '@/hooks/useLayout';
import { useDprCanvas } from '@/hooks/useDprCanvas';
import { useFps } from '@/hooks/useFps';
import { usePose } from '@/hooks/usePose';
import { usePresence } from '@/hooks/usePresence';
import { CameraView } from './CameraView';
import { HudFrame, HudCorners } from '@/components/hud';
import { PoseDebug } from '@/components/ar/PoseDebug';

/**
 * Camera stage: video + overlay canvas + catalog placeholder.
 *
 * Layout modes:
 *   landscape: grid-cols [70% video | 30% catalog]
 *   portrait:  grid-rows [65% video center-cropped | 35% catalog]
 */
export function CameraStage() {
  const { t } = useTranslation();
  const { layout } = useLayout();
  const camera = useCamera();

  // Canvas overlay refs
  const overlayContainerRef = useRef<HTMLElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hook up DPR-aware canvas
  useDprCanvas(overlayCanvasRef, overlayContainerRef);

  // Measure real video FPS via requestVideoFrameCallback
  const { fps } = useFps(camera.videoRef);

  // Phase 3: Pose & Presence
  const pose = usePose(camera.videoRef);
  const presence = usePresence(pose.landmarks);

  const isPortrait = layout === 'portrait';

  // Presence Badge Color
  const presenceColors: Record<string, string> = {
    absent: 'text-brand-red bg-brand-red/10',
    arriving: 'text-accent-yellow bg-accent-yellow/10 animate-pulse',
    present: 'text-accent-green bg-accent-green/10',
    leaving: 'text-accent-yellow bg-accent-yellow/10 animate-pulse',
  };
  const badgeColor = presenceColors[presence] || 'text-fg-muted bg-surface/50';

  return (
    <div
      className={
        isPortrait
          ? 'grid grid-rows-[65fr_35fr] h-screen w-full'
          : 'grid grid-cols-[7fr_3fr] h-screen w-full'
      }
    >
      {/* ── Video area ── */}
      <div
        className="relative overflow-hidden bg-bg"
        ref={(el) => {
          overlayContainerRef.current = el;
        }}
      >
        <CameraView
          videoRef={camera.videoRef}
          status={camera.status}
          error={camera.error}
          retry={camera.retry}
          objectFit={isPortrait ? 'cover' : 'contain'}
        />

        {/* Overlay canvas (transparent, on top of video) */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
        />

        {/* Pose Debug Drawer */}
        <PoseDebug
          canvasRef={overlayCanvasRef}
          videoRef={camera.videoRef}
          landmarks={pose.landmarks}
          mask={pose.mask}
          layout={layout}
        />

        {/* HUD corners on the video area */}
        <div className="absolute inset-0 pointer-events-none p-2">
          <HudCorners variant="cyan" />
        </div>

        {/* Presence HUD */}
        {camera.status === 'granted' && (
          <div className="absolute top-4 right-4 pointer-events-none">
            <div
              className={`font-mono text-xs px-3 py-1.5 rounded-full border border-current ${badgeColor}`}
            >
              PRESENCE: {t(`presence.${presence}`, presence.toUpperCase())}
            </div>
          </div>
        )}

        {/* Resolution badge (dev info) */}
        {camera.status === 'granted' && camera.settings && (
          <div className="absolute bottom-2 left-2 font-mono text-hud-xs text-accent-cyan/60 bg-bg/60 px-2 py-0.5 rounded">
            {camera.settings.width}×{camera.settings.height} @{' '}
            {camera.settings.frameRate?.toFixed(0) ?? '?'}fps
            {fps !== null && ` · ${fps} actual`}
          </div>
        )}
      </div>

      {/* ── Catalog placeholder ── */}
      <div className="bg-surface flex items-center justify-center p-4 overflow-hidden">
        <HudFrame
          variant="muted"
          corners={false}
          className="w-full h-full max-h-full flex items-center justify-center p-6"
          id="catalog-placeholder"
        >
          <div className="text-center space-y-2">
            <div className="font-display text-2xl text-fg-muted">
              {t('catalog.placeholder')}
            </div>
            <div className="font-mono text-hud-xs text-fg-muted/50">
              {t('catalog.comingSoon')}
            </div>
          </div>
        </HudFrame>
      </div>
    </div>
  );
}
