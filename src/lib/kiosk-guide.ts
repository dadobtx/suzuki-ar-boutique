import type { PresenceState } from '@/hooks/usePresence';
import type { FramingState } from './body-framing';

export interface ResolveGuideOptions {
  kioskState: string;
  hasProfile: boolean;
  presence: PresenceState;
  activeGarmentId: string | null;
  trackingLostSustained: boolean;
  framing: FramingState;
  showLiveButton?: boolean;
  layout: 'landscape' | 'portrait';
  t?: (key: string, defaultValue?: string) => string;
}

export interface GuideResult {
  step: 1 | 2 | 3 | null;
  title: string;
  hint: string | null;
  arrow: 'down' | 'right' | null;
  kind: 'step' | 'body';
}

/**
 * Pure decision engine for kiosk user guidance and body warnings.
 *
 * Priority order:
 * 1. Scope filter: Only shown in onboarding (kioskState === 'ATTRACT' && !hasProfile && presence !== 'absent')
 *    or during interactive try-on (kioskState === 'TRYON'). Everywhere else -> null.
 * 2. Body warnings (kind 'body'):
 *    - presence 'absent' | 'arriving' -> "PÁRATE FRENTE AL ESPEJO"
 *    - framing 'tooClose' | 'headCut' -> "DA UN PASO ATRÁS"
 *    - framing 'tooFar' -> "ACÉRCATE UN PASO"
 *    - trackingLostSustained with active garment -> "MUESTRA TUS HOMBROS"
 * 3. Step guidance (kind 'step'):
 *    - step 1 (onboarding): "ELIGE TU TALLA" / "y cómo te gusta que te quede"
 *    - step 2 (TRYON without garment): "TOCA UNA PRENDA PARA PROBÁRTELA" / "Desliza para ver más · cambia de línea arriba"
 *    - step 3 (TRYON with garment): "TÓMATE LA FOTO" / (showLiveButton ? "o pruébala EN VIVO 15 s" : null)
 */
export function resolveGuide(options: ResolveGuideOptions): GuideResult | null {
  const {
    kioskState,
    hasProfile,
    presence,
    activeGarmentId,
    trackingLostSustained,
    framing,
    showLiveButton = false,
    layout,
    t,
  } = options;

  const isOnboarding = kioskState === 'ATTRACT' && !hasProfile && presence !== 'absent';
  const isTryon = kioskState === 'TRYON';

  // 1. Scope check
  if (!isOnboarding && !isTryon) {
    return null;
  }

  // Derive step number (for telemetry & indicator state)
  const currentStep: 1 | 2 | 3 = isOnboarding ? 1 : !activeGarmentId ? 2 : 3;

  const tr = (key: string, fallback: string): string => (t ? t(key, fallback) : fallback);

  // 2. Body warnings (priority over normal steps)
  if (presence === 'absent' || presence === 'arriving') {
    return {
      step: currentStep,
      title: tr('kiosk.guide.body.standFront', 'PÁRATE FRENTE AL ESPEJO'),
      hint: null,
      arrow: null,
      kind: 'body',
    };
  }

  if (framing === 'tooClose' || framing === 'headCut') {
    return {
      step: currentStep,
      title: tr('kiosk.guide.body.stepBack', 'DA UN PASO ATRÁS'),
      hint: null,
      arrow: null,
      kind: 'body',
    };
  }

  if (framing === 'tooFar') {
    return {
      step: currentStep,
      title: tr('kiosk.guide.body.stepForward', 'ACÉRCATE UN PASO'),
      hint: null,
      arrow: null,
      kind: 'body',
    };
  }

  if (trackingLostSustained && activeGarmentId) {
    return {
      step: currentStep,
      title: tr('kiosk.guide.body.showShoulders', 'MUESTRA TUS HOMBROS'),
      hint: null,
      arrow: null,
      kind: 'body',
    };
  }

  // 3. Step guidance
  if (currentStep === 1) {
    return {
      step: 1,
      title: tr('kiosk.guide.step1.title', 'ELIGE TU TALLA'),
      hint: tr('kiosk.guide.step1.hint', 'y cómo te gusta que te quede'),
      arrow: layout === 'portrait' ? 'down' : 'right',
      kind: 'step',
    };
  }

  if (currentStep === 2) {
    return {
      step: 2,
      title: tr('kiosk.guide.step2.title', 'TOCA UNA PRENDA PARA PROBÁRTELA'),
      hint: tr('kiosk.guide.step2.hint', 'Desliza para ver más · cambia de línea arriba'),
      arrow: layout === 'portrait' ? 'down' : 'right',
      kind: 'step',
    };
  }

  // currentStep === 3
  return {
    step: 3,
    title: tr('kiosk.guide.step3.title', 'TÓMATE LA FOTO'),
    hint: showLiveButton
      ? tr('kiosk.guide.step3.hintLive', 'o pruébala EN VIVO 15 s')
      : null,
    arrow: 'down',
    kind: 'step',
  };
}
