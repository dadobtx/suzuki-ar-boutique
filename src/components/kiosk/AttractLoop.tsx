import { useTranslation } from 'react-i18next';
import { Footprints } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

export function AttractLoop() {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center p-8 select-none">
      <div className="text-center flex flex-col items-center gap-6">
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl tracking-widest text-fg drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] max-w-3xl leading-tight uppercase">
          {t('kiosk.attract.title', 'PRUÉBATE LA COLECCIÓN SUZUKI')}
        </h1>
        <div className="w-24 h-1 bg-brand-red glow-red" />
        <div className="flex items-center gap-3 font-display text-2xl md:text-3xl tracking-widest text-fg/85 drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] uppercase">
          <motion.div
            animate={shouldReduceMotion ? undefined : { opacity: [0.6, 1, 0.6] }}
            transition={
              shouldReduceMotion
                ? undefined
                : { duration: 2, repeat: Infinity, ease: 'easeInOut' }
            }
          >
            <Footprints className="w-8 h-8 md:w-10 md:h-10 text-fg" />
          </motion.div>
          <span>{t('kiosk.attract.standOnMark', 'PÁRATE EN LA MARCA DEL PISO')}</span>
        </div>
      </div>
    </div>
  );
}
