import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowDown, UserRound } from 'lucide-react';
import { useKioskStore } from '@/store/kiosk';
import { useGarmentStore } from '@/store/garment';
import { useSizingStore } from '@/store/sizing';
import type { PresenceState } from '@/hooks/usePresence';
import type { FramingState } from '@/lib/body-framing';
import { resolveGuide } from '@/lib/kiosk-guide';

export interface KioskGuideProps {
  presence: PresenceState;
  layout: 'landscape' | 'portrait';
  framing?: FramingState;
  showLiveButton?: boolean;
}

/**
 * 3-step kiosk user guide and distance warning card.
 * Centers at top of mirror viewport.
 */
export function KioskGuide({
  presence,
  layout,
  framing = 'ok',
  showLiveButton = false,
}: KioskGuideProps) {
  const { t } = useTranslation();
  const kioskState = useKioskStore((s) => s.state);
  const hasProfile = useSizingStore((s) => s.hasProfile);
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const trackingLostSustained = useGarmentStore((s) => s.runtime.trackingLostSustained);
  const reducedMotion = useReducedMotion();

  const guide = resolveGuide({
    kioskState,
    hasProfile,
    presence,
    activeGarmentId,
    trackingLostSustained,
    framing,
    showLiveButton,
    layout,
    t: (key, fallback) => t(key, fallback ?? key),
  });

  if (!guide) return null;

  const ArrowIcon = guide.arrow === 'right' ? ArrowRight : ArrowDown;
  const isBodyNotice = guide.kind === 'body';

  const step1Label = t('kiosk.guide.steps.step1', '① TALLA');
  const step2Label = t('kiosk.guide.steps.step2', '② PRENDA');
  const step3Label = t('kiosk.guide.steps.step3', '③ FOTO');

  const formatStep = (stepNum: 1 | 2 | 3, defaultLabel: string) => {
    if (guide.step !== null && guide.step > stepNum) {
      return defaultLabel.replace(/^[①②③]/, '✓');
    }
    return defaultLabel;
  };

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none select-none max-w-[90%] md:max-w-[calc(100%-260px)]"
      style={{ zIndex: 35 }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={`${guide.kind}-${guide.title}`}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`
            flex flex-col items-center justify-center px-8 py-4
            bg-surface/90 backdrop-blur-md clip-hud
            ${isBodyNotice ? 'border border-fg' : 'border border-line'}
          `}
        >
          {/* Step indicator row (only in step mode) */}
          {!isBodyNotice && (
            <div className="flex items-center justify-center gap-2 text-sm mb-2 select-none tracking-wider">
              <span
                className={
                  guide.step === 1
                    ? 'text-fg font-bold pb-0.5 border-b-2 border-brand-red'
                    : guide.step !== null && guide.step > 1
                      ? 'text-fg-muted font-normal'
                      : 'text-fg-muted/50 font-normal'
                }
              >
                {formatStep(1, step1Label)}
              </span>
              <span className="text-fg-muted/30 select-none">──</span>
              <span
                className={
                  guide.step === 2
                    ? 'text-fg font-bold pb-0.5 border-b-2 border-brand-red'
                    : guide.step !== null && guide.step > 2
                      ? 'text-fg-muted font-normal'
                      : 'text-fg-muted/50 font-normal'
                }
              >
                {formatStep(2, step2Label)}
              </span>
              <span className="text-fg-muted/30 select-none">──</span>
              <span
                className={
                  guide.step === 3
                    ? 'text-fg font-bold pb-0.5 border-b-2 border-brand-red'
                    : 'text-fg-muted/50 font-normal'
                }
              >
                {formatStep(3, step3Label)}
              </span>
            </div>
          )}

          {/* Main title row */}
          <div className="flex items-center justify-center gap-3">
            {isBodyNotice && (
              <UserRound className="w-8 h-8 text-fg shrink-0" strokeWidth={2.2} />
            )}

            <span
              className={`font-display ${
                layout === 'portrait' ? 'text-3xl' : 'text-2xl'
              } tracking-wide text-fg uppercase whitespace-nowrap`}
            >
              {guide.title}
            </span>

            {!isBodyNotice && guide.arrow && (
              <motion.div
                animate={
                  reducedMotion
                    ? undefined
                    : guide.arrow === 'right'
                      ? { x: [0, 6, 0] }
                      : { y: [0, 6, 0] }
                }
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <ArrowIcon
                  className="w-7 h-7 text-brand-red shrink-0"
                  strokeWidth={2.5}
                />
              </motion.div>
            )}
          </div>

          {/* Hint text */}
          {!isBodyNotice && guide.hint && (
            <p className="text-base text-fg-muted mt-1 text-center select-none">
              {guide.hint}
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
