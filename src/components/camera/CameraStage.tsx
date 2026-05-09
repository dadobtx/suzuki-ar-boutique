import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCamera } from '@/hooks/useCamera';
import { useLayout } from '@/hooks/useLayout';
import { useDprCanvas } from '@/hooks/useDprCanvas';
import { useFps } from '@/hooks/useFps';
import { CameraView } from './CameraView';
import { HudFrame, HudCorners } from '@/components/hud';

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

  // Canvas overlay refs (empty in F2, used by F3/F4)
  const overlayContainerRef = useRef<HTMLElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hook up DPR-aware canvas (it will size itself to match the container)
  useDprCanvas(overlayCanvasRef, overlayContainerRef);

  // Measure real video FPS via requestVideoFrameCallback
  const { fps } = useFps(camera.videoRef);

  const isPortrait = layout === 'portrait';

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

        {/* HUD corners on the video area */}
        <div className="absolute inset-0 pointer-events-none p-2">
          <HudCorners variant="cyan" />
        </div>

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
