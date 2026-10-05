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
    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
      <div className="relative flex flex-col items-center justify-center">
        <div className="bg-surface/85 backdrop-blur-md border border-line clip-hud px-8 py-3 shadow-lg">
          <h2 className="font-display text-4xl md:text-5xl text-fg tracking-widest uppercase">
            {t('kiosk.calibration.instruction', 'MANTENTE EN EL MARCO')}
          </h2>
        </div>
        {countdown > 0 && (
          <div className="absolute top-full mt-4 font-display text-7xl md:text-8xl text-fg font-bold tracking-wider">
            {countdown}
          </div>
        )}
      </div>
    </div>
  );
}
