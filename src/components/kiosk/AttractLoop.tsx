import { useTranslation } from 'react-i18next';

export function AttractLoop() {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-x-0 top-12 z-[70] pointer-events-none flex items-center justify-center">
      <div className="text-center flex flex-col items-center gap-4 animate-pulse">
        <h1 className="font-display text-4xl md:text-5xl tracking-widest text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">
          {t('kiosk.attract.cta', 'ACÉRCATE PARA EMPEZAR')}
        </h1>
        <div className="w-24 h-1 bg-brand-red glow-red" />
      </div>
    </div>
  );
}
