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
    <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center transition-opacity duration-1000">
      <div className="absolute inset-4 border-2 border-accent-cyan/30 clip-hud transition-all duration-1000 animate-[pulse_1s_ease-in-out_infinite]" />

      <h1 className="font-display text-8xl tracking-widest text-white animate-[pulse_1s_ease-in-out_infinite] glow-cyan">
        {t('kiosk.awakening.greeting', 'TE VEO')}
      </h1>
    </div>
  );
}
