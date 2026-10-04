import { CameraStage } from '@/components/camera';
import { useKioskStore } from '@/store/kiosk';
import {
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
        CameraStage is always rendered with persistent grid layout.
        This is necessary because CameraStage hosts the usePose hook which tracks presence!
      */}
      <CameraStage />

      {/* Kiosk Overlays */}
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
