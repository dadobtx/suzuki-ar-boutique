import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useKioskStore } from '@/store/kiosk';

export function CooldownCountdown() {
  const { t } = useTranslation();
  const reset = useKioskStore((s) => s.reset);
  const cancelCooldown = useKioskStore((s) => s.cancelCooldown);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          reset();
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [reset]);

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center">
      <h2 className="font-display text-6xl tracking-widest text-white mb-8">
        {t('kiosk.cooldown.title', '¿SIGUES AHÍ?')}
      </h2>

      <div className="font-mono text-9xl text-brand-red font-bold mb-12 animate-pulse glow-red">
        {countdown}
      </div>

      <button
        onClick={cancelCooldown}
        className="px-12 py-6 bg-brand-red text-white font-display text-4xl tracking-widest clip-hud transition-all hover:brightness-110 active:scale-95 glow-red"
      >
        {t('kiosk.cooldown.stay', 'QUEDATE')}
      </button>
    </div>
  );
}
