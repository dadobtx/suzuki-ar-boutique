import { useTranslation } from 'react-i18next';
import { useLayout } from '@/hooks/useLayout';

export function AttractLoop() {
  const { t } = useTranslation();
  const { layout } = useLayout();
  const isPortrait = layout === 'portrait';

  return (
    <div
      className={`absolute inset-0 z-[70] pointer-events-none flex items-center justify-center
        ${isPortrait ? 'pb-[35vh]' : 'pr-[30vw]'}
      `}
    >
      <div className="text-center flex flex-col items-center gap-4 animate-pulse">
        <h1 className="font-display text-4xl md:text-5xl tracking-widest text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">
          {t('kiosk.attract.cta', 'SUBE LAS MANOS ARRIBA')}
        </h1>
        <div className="w-24 h-1 bg-brand-red glow-red" />
      </div>
    </div>
  );
}
