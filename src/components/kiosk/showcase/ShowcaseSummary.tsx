import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { ScanLine } from 'lucide-react';
import type { ShowcaseSlide as ShowcaseSlideType } from './buildShowcaseSlides';
import { useLayoutStore } from '@/store/layout';

interface ShowcaseSummaryProps {
  slide: Extract<ShowcaseSlideType, { kind: 'summary' }>;
}

export function ShowcaseSummary({ slide }: ShowcaseSummaryProps) {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const mode = useLayoutStore((s) => s.mode);

  const { count, minPriceCents, illustrations } = slide;

  return (
    <motion.div
      className="absolute inset-0 w-full h-full bg-surface text-fg select-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={
        shouldReduceMotion
          ? { opacity: 0, transition: { duration: 0.3 } }
          : { opacity: 0, transition: { duration: 0.45, ease: 'easeOut' } }
      }
      transition={
        shouldReduceMotion ? { duration: 0.3 } : { duration: 0.5, ease: 'easeOut' }
      }
    >
      {/* Background Soft Glow */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none select-none"
        style={{
          background:
            'radial-gradient(circle at 45% 50%, rgba(201, 206, 214, 0.12) 0%, transparent 70%)',
        }}
      />

      {/* Background Giant Text (aria-hidden) */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none select-none flex items-center justify-center overflow-hidden"
        initial={{ opacity: 0 }}
        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: [0, 40] }}
        transition={
          shouldReduceMotion
            ? { duration: 0.3 }
            : {
                opacity: { duration: 0.5 },
                x: { duration: 5.5, ease: 'linear' },
              }
        }
      >
        <span
          className="font-display font-black tracking-widest text-transparent whitespace-nowrap leading-none select-none"
          style={{
            fontSize: 'clamp(8rem, 45vh, 22rem)',
            WebkitTextStroke: '1px rgba(255, 255, 255, 0.08)',
          }}
        >
          SUZUKI
        </span>
      </motion.div>

      {/* Three Diagonal Racing Stripes */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none select-none overflow-hidden flex items-center justify-center"
      >
        <div className="w-[180%] h-36 flex flex-col justify-between -rotate-[20deg] opacity-70">
          <div className="h-[2px] w-full bg-[#C9CED6]/15" />
          <div className="h-[3px] w-full bg-brand-red opacity-85" />
          <div className="h-[2px] w-full bg-[#C9CED6]/15" />
        </div>
      </div>

      {/* Main Container */}
      <div
        className={`relative z-10 w-full h-full p-8 flex ${
          mode === 'portrait'
            ? 'flex-row items-center justify-between gap-8'
            : 'flex-col items-center justify-between gap-6'
        }`}
      >
        {/* Fan Collage of Illustrations */}
        <div
          className={`flex items-center justify-center relative [container-type:size] ${
            mode === 'portrait' ? 'w-[58%] h-full' : 'w-full h-[58%]'
          }`}
        >
          <div className="relative w-[min(100cqw,100cqh)] h-[min(100cqw,100cqh)] aspect-square flex items-center justify-center">
            {illustrations.map((url, idx) => {
              const total = illustrations.length;
              const angle = total > 1 ? -8 + (16 / (total - 1)) * idx : 0;
              // Horizontal offset across the fan
              const xOffsetPercent =
                total > 1 ? ((idx - (total - 1) / 2) / (total - 1)) * 36 : 0;

              return (
                <motion.div
                  key={`${url}-${idx}`}
                  className="absolute w-[68%] h-[68%] flex items-center justify-center pointer-events-none"
                  style={{
                    zIndex: idx + 1,
                    transformOrigin: 'bottom center',
                  }}
                  initial={
                    shouldReduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.85, y: 30, rotate: angle }
                  }
                  animate={
                    shouldReduceMotion
                      ? { opacity: 1 }
                      : {
                          opacity: 1,
                          scale: 1,
                          y: 0,
                          rotate: angle,
                          x: `${xOffsetPercent}%`,
                        }
                  }
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.3 }
                      : {
                          duration: 0.5,
                          delay: idx * 0.08,
                          ease: [0.16, 1, 0.3, 1],
                        }
                  }
                >
                  <img
                    src={url}
                    alt={`Colección Suzuki (${idx + 1})`}
                    draggable={false}
                    className="w-full h-full object-contain filter drop-shadow-[0_16px_28px_rgba(0,0,0,0.6)] select-none pointer-events-none"
                  />
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Text Information Block */}
        <div
          className={`flex flex-col justify-center ${
            mode === 'portrait'
              ? 'w-[42%] items-start text-left'
              : 'w-full h-[42%] items-center text-center'
          } gap-5 z-10 min-w-0`}
          aria-live="off"
        >
          <h2
            className={`font-display uppercase tracking-wider text-fg leading-none ${
              mode === 'portrait'
                ? 'text-5xl md:text-6xl lg:text-7xl'
                : 'text-4xl md:text-5xl'
            }`}
          >
            {t('kiosk.attract.showcase.summaryTitle', 'COLECCIÓN SUZUKI')}
          </h2>

          <div
            className={`flex flex-col ${
              mode === 'portrait' ? 'items-start' : 'items-center'
            } gap-2`}
          >
            <span className="font-mono font-bold tabular-nums text-2xl md:text-3xl text-fg">
              {t('kiosk.attract.showcase.summaryCount', { count })} ·{' '}
              {t('kiosk.attract.showcase.summaryFrom', 'DESDE')} $
              {(minPriceCents / 100).toFixed(2)}
            </span>
          </div>

          <div className="mt-2 inline-flex items-center gap-2.5 text-fg border-b-2 border-brand-red pb-1 font-display tracking-widest text-lg md:text-xl uppercase">
            <ScanLine className="w-5 h-5 text-fg shrink-0" />
            <span>
              {t(
                'kiosk.attract.showcase.summaryCta',
                'PÁRATE FRENTE AL ESPEJO Y PRUÉBATELAS',
              )}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
