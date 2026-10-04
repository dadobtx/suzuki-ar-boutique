import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useGarmentStore } from '@/store/garment';

export function AttractPanel() {
  const { t } = useTranslation();
  const catalog = useGarmentStore((s) => s.catalog);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Take up to 10 garments from catalog
  const garments = catalog.slice(0, 10);

  useEffect(() => {
    if (garments.length === 0) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const startTimer = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (!document.hidden) {
          setCurrentIndex((prev) => (prev + 1) % garments.length);
        }
      }, 4000);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      } else {
        startTimer();
      }
    };

    startTimer();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [garments.length]);

  const currentGarment = garments[currentIndex] ?? null;

  return (
    <div className="w-full h-full flex flex-col justify-between items-center p-8 bg-surface text-fg select-none overflow-hidden">
      {/* Top Banner: Call to Action */}
      <div className="flex flex-col items-center text-center mt-2">
        <span className="font-display text-3xl md:text-4xl tracking-widest text-fg uppercase">
          {t('kiosk.attract.standOnMark', 'PÁRATE EN LA MARCA DEL PISO')}
        </span>
        <div className="w-20 h-1 bg-brand-red mt-3" />
      </div>

      {/* Carousel Central Area */}
      <div className="relative flex-1 w-full flex items-center justify-center my-4 min-h-0">
        <AnimatePresence mode="wait">
          {currentGarment && (
            <motion.div
              key={currentGarment.id}
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="flex flex-col items-center text-center max-w-sm w-full h-full justify-center"
            >
              {(() => {
                const baseUrl = import.meta.env.BASE_URL;
                const src = currentGarment.thumbnailUrl || currentGarment.overlayUrl;
                const imageUrl = src ? `${baseUrl}${src.replace(/^\//, '')}` : '';

                return (
                  <div className="relative w-48 h-48 md:w-56 md:h-56 mb-4 flex items-center justify-center">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={currentGarment.name}
                        className="max-w-full max-h-full object-contain drop-shadow-2xl"
                      />
                    ) : (
                      <div className="w-32 h-32 rounded-xl bg-surface-2 border border-line flex items-center justify-center text-fg-muted text-4xl">
                        👕
                      </div>
                    )}
                  </div>
                );
              })()}

              <span className="font-mono text-xs uppercase tracking-widest text-fg-muted mb-1">
                {currentGarment.line}
              </span>
              <h3 className="font-display text-2xl md:text-3xl text-fg tracking-wide uppercase line-clamp-1 mb-2">
                {currentGarment.name}
              </h3>
              {typeof currentGarment.priceCents === 'number' && (
                <span className="font-mono text-xl text-fg font-bold">
                  ${(currentGarment.priceCents / 100).toFixed(2)}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Dots Indicator */}
      {garments.length > 1 && (
        <div className="flex gap-2 items-center justify-center mb-2">
          {garments.map((g, idx) => (
            <div
              key={g.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentIndex ? 'w-6 bg-brand-red' : 'w-1.5 bg-line'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
