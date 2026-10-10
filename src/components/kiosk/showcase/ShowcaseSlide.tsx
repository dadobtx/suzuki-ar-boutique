import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ScanLine } from 'lucide-react';
import type { ShowcaseSlide as ShowcaseSlideType } from './buildShowcaseSlides';
import { useLayoutStore } from '@/store/layout';

interface ShowcaseSlideProps {
  slide: Extract<ShowcaseSlideType, { kind: 'garment' }>;
}

function getRelativeLuminance(hex?: string): number {
  if (!hex || !hex.startsWith('#')) return 0;
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return 0;
  const r = parseInt(raw.substring(0, 2), 16) / 255;
  const g = parseInt(raw.substring(2, 4), 16) / 255;
  const b = parseInt(raw.substring(4, 6), 16) / 255;
  const toLinear = (val: number) =>
    val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function ShowcaseSlide({ slide }: ShowcaseSlideProps) {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const mode = useLayoutStore((s) => s.mode);

  const { garment, illustrations, photos, colorCount } = slide;
  const hasIllustration = illustrations.length > 0;

  // Handle multi-variant cycling (e.g., 990F0-BKQJ5)
  const [variantIdx, setVariantIdx] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion || illustrations.length <= 1) return;
    const interval = setInterval(() => {
      setVariantIdx((v) => (v + 1) % illustrations.length);
    }, 1600);
    return () => clearInterval(interval);
  }, [shouldReduceMotion, illustrations.length]);

  // Current photo for the active variant
  const currentPhoto = photos[variantIdx] ?? photos[0];

  // Layer A: Background Glow Color Calculation
  const firstColor = garment.colors?.[0];
  const luminance = getRelativeLuminance(firstColor);
  // Red is strictly prohibited as background fill; dark colors (<0.12 luminance) use accent silver
  const isReddish =
    firstColor &&
    (firstColor.toUpperCase().includes('CB1C2A') ||
      (firstColor.startsWith('#') &&
        parseInt(firstColor.slice(1, 3), 16) > 160 &&
        parseInt(firstColor.slice(3, 5), 16) < 60));

  const radialGlow =
    !firstColor || luminance < 0.12 || isReddish
      ? 'rgba(201, 206, 214, 0.12)'
      : `${firstColor}40`;

  const stripesMask =
    mode === 'portrait'
      ? 'linear-gradient(90deg, #000 0%, #000 45%, transparent 58%)'
      : 'linear-gradient(180deg, #000 0%, #000 45%, transparent 58%)';

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
      {/* Layer A: Radial Background Glow */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none select-none transition-opacity duration-500"
        style={{
          background: `radial-gradient(circle at 45% 50%, ${radialGlow} 0%, transparent 68%)`,
        }}
      />

      {/* Layer B: Giant Background Outlined Typography (aria-hidden) */}
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
            fontSize: 'clamp(9rem, 48vh, 24rem)',
            WebkitTextStroke: '1px rgba(255, 255, 255, 0.09)',
          }}
        >
          {garment.line.toUpperCase()}
        </span>
      </motion.div>

      {/* Layer C: Three Diagonal Racing Stripes with Fade Mask */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none select-none overflow-hidden flex items-center justify-center"
        style={{
          maskImage: stripesMask,
          WebkitMaskImage: stripesMask,
        }}
      >
        <div className="w-[180%] h-36 flex flex-col justify-between -rotate-[20deg] opacity-70">
          <div className="h-[2px] w-full bg-[#C9CED6]/15" />
          <div className="h-[3px] w-full bg-brand-red opacity-85" />
          <div className="h-[2px] w-full bg-[#C9CED6]/15" />
        </div>
      </div>

      {/* Content Composition according to Orientation */}
      <div
        className={`relative z-10 w-full h-full p-8 flex ${
          mode === 'portrait'
            ? 'flex-row items-center justify-between gap-8'
            : 'flex-col items-center justify-between gap-6'
        }`}
      >
        {/* Layer D & E: Visual Hero Section (Container query based) */}
        <div
          className={`flex items-center justify-center relative [container-type:size] ${
            mode === 'portrait' ? 'w-[58%] h-full' : 'w-full h-[58%]'
          }`}
        >
          <div className="relative w-[min(100cqw,100cqh)] h-[min(100cqw,100cqh)] aspect-square flex items-center justify-center">
            {hasIllustration ? (
              <>
                {/* Layer D: Sticker Illustration */}
                <motion.div
                  className="w-full h-full flex items-center justify-center relative [perspective:1000px]"
                  initial={
                    shouldReduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 1.18, rotate: -7 }
                  }
                  animate={
                    shouldReduceMotion
                      ? { opacity: 1 }
                      : {
                          opacity: 1,
                          scale: 1,
                          rotate: -2,
                          y: [0, -6, 0],
                        }
                  }
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -30 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.3 }
                      : {
                          opacity: { duration: 0.4 },
                          scale: {
                            type: 'spring',
                            stiffness: 260,
                            damping: 18,
                            delay: 0.1,
                          },
                          rotate: {
                            type: 'spring',
                            stiffness: 260,
                            damping: 18,
                            delay: 0.1,
                          },
                          y: {
                            duration: 3.2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: 0.5,
                          },
                          exit: { duration: 0.45, ease: 'easeOut' },
                        }
                  }
                >
                  {illustrations.length === 2 ? (
                    <AnimatePresence mode="wait">
                      <motion.img
                        key={variantIdx}
                        src={illustrations[variantIdx]}
                        alt={`${garment.name} (ilustración)`}
                        draggable={false}
                        initial={
                          shouldReduceMotion
                            ? { opacity: 0 }
                            : { rotateY: 90, opacity: 0 }
                        }
                        animate={
                          shouldReduceMotion
                            ? { rotateY: 0, opacity: 1 }
                            : { rotateY: 0, opacity: 1 }
                        }
                        exit={
                          shouldReduceMotion
                            ? { opacity: 0 }
                            : { rotateY: -90, opacity: 0 }
                        }
                        transition={{ duration: 0.28, ease: 'easeInOut' }}
                        className="w-full h-full object-contain filter drop-shadow-[0_18px_24px_rgba(0,0,0,0.55)] select-none pointer-events-none"
                      />
                    </AnimatePresence>
                  ) : (
                    <img
                      src={illustrations[0] ?? ''}
                      alt={`${garment.name} (ilustración)`}
                      draggable={false}
                      className="w-full h-full object-contain filter drop-shadow-[0_18px_24px_rgba(0,0,0,0.55)] select-none pointer-events-none"
                    />
                  )}
                </motion.div>

                {/* Layer E: Real Photo Card Superimposed on bottom-right (Back View) */}
                {currentPhoto?.back && (
                  <motion.div
                    className="absolute bottom-[2%] right-[2%] w-[36%] aspect-square bg-white rounded-sm p-[6%] shadow-[0_18px_36px_-10px_rgba(0,0,0,0.6)] border-b-[3px] border-b-brand-red flex flex-col justify-between z-20 pointer-events-none"
                    initial={
                      shouldReduceMotion
                        ? { opacity: 0 }
                        : { x: 40, y: 30, rotate: 10, opacity: 0 }
                    }
                    animate={
                      shouldReduceMotion
                        ? { opacity: 1 }
                        : { x: 0, y: 0, rotate: 4, opacity: 1 }
                    }
                    transition={
                      shouldReduceMotion
                        ? { duration: 0.3 }
                        : {
                            duration: 0.42,
                            delay: 0.55,
                            ease: [0.16, 1, 0.3, 1],
                          }
                    }
                  >
                    <span className="font-mono text-[10px] sm:text-xs font-bold tracking-wider text-[#17191E] uppercase select-none">
                      {t('kiosk.attract.showcase.backView', 'ASÍ ES POR DETRÁS')}
                    </span>
                    <div className="flex-1 w-full flex items-center justify-center overflow-hidden min-h-0 relative">
                      <AnimatePresence mode="wait">
                        <motion.img
                          key={currentPhoto.back}
                          src={currentPhoto.back}
                          alt={`${garment.name} — ${t('kiosk.attract.showcase.backViewAlt', 'vista posterior')}`}
                          draggable={false}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="w-full h-full object-contain select-none pointer-events-none"
                        />
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </>
            ) : (
              /* Fallback 3.5: No illustration -> Real photo in big white plaque */
              <motion.div
                className="w-full h-full bg-white rounded-sm p-8 shadow-[0_18px_36px_-10px_rgba(0,0,0,0.6)] border-b-[4px] border-b-brand-red flex items-center justify-center relative z-10 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
              >
                <img
                  src={photos[0]?.thumb || photos[0]?.full}
                  srcSet={
                    photos[0]?.thumb && photos[0]?.full
                      ? `${photos[0].thumb} 512w, ${photos[0].full} 2048w`
                      : undefined
                  }
                  sizes="40vw"
                  alt={garment.name}
                  draggable={false}
                  className="w-full h-full object-contain select-none pointer-events-none"
                />
              </motion.div>
            )}
          </div>
        </div>

        {/* Layer F & G: Text Information Block & CTA */}
        <div
          className={`flex flex-col justify-center ${
            mode === 'portrait'
              ? 'w-[42%] items-start text-left'
              : 'w-full h-[42%] items-center text-center'
          } gap-4 z-10 min-w-0`}
          aria-live="off"
        >
          {/* Garment Name: Balance wrapped, clamp up to 3 lines */}
          <motion.h2
            className={`font-display uppercase tracking-wide text-fg leading-none line-clamp-3 [text-wrap:balance] ${
              mode === 'portrait'
                ? 'text-4xl md:text-5xl lg:text-6xl'
                : 'text-3xl md:text-4xl'
            }`}
            initial={
              shouldReduceMotion ? { opacity: 0 } : { clipPath: 'inset(0 100% 0 0)' }
            }
            animate={
              shouldReduceMotion ? { opacity: 1 } : { clipPath: 'inset(0 0% 0 0)' }
            }
            transition={
              shouldReduceMotion
                ? { duration: 0.3 }
                : { duration: 0.45, delay: 0.75, ease: [0.16, 1, 0.3, 1] }
            }
          >
            {garment.name}
          </motion.h2>

          {/* Price and Specifications */}
          <motion.div
            className={`flex flex-col ${
              mode === 'portrait' ? 'items-start' : 'items-center'
            } gap-2`}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0.3 }
                : { duration: 0.35, delay: 0.9, ease: 'easeOut' }
            }
          >
            {typeof garment.priceCents === 'number' && (
              <span className="font-mono font-bold tabular-nums text-4xl text-fg">
                ${(garment.priceCents / 100).toFixed(2)}
              </span>
            )}

            <div className="font-mono text-sm tracking-widest text-fg-muted uppercase flex items-center gap-2">
              {garment.sizes && garment.sizes.length > 0 && (
                <span>
                  {t('kiosk.attract.showcase.sizes', 'TALLAS')}{' '}
                  {garment.sizes.join(' · ')}
                </span>
              )}
              {colorCount > 1 && (
                <>
                  <span>·</span>
                  <span>{t('kiosk.attract.showcase.colors', { count: colorCount })}</span>
                </>
              )}
            </div>
          </motion.div>

          {/* Layer G: Fixed CTA */}
          <div className="mt-2 inline-flex items-center gap-2.5 text-fg border-b-2 border-brand-red pb-1 font-display tracking-widest text-xl uppercase">
            <ScanLine className="w-5 h-5 text-fg shrink-0" />
            <span>{t('kiosk.attract.showcase.cta', 'PRUÉBATELA EN EL ESPEJO')}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
