import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { useKioskStore } from '@/store/kiosk';

export function AwakeningSplash() {
  const { t } = useTranslation();
  const transition = useKioskStore((s) => s.transition);

  useEffect(() => {
    const timer = setTimeout(() => {
      transition('CALIBRATING');
    }, 1500);
    return () => clearTimeout(timer);
  }, [transition]);

  return (
    <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center transition-opacity duration-1000">
      <div className="absolute inset-4 border-2 border-accent-cyan/30 clip-hud transition-all duration-1000" />

      <h1 className="font-display text-8xl md:text-9xl tracking-widest text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)]">
        {t('kiosk.awakening.greeting', '¡VAMOS!')}
      </h1>
    </div>
  );
}
