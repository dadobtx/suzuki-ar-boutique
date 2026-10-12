import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowDown, UserRound, Hand } from 'lucide-react';
import { useKioskStore } from '@/store/kiosk';
import { useGarmentStore } from '@/store/garment';
import { useSizingStore } from '@/store/sizing';
import { useSelectionUi } from '@/hooks/useSelectionUi';
import { isHandInputEnabled } from '@/lib/hand-input-flag';
import { useHandGuide, type HandGuideState } from '@/lib/hand-guide';
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

  const { effectiveSelectionUi } = useSelectionUi();
  const isPerchero = effectiveSelectionUi === 'perchero';
  const isHandEnabled = isHandInputEnabled();

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

  // Modo indicaciones de mano (perchero + hand ON + catálogo visible, sin aviso de cuerpo)
  const isHandActiveMode =
    isHandEnabled &&
    isPerchero &&
    layout === 'portrait' &&
    (kioskState === 'TRYON' || (kioskState === 'ATTRACT' && hasProfile));

  const isBodyNotice = guide?.kind === 'body';

  const { state: handState, edgeType } = useHandGuide({
    isInteractive: isHandActiveMode && !isBodyNotice,
    showLiveButton,
  });

  // Retención mínima de 300 ms entre estados para evitar parpadeos
  const [displayedState, setDisplayedState] = useState<HandGuideState>(handState);
  const lastStateChangeRef = useRef<number>(Date.now());
  const pendingStateRef = useRef<HandGuideState>(handState);

  useEffect(() => {
    pendingStateRef.current = handState;

    // live-loading y live-active entran de inmediato
    if (handState === 'live-loading' || handState === 'live-active') {
      setDisplayedState(handState);
      lastStateChangeRef.current = Date.now();
      return;
    }

    const elapsed = Date.now() - lastStateChangeRef.current;
    if (elapsed >= 300) {
      setDisplayedState(handState);
      lastStateChangeRef.current = Date.now();
    } else {
      const remaining = 300 - elapsed;
      const target = handState;
      const timer = setTimeout(() => {
        setDisplayedState(target);
        lastStateChangeRef.current = Date.now();
      }, remaining);
      return () => clearTimeout(timer);
    }
  }, [handState]);

  if (!guide) return null;

  // Si estamos en live-active y no hay aviso de cuerpo, no mostrar mensaje de gestos
  if (isHandActiveMode && displayedState === 'live-active' && !isBodyNotice) {
    return null;
  }

  let handTitle: string | null = null;
  if (isHandActiveMode && !isBodyNotice) {
    const liveSuffix = showLiveButton
      ? t('kiosk.hand.liveSuffix', ' · ☝ ÍNDICE: VERTE EN VIVO')
      : '';

    switch (displayedState) {
      case 'raise':
        handTitle = t('kiosk.hand.raise', '✋ LEVANTA UNA MANO ABIERTA');
        break;
      case 'move-right':
        handTitle = `${t('kiosk.hand.moveRight', 'MUEVE TU MANO DERECHA ▶ PARA LA SIGUIENTE')}${liveSuffix}`;
        break;
      case 'move-left':
        handTitle = `${t('kiosk.hand.moveLeft', '◀ MUEVE TU MANO IZQUIERDA PARA LA ANTERIOR')}${liveSuffix}`;
        break;
      case 'recenter':
        handTitle = t('kiosk.hand.recenter', 'VUELVE LA MANO AL CENTRO');
        break;
      case 'edge':
        handTitle =
          edgeType === 'first'
            ? t('kiosk.hand.edgeFirst', 'ES LA PRIMERA PRENDA · USA LA OTRA MANO')
            : t('kiosk.hand.edgeLast', 'ES LA ÚLTIMA PRENDA · USA LA OTRA MANO');
        break;
      case 'index':
        handTitle = t('kiosk.hand.index', 'MANTÉN EL ÍNDICE ☝ … VERME EN VIVO');
        break;
      case 'live-loading':
        handTitle = t('kiosk.hand.liveLoading', 'PREPARANDO TU PRUEBA EN VIVO…');
        break;
      case 'live-active':
      case 'hidden':
        handTitle = null;
        break;
    }
  }

  const effectiveTitle = handTitle ?? guide.title;
  const isShowingHandPrompt = handTitle !== null;

  const ArrowIcon = guide.arrow === 'right' ? ArrowRight : ArrowDown;

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
          key={`${isBodyNotice ? 'body' : isShowingHandPrompt ? 'hand' : 'step'}-${effectiveTitle}`}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`
            flex flex-col items-center justify-center px-6 py-2.5
            bg-surface/90 backdrop-blur-md clip-hud
            ${isBodyNotice ? 'border border-fg' : 'border border-line'}
          `}
        >
          {/* Step indicator row (only in step mode when not showing hand prompt) */}
          {!isBodyNotice && !isShowingHandPrompt && (
            <div className="flex items-center justify-center gap-2 text-xs mb-1 select-none tracking-wider">
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
              <UserRound className="w-6 h-6 text-fg shrink-0" strokeWidth={2.2} />
            )}
            {isShowingHandPrompt && (
              <Hand
                className="w-6 h-6 text-brand-red shrink-0 animate-pulse"
                strokeWidth={2.2}
              />
            )}

            <span
              className={`font-display ${
                layout === 'portrait' ? 'text-2xl' : 'text-xl'
              } tracking-wide text-fg uppercase whitespace-nowrap`}
            >
              {effectiveTitle}
            </span>

            {!isBodyNotice && !isShowingHandPrompt && guide.arrow && (
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
                  className="w-6 h-6 text-brand-red shrink-0"
                  strokeWidth={2.5}
                />
              </motion.div>
            )}
          </div>

          {/* Hint text */}
          {!isBodyNotice && !isShowingHandPrompt && guide.hint && (
            <p className="text-sm text-fg-muted mt-0.5 text-center select-none">
              {guide.hint}
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
