import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSizingStore } from '@/store/sizing';
import { useKioskStore } from '@/store/kiosk';

export function TerminateButton() {
  const { t } = useTranslation();
  const resetProfile = useSizingStore((s) => s.reset);
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
      resetProfile();
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
      className={`h-[64px] min-h-[64px] min-w-[64px] px-6 font-display text-xl tracking-wider transition-all clip-hud flex items-center justify-center shrink-0 border-2 select-none cursor-pointer ${
        confirming
          ? 'border-brand-red bg-brand-red/20 text-brand-red'
          : 'border-white/20 bg-surface-2 text-fg-muted hover:text-white hover:border-white/40'
      }`}
    >
      {confirming
        ? t('kiosk.terminate.confirm', 'TOCA OTRA VEZ PARA TERMINAR')
        : t('kiosk.terminate.idle', 'TERMINAR')}
    </button>
  );
}
