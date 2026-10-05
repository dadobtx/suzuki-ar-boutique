import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { useSizingStore } from '@/store/sizing';
import { useKioskStore, restartSession } from '@/store/kiosk';

export function RestartButton() {
  const { t } = useTranslation();
  const hasProfile = useSizingStore((s) => s.hasProfile);
  const kioskState = useKioskStore((s) => s.state);

  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Only active when a profile exists in interactive kiosk mode
  if (!hasProfile || kioskState === 'ATTRACT') return null;

  const handleClick = () => {
    if (confirming) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirming(false);
      restartSession();
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => {
        setConfirming(false);
      }, 3000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-live="polite"
      className={`h-[64px] min-h-[64px] min-w-[64px] px-4 font-display text-lg tracking-wider transition-all clip-hud flex items-center justify-center gap-2 shrink-0 select-none cursor-pointer ${
        confirming
          ? 'bg-brand-red border-brand-red text-white'
          : 'bg-surface-2 border-2 border-fg/70 text-fg'
      }`}
    >
      <RotateCcw
        className={`w-5 h-5 shrink-0 ${confirming ? 'text-white' : 'text-brand-red'}`}
      />
      <span className="whitespace-nowrap">
        {confirming
          ? t('kiosk.restart.confirm', 'TOCA OTRA VEZ PARA REINICIAR')
          : t('kiosk.restart.idle', 'REINICIAR')}
      </span>
    </button>
  );
}
