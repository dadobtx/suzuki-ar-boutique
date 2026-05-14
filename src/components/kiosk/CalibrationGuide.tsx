import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useKioskStore } from '@/store/kiosk';

export function CalibrationGuide() {
  const { t } = useTranslation();
  const transition = useKioskStore((s) => s.transition);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          transition('TRYON');
          return 0;
        }
        return c - 1;
      });
    }, 666); // Total ~2s for 3-2-1

    return () => clearInterval(interval);
  }, [transition]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* HUD Frame */}
      <div className="absolute inset-8 border border-accent-cyan/50 clip-hud" />

      {/* Optimal Zone Rect */}
      <div className="absolute w-[60%] h-[70%] border-2 border-dashed border-accent-cyan/60 flex items-center justify-center">
        {/* Crosshair */}
        <div className="relative w-16 h-16">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-accent-cyan/80 -translate-y-1/2" />
          <div className="absolute left-1/2 top-0 w-0.5 h-full bg-accent-cyan/80 -translate-x-1/2" />
        </div>
      </div>

      {/* Instruction */}
      <div className="absolute top-1/4 flex flex-col items-center gap-4">
        <h2 className="font-display text-4xl text-white glow-cyan tracking-widest bg-black/50 px-6 py-2 rounded">
          {t('kiosk.calibration.instruction', 'MANTENTE EN EL MARCO')}
        </h2>
        <div className="font-mono text-6xl text-brand-red font-bold animate-pulse">
          {countdown > 0 ? countdown : ''}
        </div>
      </div>
    </div>
  );
}
