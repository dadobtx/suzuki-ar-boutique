import { CameraStage } from '@/components/camera';
import { useKioskStore } from '@/store/kiosk';
import {
  AttractLoop,
  AwakeningSplash,
  CalibrationGuide,
  CooldownCountdown,
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
      {kioskState === 'COOLDOWN' && <CooldownCountdown />}
    </main>
  );
}
