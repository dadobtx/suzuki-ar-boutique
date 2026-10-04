import { useTranslation } from 'react-i18next';

export function AttractLoop() {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center p-8 select-none">
      <div className="text-center flex flex-col items-center gap-6">
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl tracking-widest text-fg drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] max-w-3xl leading-tight uppercase">
          {t('kiosk.attract.title', 'PRUÉBATE LA COLECCIÓN SUZUKI')}
        </h1>
        <div className="w-24 h-1 bg-brand-red glow-red" />
      </div>
    </div>
  );
}
