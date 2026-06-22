import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldOff, AlertTriangle } from 'lucide-react';
import { HudFrame, NeonButton } from '@/components/hud';
import type { CameraStatus } from '@/store/camera';
import type { RefObject } from 'react';

interface CameraViewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
  retry: () => void;
  /** 'cover' for portrait center-crop, 'contain' for landscape full view */
  objectFit?: 'cover' | 'contain';
  className?: string;
}

/**
 * Renders the camera <video> element with state-specific UI overlays.
 * States: idle, requesting, granted, denied, unsupported, error.
 */
export function CameraView({
  videoRef,
  status,
  error,
  retry,
  objectFit = 'contain',
  className = '',
}: CameraViewProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const video = videoRef.current;
    if (!video || status !== 'granted') return;
    if (video.paused && video.srcObject) {
      video.play().catch(() => {
        // silently ignored — useCamera also retries
      });
    }
  }); // sin deps → corre después de cada render incluyendo cambios de objectFit

  return (
    <div className={`relative w-full h-full ${className}`}>
      <video
        ref={(el) => {
          // Assign to the mutable ref from useCamera
          (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
        }}
        autoPlay
        muted
        playsInline
        className="w-full h-full"
        style={{
          transform: 'scaleX(-1)',
          objectFit,
          visibility: status === 'granted' ? 'visible' : 'hidden',
        }}
        aria-label={t('a11y.cameraFeed')}
      />

      {/* Overlays absolute para estados no-granted */}
      {status !== 'granted' && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface">
          {status === 'denied' && (
            <HudFrame variant="red" className="max-w-md p-6 m-4" id="camera-denied">
              <div className="text-center space-y-4">
                <ShieldOff className="w-16 h-16 text-brand-red mx-auto" />
                <p className="font-mono text-sm text-fg">{t('camera.denied')}</p>
                <p className="font-mono text-hud-xs text-fg-muted">
                  {t('camera.grantHint')}
                </p>
                <NeonButton variant="red" size="md" onClick={retry}>
                  {t('camera.retry')}
                </NeonButton>
              </div>
            </HudFrame>
          )}

          {status === 'unsupported' && (
            <HudFrame
              variant="muted"
              className="max-w-md p-6 m-4"
              id="camera-unsupported"
            >
              <div className="text-center space-y-4">
                <AlertTriangle className="w-16 h-16 text-accent-yellow mx-auto" />
                <p className="font-mono text-sm text-fg">{t('camera.unsupported')}</p>
              </div>
            </HudFrame>
          )}

          {status === 'error' && (
            <HudFrame variant="red" className="max-w-md p-6 m-4" id="camera-error">
              <div className="text-center space-y-4">
                <AlertTriangle className="w-16 h-16 text-danger mx-auto" />
                <p className="font-mono text-sm text-fg">{t('camera.error')}</p>
                {error && (
                  <p className="font-mono text-hud-xs text-fg-muted break-all">{error}</p>
                )}
                <NeonButton variant="cyan" size="md" onClick={retry}>
                  {t('camera.retry')}
                </NeonButton>
              </div>
            </HudFrame>
          )}
        </div>
      )}
    </div>
  );
}
