import { CameraStage } from '@/components/camera';
import { useKioskStore } from '@/store/kiosk';
import {
  AttractLoop,
  AwakeningSplash,
  CalibrationGuide,
  CooldownCountdown,
  PhotoShare,
  AIProcessing,
  AIError,
} from '@/components/kiosk';

export function HomePage() {
  const kioskState = useKioskStore((s) => s.state);

  return (
    <main className="relative w-full h-full overflow-hidden">
      {/* 
        CameraStage is always rendered but might be visually occluded by AttractLoop.
        This is necessary because CameraStage hosts the usePose hook which tracks presence!
      */}
      <CameraStage isActive={kioskState === 'TRYON'} />

      {/* Kiosk Overlays */}
      {kioskState === 'ATTRACT' && <AttractLoop />}
      {kioskState === 'AWAKENING' && <AwakeningSplash />}
      {kioskState === 'CALIBRATING' && <CalibrationGuide />}
      {kioskState === 'AI_PROCESSING' && <AIProcessing />}
      {kioskState === 'AI_ERROR' && <AIError />}
      {kioskState === 'COOLDOWN' && <CooldownCountdown />}
      {(kioskState === 'SHARE_QR' || kioskState === 'SHARE_QR_FALLBACK') && (
        <PhotoShare />
      )}
    </main>
  );
}
