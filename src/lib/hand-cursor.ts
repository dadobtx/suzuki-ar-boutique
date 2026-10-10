import { OneEuroFilter } from './one-euro-filter';
import type { CandidateBoundingBox } from './active-zone';
import { isHandLeverModeEnabled } from './hand-input-flag';

export const OWNER_DIST = 0.08;
export const ACTIVATION_WINDOW_MS = 250;
export const ACTIVATION_RATIO = 0.6;
export const DEACTIVATION_TIMEOUT_MS = 400;
export const GESTURE_SCORE_MIN = 0.5;
export const REACH = 1.6;
export const HYSTERESIS_RATIO = 0.15;
export const DWELL_MS = 1200;
export const SHORTCUT_STABLE_MS = 300;
export const SHORTCUT_WINDOW_MS = 300;
export const SHORTCUT_RATIO = 0.7;

// Constantes Mano v2 & v3: Palanca y Confirmación explícita
export const LEVER_DEAD = 0.3;
export const LEVER_DEAD_HYST = 0.22;
export const LEVER_FAST = 0.75;
export const LEVER_FAST_HYST = 0.65;
export const STEP_SLOW_MS = 650;
export const STEP_FAST_MS = 350;
export const STEP_FIRST_DELAY_MS = 250;
export const CONFIRM_MS = 600;
export const CONFIRM_LOST_MAX_MS = 300;
export const GAP_LOST_MAX_MS = 300;
export const HAND_LOCK_TIMEOUT_MS = 500;
export const REARM_TIMEOUT_MS = 300;

// Constantes Mano v4: Paso por Gesto y Live con Índice
export const STEP_THRESHOLD = 0.35;
export const STEP_RESET_DEAD = 0.2;
export const STEP_RESET_MS = 150;
export const STEP_NOISE_FRAMES = 2;
export const STEP_NOISE_MS = 80;
export const STEP_COOLDOWN_MS = 400;
export const STEP_PULSE_MS = 250;
export const CONFIRM_LIVE_MS = 1200;
export const LIVE_REARM_MS = 300;

export interface HandLandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export type HandednessSide = 'Left' | 'Right' | 'None';
export type HandPoseSide = 'Left' | 'Right' | 'None';

export interface DetectedHandInput {
  wrist: HandLandmarkPoint;
  palmCenter: HandLandmarkPoint;
  gesture: string;
  score: number;
  handedness?: HandednessSide;
  landmarks?: HandLandmarkPoint[];
}

export interface LockedUserWrists {
  left: HandLandmarkPoint | null;
  right: HandLandmarkPoint | null;
}

export interface HandFrameUser {
  lockedWrists: LockedUserWrists;
  lockedElbows?: LockedUserWrists;
  lockedHips?: LockedUserWrists;
  shouldersY?: number | null;
  sw: number;
  cx: number;
  box?: CandidateBoundingBox;
  userId?: number | string | null;
}

export interface HandFrameInput {
  nowMs: number;
  hands: DetectedHandInput[];
  user: HandFrameUser | null;
  itemCount: number;
  busy?: boolean;
  pausedUntilMs?: number;
  currentIndex?: number;
  enableDwell?: boolean;
  useAbsoluteMapping?: boolean;
  mode?: 'step' | 'lever';
  isLiveAvailable?: boolean;
  isLiveActive?: boolean;
}

export type LeverState =
  | 'neutral'
  | 'slow_left'
  | 'slow_right'
  | 'fast_left'
  | 'fast_right';
export type OwnerMatchReason = 'wrist' | 'continuity' | 'box' | 'none';

export type StepBlockedReason =
  | 'ninguno'
  | 'desarmado (esperando centro)'
  | 'anti-rebote'
  | 'pausado (vuelo)'
  | 'pausado (en vivo)'
  | 'pausado (táctil)'
  | 'índice levantado'
  | 'mano abajo'
  | 'sin cursor';

export interface HandCursorData {
  active: boolean;
  x: number;
  y: number;
  index: number | null;
  dwellProgress: number;
  gesture: string;
  // Propiedades v2 & v3
  anchorX?: number | null;
  displacement?: number;
  leverState?: LeverState;
  directionArrow?: 'left' | 'right' | null;
  confirmProgress?: number;
  ownerReason?: OwnerMatchReason;
  activeHandSide?: HandednessSide;
  handSwitchCount?: number;
  // Propiedades v4
  poseSide?: HandPoseSide;
  classifierSide?: HandednessSide;
  indexSource?: 'clasificador' | 'geométrico' | 'ambos' | 'ninguno';
  isStepDisarmed?: boolean;
  pulseArrow?: 'left' | 'right' | null;
  handRaisedState?: 'levantada' | 'abajo' | 'ninguna';
  handsRaisedSummary?: string;
  // Propiedades v4.2
  anchorOffsetSw?: number | null;
  swWidth?: number | null;
  stepBlockedReason?: StepBlockedReason;
}

export interface HandCursorTakeEvent {
  type: 'take';
  index: number;
  method?: 'hand_dwell' | 'hand_point';
}

export interface HandCursorStepEvent {
  type: 'step';
  index: number;
  direction: 'left' | 'right';
}

export interface HandCursorLiveEvent {
  type: 'live';
}

export type HandCursorEvent =
  | HandCursorTakeEvent
  | HandCursorStepEvent
  | HandCursorLiveEvent;

export interface HandFrameOutput {
  cursor: HandCursorData;
  events: HandCursorEvent[];
  userHandsCount: number;
  detectedHandsCount: number;
}

/**
 * Calcula el siguiente estado de palanca aplicando histéresis:
 * Neutral -> Lento: |d| >= 0.30, Lento -> Neutral: |d| < 0.22
 * Lento -> Rápido: |d| >= 0.75, Rápido -> Lento: |d| < 0.65
 */
export function computeLeverState(current: LeverState, d: number): LeverState {
  const absD = Math.abs(d);
  const sign = d >= 0 ? 1 : -1;

  if (current === 'neutral') {
    if (absD >= LEVER_FAST) {
      return sign > 0 ? 'fast_right' : 'fast_left';
    }
    if (absD >= LEVER_DEAD) {
      return sign > 0 ? 'slow_right' : 'slow_left';
    }
    return 'neutral';
  }

  const isCurrentRight = current.endsWith('right');
  const isCurrentFast = current.startsWith('fast');

  // Si cambia de signo respecto a la dirección actual
  const currentSign = isCurrentRight ? 1 : -1;
  if (sign !== currentSign && absD >= LEVER_DEAD_HYST) {
    // Cruza hacia el otro lado
    if (absD >= LEVER_FAST) {
      return sign > 0 ? 'fast_right' : 'fast_left';
    }
    if (absD >= LEVER_DEAD) {
      return sign > 0 ? 'slow_right' : 'slow_left';
    }
    return 'neutral';
  }

  // Misma dirección (o absD muy bajo):
  if (isCurrentFast) {
    if (absD < LEVER_DEAD_HYST) {
      return 'neutral';
    }
    if (absD < LEVER_FAST_HYST) {
      return isCurrentRight ? 'slow_right' : 'slow_left';
    }
    return isCurrentRight ? 'fast_right' : 'fast_left';
  }

  // Está en slow
  if (absD < LEVER_DEAD_HYST) {
    return 'neutral';
  }
  if (absD >= LEVER_FAST) {
    return isCurrentRight ? 'fast_right' : 'fast_left';
  }
  return isCurrentRight ? 'slow_right' : 'slow_left';
}

function euclideanDist(p1: HandLandmarkPoint, p2: HandLandmarkPoint): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Detección geométrica del índice levantado usando los 21 landmarks de la mano (Sección 3):
 * - "índice extendido": tip 8 to wrist 0 >= 1.6 * knuckle 5 to wrist 0, y tip 8 por encima (y menor) de PIP 6.
 * - "resto recogido": tips 12, 16, 20 to wrist 0 < 1.15 * knuckles 9, 13, 17 to wrist 0.
 */
export function detectGeometricIndex(landmarks?: HandLandmarkPoint[]): boolean {
  if (!landmarks || landmarks.length < 21) {
    return false;
  }
  const wrist = landmarks[0]!;
  const indexKnuckle = landmarks[5]!;
  const indexPip = landmarks[6]!;
  const indexTip = landmarks[8]!;

  const dWristKnuckle = euclideanDist(wrist, indexKnuckle);
  const dWristTip = euclideanDist(wrist, indexTip);

  // 1. Índice extendido: d(0,8) >= 1.6 * d(0,5) y tip.y < pip.y (en coords de pantalla/imagen y crece hacia abajo)
  if (dWristKnuckle <= 0 || dWristTip < 1.6 * dWristKnuckle || indexTip.y >= indexPip.y) {
    return false;
  }

  // 2. Resto recogido: puntas 12, 16, 20 to wrist 0 < 1.15 * nudillos 9, 13, 17 to wrist 0
  const otherKnuckles = [landmarks[9]!, landmarks[13]!, landmarks[17]!];
  const otherTips = [landmarks[12]!, landmarks[16]!, landmarks[20]!];

  for (let i = 0; i < 3; i++) {
    const dKnuckle = euclideanDist(wrist, otherKnuckles[i]!);
    const dTip = euclideanDist(wrist, otherTips[i]!);
    if (dTip >= 1.15 * dKnuckle) {
      return false;
    }
  }

  return true;
}

/**
 * Determina el lado de la persona (Left/Right) según el cuerpo/pose (Sección 2bis):
 * Muñeca del pose más cercana al landmark 0 (wrist) de la mano.
 * Si no hay muñecas disponibles, compara la posición x de la muñeca respecto a user.cx (en coordenadas de pantalla espejada).
 */
export function computeHandPoseSide(
  handWrist: HandLandmarkPoint,
  user: HandFrameUser | null,
): HandPoseSide {
  if (!user) return 'None';

  let dLeft = Infinity;
  let dRight = Infinity;

  if (user.lockedWrists.left) {
    dLeft = euclideanDist(handWrist, user.lockedWrists.left);
  }
  if (user.lockedWrists.right) {
    dRight = euclideanDist(handWrist, user.lockedWrists.right);
  }

  if (Number.isFinite(dLeft) || Number.isFinite(dRight)) {
    if (dLeft < dRight) return 'Left';
    if (dRight < dLeft) return 'Right';
    return 'None';
  }

  // Fallback por posición respecto a user.cx en pantalla espejada (x menor = izquierda de pantalla = persona izquierda)
  if (typeof user.cx === 'number') {
    // handWrist viene en coordenadas visibles SIN espejar; user.cx viene ESPEJADO (1 - cx).
    const screenX = 1 - handWrist.x;
    return screenX < user.cx ? 'Left' : 'Right';
  }

  return 'None';
}

/**
 * Filtra las manos detectadas para encontrar las pertenecientes al usuario fijado.
 * Reglas v2 & v3:
 * 1. ownerDist = max(0.06, 0.6 * sw) por muñecas si existen
 * 2. Continuidad si no hay match por muñeca
 * 3. Box fallback si no hay lockedWrists
 * Para seleccionar activeHand:
 * - Si lockedHandSide está definido ('Left' | 'Right'), se busca coincidencia de lateralidad en userHands
 * - Si además hay lockedHandPalmCenter, se busca por cercanía a esa mano anterior (<= 0.5 * sw)
 * - Si no hay coincidencia con la mano fijada o no había candado, se usa la más alta (menor y)
 */
export function selectUserHand(
  hands: DetectedHandInput[],
  user: HandFrameUser | null,
  lastUserPalmCenter?: HandLandmarkPoint | null,
  lockedHandSide?: HandednessSide | null,
  lockedHandPalmCenter?: HandLandmarkPoint | null,
): {
  userHands: DetectedHandInput[];
  activeHand: DetectedHandInput | null;
  reason: OwnerMatchReason;
} {
  if (!user || hands.length === 0) {
    return { userHands: [], activeHand: null, reason: 'none' };
  }

  const sw = user.sw > 0 ? user.sw : 0.2;
  const ownerDist = Math.max(0.06, 0.6 * sw);

  let userHands: DetectedHandInput[] = [];
  let reason: OwnerMatchReason = 'none';

  // 1. Por muñecas si alguna existe
  const hasLockedWrists = Boolean(user.lockedWrists.left || user.lockedWrists.right);
  if (hasLockedWrists) {
    const wristMatches = hands.filter((h) => {
      let minDist = Infinity;
      if (user.lockedWrists.left) {
        minDist = Math.min(minDist, euclideanDist(h.wrist, user.lockedWrists.left));
      }
      if (user.lockedWrists.right) {
        minDist = Math.min(minDist, euclideanDist(h.wrist, user.lockedWrists.right));
      }
      return minDist <= ownerDist;
    });

    if (wristMatches.length > 0) {
      userHands = wristMatches;
      reason = 'wrist';
    }
  }

  // 2. Continuidad si teníamos una posición anterior conocida de la mano del usuario
  if (userHands.length === 0 && lastUserPalmCenter) {
    const continuityMaxDist = 0.5 * sw;
    const continuityMatches = hands.filter(
      (h) => euclideanDist(h.palmCenter, lastUserPalmCenter) <= continuityMaxDist,
    );

    if (continuityMatches.length > 0) {
      userHands = continuityMatches;
      reason = 'continuity';
    }
  }

  // 3. Fallback por bounding box si lockedWrists son null y hay una sola mano dentro del recuadro
  if (userHands.length === 0 && !hasLockedWrists && user.box) {
    const box = user.box;
    const handsInBox = hands.filter(
      (h) =>
        h.palmCenter.x >= box.minX &&
        h.palmCenter.x <= box.maxX &&
        h.palmCenter.y >= box.minY &&
        h.palmCenter.y <= box.maxY,
    );

    if (handsInBox.length === 1) {
      userHands = handsInBox;
      reason = 'box';
    }
  }

  if (userHands.length === 0) {
    return { userHands: [], activeHand: null, reason: 'none' };
  }

  // Selección de activeHand con respeto al candado de mano activa (v3)
  if (lockedHandSide && lockedHandSide !== 'None') {
    const sideMatches = userHands.filter((h) => h.handedness === lockedHandSide);
    if (sideMatches.length > 0) {
      if (lockedHandPalmCenter) {
        const sortedByDist = [...sideMatches].sort(
          (a, b) =>
            euclideanDist(a.palmCenter, lockedHandPalmCenter) -
            euclideanDist(b.palmCenter, lockedHandPalmCenter),
        );
        return { userHands, activeHand: sortedByDist[0] ?? null, reason };
      }
      const sortedByY = [...sideMatches].sort((a, b) => a.palmCenter.y - b.palmCenter.y);
      return { userHands, activeHand: sortedByY[0] ?? null, reason };
    }
  }

  // Si no hay match por side pero hay lockedHandPalmCenter por cercanía (continuidad espacial directa <= 0.5 * sw)
  if (lockedHandPalmCenter) {
    const continuityCandidate = userHands.find(
      (h) => euclideanDist(h.palmCenter, lockedHandPalmCenter) <= 0.5 * sw,
    );
    if (continuityCandidate) {
      return { userHands, activeHand: continuityCandidate, reason };
    }
  }

  // Fallback estándar: la mano más alta de las del usuario
  const sorted = [...userHands].sort((a, b) => a.palmCenter.y - b.palmCenter.y);
  return { userHands, activeHand: sorted[0] ?? null, reason };
}

export interface HandCursorTrackerOptions {
  enableDwell?: boolean;
  useAbsoluteMapping?: boolean;
  mode?: 'step' | 'lever';
  isLiveAvailable?: boolean;
  isLiveActive?: boolean;
}

/**
 * Estado interno mutable mantenido por HandCursorTracker (Mano v2 & v3).
 */

/**
 * Determina si una mano está LEVANTADA (v4.1 §3.1).
 * - Muñeca del pose del mismo lado por encima del codo: wrist.y < elbow.y - 0.02 (y crece hacia abajo).
 * - Si el codo no es visible (visibility < 0.5), respaldo: palmCenter.y por encima de la cadera (23/24) - 0.10.
 * - Sin caderas: palmCenter.y por encima del punto medio entre hombros y borde inferior (1.0).
 */
export function isHandRaised(
  hand: DetectedHandInput,
  user: HandFrameUser | null,
): boolean {
  if (!user) {
    return hand.palmCenter.y < 0.65;
  }

  const poseSide = computeHandPoseSide(hand.wrist, user);
  const sideKey: 'left' | 'right' =
    poseSide === 'Left'
      ? 'left'
      : poseSide === 'Right'
        ? 'right'
        : 1 - hand.wrist.x < user.cx
          ? 'left'
          : 'right';

  const poseWrist = user.lockedWrists ? user.lockedWrists[sideKey] : null;
  const elbow = user.lockedElbows ? user.lockedElbows[sideKey] : null;

  const isElbowVisible =
    elbow !== null &&
    elbow !== undefined &&
    (elbow.visibility === undefined || elbow.visibility >= 0.5);

  if (isElbowVisible && elbow) {
    const wristY = poseWrist ? poseWrist.y : hand.wrist.y;
    return wristY < elbow.y - 0.02;
  }

  const hip = user.lockedHips ? user.lockedHips[sideKey] : null;
  const isHipVisible =
    hip !== null &&
    hip !== undefined &&
    (hip.visibility === undefined || hip.visibility >= 0.5);

  if (isHipVisible && hip) {
    return hand.palmCenter.y < hip.y - 0.1;
  }

  const shouldersY = user.shouldersY ?? (user.box ? user.box.minY : 0.3);
  const mid = (shouldersY + 1.0) / 2;
  return hand.palmCenter.y < mid;
}

export class HandCursorTracker {
  private active = false;
  private x = 0.5;
  private y = 0.5;
  private index: number | null = null;
  private dwellProgress = 0;
  private gesture = 'None';

  private lastValidHandMs = 0;
  private activationHistory: Array<{ time: number; valid: boolean }> = [];
  private sampleIntervals: number[] = [];
  private lastUpdateMs: number | null = null;

  private xFilter = new OneEuroFilter({ fcmin: 1.0, beta: 0.007 });
  private yFilter = new OneEuroFilter({ fcmin: 1.0, beta: 0.007 });

  private isArmed = true;
  private dwellStartMs = 0;
  private hadOpenPalmDuringStable = false;
  private gestureHistory: Array<{ time: number; gesture: string; score: number }> = [];
  private pointingStartMs: number | null = null;

  // Estado v2 & v3
  private anchorX: number | null = null;
  private anchorOffset: number | null = null;
  private lastUserPalmCenter: HandLandmarkPoint | null = null;
  private leverState: LeverState = 'neutral';
  private leverEnteredMs: number | null = null;
  private lastStepMs: number = 0;
  private confirmAccumulatedMs = 0;
  private confirmLastSeenMs: number | null = null;
  private lastPointingMs: number | null = null;
  private notPointingSinceMs: number | null = null;
  private confirmProgress = 0;
  private lastOwnerReason: OwnerMatchReason = 'none';
  private confirmedWithPointing = false;

  // Candado de mano activa (v3)
  private lockedHandSide: HandednessSide = 'None';
  private lockedHandLastSeenMs: number | null = null;
  private lockedHandPalmCenter: HandLandmarkPoint | null = null;
  private handSwitchCount = 0;

  // Estado v4
  private v4ActivePalmCenter: HandLandmarkPoint | null = null;
  private v4AlternativeValidSinceMs: number | null = null;
  private v4PoseSide: HandPoseSide = 'None';
  private v4ClassifierSide: HandednessSide = 'None';
  private v4IndexSource: 'clasificador' | 'geométrico' | 'ambos' | 'ninguno' = 'ninguno';

  // Disparador de pasos v4
  private v4StepDisarmed = false;
  private v4NeutralSinceMs: number | null = null;
  private v4LastStepTriggeredMs = 0;
  private v4BeyondThresholdSinceMs: number | null = null;
  private v4BeyondThresholdFrames = 0;
  private v4PendingDirection: 'left' | 'right' | null = null;
  private v4PulseArrow: 'left' | 'right' | null = null;
  private v4PulseUntilMs = 0;

  // Confirmación Live con Índice v4
  private v4LiveAccumulatedMs = 0;
  private v4LiveLastSeenMs: number | null = null;
  private v4LiveDisarmed = false;
  private v4LiveNotPointingSinceMs: number | null = null;

  // Estado v4.2
  private anchorOffsetSw: number | null = null;
  private anchorSwWidth: number | null = null;
  private lastUserPersonId: string | number | null = null;
  private v4DisarmedSinceMs: number | null = null;
  private lastLiveActive = false;

  private options: HandCursorTrackerOptions;

  constructor(options?: HandCursorTrackerOptions) {
    this.options = {
      enableDwell: options?.enableDwell ?? false,
      useAbsoluteMapping: options?.useAbsoluteMapping ?? false,
      mode: options?.mode,
      isLiveAvailable: options?.isLiveAvailable ?? false,
      isLiveActive: options?.isLiveActive ?? false,
    };
  }

  setOptions(opts: Partial<HandCursorTrackerOptions>): void {
    this.options = { ...this.options, ...opts };
  }

  private reanchor(x: number, user?: HandFrameUser | null, swWidth = 0.2): void {
    this.anchorX = x;
    this.anchorSwWidth = swWidth;
    if (user && swWidth > 0) {
      this.anchorOffsetSw = (x - user.cx) / swWidth;
      this.anchorOffset = x - user.cx;
      if (user.userId != null) {
        this.lastUserPersonId = user.userId;
      }
    } else {
      this.anchorOffsetSw = 0;
      this.anchorOffset = 0;
    }
    this.v4StepDisarmed = false;
    this.v4DisarmedSinceMs = null;
    this.v4NeutralSinceMs = null;
    this.v4BeyondThresholdSinceMs = null;
    this.v4BeyondThresholdFrames = 0;
    this.v4PendingDirection = null;
  }

  reset(): void {
    this.active = false;
    this.x = 0.5;
    this.y = 0.5;
    this.index = null;
    this.dwellProgress = 0;
    this.gesture = 'None';
    this.lastValidHandMs = 0;
    this.activationHistory = [];
    this.sampleIntervals = [];
    this.lastUpdateMs = null;
    this.xFilter.reset();
    this.yFilter.reset();
    this.isArmed = true;
    this.dwellStartMs = 0;
    this.hadOpenPalmDuringStable = false;
    this.gestureHistory = [];
    this.pointingStartMs = null;

    // Reset v2 & v3
    this.anchorX = null;
    this.anchorOffset = null;
    this.lastUserPalmCenter = null;
    this.leverState = 'neutral';
    this.leverEnteredMs = null;
    this.lastStepMs = 0;
    this.confirmAccumulatedMs = 0;
    this.confirmLastSeenMs = null;
    this.lastPointingMs = null;
    this.notPointingSinceMs = null;
    this.confirmProgress = 0;
    this.lastOwnerReason = 'none';
    this.confirmedWithPointing = false;
    this.lockedHandSide = 'None';
    this.lockedHandLastSeenMs = null;
    this.lockedHandPalmCenter = null;
    this.handSwitchCount = 0;

    // Reset v4
    this.v4ActivePalmCenter = null;
    this.v4AlternativeValidSinceMs = null;
    this.v4PoseSide = 'None';
    this.v4ClassifierSide = 'None';
    this.v4IndexSource = 'ninguno';
    this.v4StepDisarmed = false;
    this.v4NeutralSinceMs = null;
    this.v4LastStepTriggeredMs = 0;
    this.v4BeyondThresholdSinceMs = null;
    this.v4BeyondThresholdFrames = 0;
    this.v4PendingDirection = null;
    this.v4PulseArrow = null;
    this.v4PulseUntilMs = 0;
    this.v4LiveAccumulatedMs = 0;
    this.v4LiveLastSeenMs = null;
    this.v4LiveDisarmed = false;
    this.v4LiveNotPointingSinceMs = null;

    // Reset v4.2
    this.anchorOffsetSw = null;
    this.anchorSwWidth = null;
    this.lastUserPersonId = null;
    this.v4DisarmedSinceMs = null;
    this.lastLiveActive = false;
  }

  update(input: HandFrameInput): HandFrameOutput {
    const effectiveMode =
      input.mode ?? this.options.mode ?? (isHandLeverModeEnabled() ? 'lever' : 'step');

    if (effectiveMode === 'lever') {
      return this.updateLever(input);
    }
    return this.updateStep(input);
  }

  private updateLever(input: HandFrameInput): HandFrameOutput {
    const {
      nowMs,
      hands,
      user,
      itemCount,
      busy = false,
      pausedUntilMs = 0,
      currentIndex,
      enableDwell = this.options.enableDwell,
      useAbsoluteMapping = this.options.useAbsoluteMapping,
      isLiveActive = this.options.isLiveActive ?? false,
    } = input;
    const isPaused = busy || pausedUntilMs > nowMs || isLiveActive;
    const events: HandCursorEvent[] = [];

    // Medición de intervalos de muestreo observados
    const prevUpdateMs = this.lastUpdateMs;
    if (this.lastUpdateMs !== null) {
      const dt = nowMs - this.lastUpdateMs;
      if (dt > 0 && dt <= 1000) {
        this.sampleIntervals.push(dt);
        if (this.sampleIntervals.length > 10) {
          this.sampleIntervals.shift();
        }
      }
    }
    this.lastUpdateMs = nowMs;

    const observedIntervalMs =
      this.sampleIntervals.length > 0
        ? this.sampleIntervals.reduce((a, b) => a + b, 0) / this.sampleIntervals.length
        : 100;
    const effectiveDeactivationTimeoutMs = Math.max(
      DEACTIVATION_TIMEOUT_MS,
      2 * observedIntervalMs,
    );

    // a) Dueño de la mano con continuidad y candado
    const isLockActive =
      this.lockedHandLastSeenMs !== null &&
      nowMs - this.lockedHandLastSeenMs <= HAND_LOCK_TIMEOUT_MS;

    const queryLockedSide = isLockActive ? this.lockedHandSide : null;
    const queryLockedCenter = isLockActive ? this.lockedHandPalmCenter : null;

    const {
      userHands,
      activeHand: candidateHand,
      reason: ownerReason,
    } = selectUserHand(
      hands,
      user,
      this.lastUserPalmCenter,
      queryLockedSide,
      queryLockedCenter,
    );
    this.lastOwnerReason = ownerReason;
    const detectedHandsCount = hands.length;
    const userHandsCount = userHands.length;

    let activeHand: DetectedHandInput | null = null;
    let freezeInteraction = false;

    // Gestión del candado de mano activa y cambio de mano (v3)
    if (this.active) {
      const sw = user && user.sw > 0 ? user.sw : 0.2;
      const lockedMatch = userHands.find((h) => {
        if (this.lockedHandSide !== 'None' && h.handedness && h.handedness !== 'None') {
          return h.handedness === this.lockedHandSide;
        }
        if (this.lockedHandSide === 'None' || !h.handedness || h.handedness === 'None') {
          if (userHands.length === 1) {
            return true;
          }
        }
        if (
          this.lockedHandPalmCenter !== null &&
          euclideanDist(h.palmCenter, this.lockedHandPalmCenter) <= 0.5 * sw
        ) {
          return true;
        }
        return false;
      });

      if (lockedMatch) {
        // La mano bloqueada sigue presente: operación normal
        activeHand = lockedMatch;
        if (activeHand.handedness && activeHand.handedness !== 'None') {
          this.lockedHandSide = activeHand.handedness;
        }
        this.lockedHandLastSeenMs = nowMs;
        this.lockedHandPalmCenter = activeHand.palmCenter;
        this.lastUserPalmCenter = activeHand.palmCenter;
        this.lastValidHandMs = nowMs;
      } else if (userHands.length > 0) {
        // La mano bloqueada no está en este cuadro, pero hay otra mano del usuario presente
        const timeSinceLockedSeen =
          this.lockedHandLastSeenMs !== null
            ? nowMs - this.lockedHandLastSeenMs
            : Infinity;

        if (timeSinceLockedSeen <= HAND_LOCK_TIMEOUT_MS) {
          // Candado de 500 ms de la mano original corriendo: refrescar lastValidHandMs
          // (cursor sigue activo), pero SIN mover la palanca ni la confirmación.
          this.lastValidHandMs = nowMs;
          freezeInteraction = true;
          activeHand = null;
        } else {
          // Superó los 500 ms: CAMBIO DE MANO
          const newHand = candidateHand ?? userHands[0]!;
          activeHand = newHand;
          this.handSwitchCount++;
          this.lockedHandSide = newHand.handedness ?? 'None';
          this.lockedHandLastSeenMs = nowMs;
          this.lockedHandPalmCenter = newHand.palmCenter;
          this.lastUserPalmCenter = newHand.palmCenter;
          this.lastValidHandMs = nowMs;

          // Re-anclar en la nueva mano, leverState = neutral, índice sin cambios
          const rawNewX = 1 - newHand.palmCenter.x;
          this.x = rawNewX;
          this.y = newHand.palmCenter.y;
          this.xFilter.reset();
          this.yFilter.reset();
          this.anchorX = rawNewX;
          if (user) {
            this.anchorOffset = rawNewX - user.cx;
          }
          this.leverState = 'neutral';
          this.leverEnteredMs = null;
          this.lastStepMs = 0;
          this.confirmAccumulatedMs = 0;
          this.confirmLastSeenMs = null;
          this.lastPointingMs = null;
          this.confirmProgress = 0;
        }
      } else {
        // No hay manos del usuario en este cuadro
        activeHand = null;
      }
    } else {
      // Inactivo: candidateHand se usa para posible activación
      activeHand = candidateHand;
      if (activeHand) {
        this.lastUserPalmCenter = activeHand.palmCenter;
      }
    }

    // b) Activación: ventana de 250 ms (Open_Palm o Pointing_Up con score >= 0.5)
    const isValidGesture =
      activeHand !== null &&
      (activeHand.gesture === 'Open_Palm' || activeHand.gesture === 'Pointing_Up') &&
      activeHand.score >= GESTURE_SCORE_MIN;

    this.activationHistory.push({ time: nowMs, valid: isValidGesture });
    this.activationHistory = this.activationHistory.filter((h) => h.time >= nowMs - 1000);

    const cutoff250 = nowMs - ACTIVATION_WINDOW_MS;
    const insideIndices = [];
    for (let i = 0; i < this.activationHistory.length; i++) {
      if (this.activationHistory[i]!.time >= cutoff250) {
        insideIndices.push(i);
      }
    }
    let effectiveWindow: Array<{ time: number; valid: boolean }> = [];
    if (insideIndices.length > 0) {
      const firstInsideIdx = insideIndices[0]!;
      const startIdx = firstInsideIdx > 0 ? firstInsideIdx - 1 : firstInsideIdx;
      effectiveWindow = this.activationHistory.slice(startIdx);
    } else if (this.activationHistory.length > 0) {
      effectiveWindow = [this.activationHistory[this.activationHistory.length - 1]!];
    }

    const windowSpan =
      effectiveWindow.length > 1 && effectiveWindow[0]
        ? nowMs - effectiveWindow[0].time
        : 0;
    const validCount = effectiveWindow.filter((h) => h.valid).length;
    const validRatio =
      effectiveWindow.length > 0 ? validCount / effectiveWindow.length : 0;

    const last3 = this.activationHistory.slice(-3);
    const last3Span = last3.length === 3 ? nowMs - last3[0]!.time : 0;
    const last3AreValidLowFps =
      last3.length === 3 && last3.every((h) => h.valid) && last3Span >= 200;
    const shouldActivate =
      (windowSpan >= ACTIVATION_WINDOW_MS && validRatio >= ACTIVATION_RATIO) ||
      last3AreValidLowFps;

    let justActivated = false;
    if (!this.active) {
      if (shouldActivate) {
        this.active = true;
        justActivated = true;
        this.lastValidHandMs = nowMs;
        this.dwellStartMs = nowMs;
        this.isArmed = true;
        this.hadOpenPalmDuringStable = false;
        this.gestureHistory = [];
        this.pointingStartMs = null;
        this.confirmAccumulatedMs = 0;
        this.confirmLastSeenMs = null;
        this.lastPointingMs = null;
        this.notPointingSinceMs = null;
        this.confirmProgress = 0;

        // Fijar candado inicial de mano
        if (activeHand) {
          this.lockedHandSide = activeHand.handedness ?? 'None';
          this.lockedHandLastSeenMs = nowMs;
          this.lockedHandPalmCenter = activeHand.palmCenter;
        }
      }
    } else {
      if (userHandsCount > 0 || activeHand !== null) {
        this.lastValidHandMs = nowMs;
      } else if (nowMs - this.lastValidHandMs >= effectiveDeactivationTimeoutMs) {
        this.active = false;
        this.dwellProgress = 0;
        this.confirmProgress = 0;
        this.isArmed = true;
        this.hadOpenPalmDuringStable = false;
        this.gestureHistory = [];
        this.activationHistory = [];
        this.pointingStartMs = null;
        this.anchorX = null;
        this.anchorOffset = null;
        this.lastUserPalmCenter = null;
        this.leverState = 'neutral';
        this.leverEnteredMs = null;
        this.lastStepMs = 0;
        this.confirmAccumulatedMs = 0;
        this.confirmLastSeenMs = null;
        this.lastPointingMs = null;
        this.notPointingSinceMs = null;
        this.lockedHandSide = 'None';
        this.lockedHandLastSeenMs = null;
        this.lockedHandPalmCenter = null;
        this.xFilter.reset();
        this.yFilter.reset();
      }
    }

    // c) Posición y Suavizado
    if (activeHand && !freezeInteraction) {
      this.gesture = activeHand.gesture;
      const rawX = 1 - activeHand.palmCenter.x; // Espejado
      const rawY = activeHand.palmCenter.y;
      this.x = this.xFilter.filter(rawX, nowMs);
      this.y = this.yFilter.filter(rawY, nowMs);
    } else if (!this.active) {
      this.gesture = 'None';
    }

    // 2.1 Ancla: al activarse el cursor, la posición x suavizada en ese instante es el ancla
    if (justActivated) {
      this.anchorX = this.x;
      if (user) {
        this.anchorOffset = this.x - user.cx;
      }
      // El foco queda en la prenda que ya estaba enfocada o la del centro
      if (
        typeof currentIndex === 'number' &&
        currentIndex >= 0 &&
        currentIndex < itemCount
      ) {
        this.index = currentIndex;
      } else if (itemCount > 0) {
        this.index = Math.floor(itemCount / 2);
      }
      this.leverState = 'neutral';
      this.leverEnteredMs = null;
    } else if (this.active && this.anchorX === null) {
      this.anchorX = this.x;
      if (user) {
        this.anchorOffset = this.x - user.cx;
      }
    } else if (
      this.active &&
      this.anchorX !== null &&
      user &&
      this.anchorOffset !== null
    ) {
      // Ancla relativa al cuerpo (v3): sigue a user.cx
      this.anchorX = user.cx + this.anchorOffset;
    }

    // d) Mapeo a prenda y Palanca con histéresis (v3)
    const swWidth = user && user.sw > 0 ? user.sw : 0.2;
    let d = 0;
    let directionArrow: 'left' | 'right' | null = null;

    if (useAbsoluteMapping) {
      // Mapeo absoluto legacy para tests existentes si useAbsoluteMapping es true
      if (user && itemCount > 0) {
        const inicio = user.cx - REACH * user.sw;
        const ancho = 2 * REACH * user.sw;
        if (ancho > 0) {
          const t = clamp((this.x - inicio) / ancho, 0, 0.999);
          const bandW = 1 / itemCount;
          const rawIndex = clamp(Math.floor(t * itemCount), 0, itemCount - 1);
          const curIdx = this.index ?? 0;
          const currentBandLeft = curIdx * bandW;
          const currentBandRight = (curIdx + 1) * bandW;
          const hystMargin = HYSTERESIS_RATIO * bandW;

          if (t < currentBandLeft - hystMargin) {
            this.index = rawIndex;
            this.dwellStartMs = nowMs;
            this.isArmed = true;
            this.confirmedWithPointing = false;
          } else if (t > currentBandRight + hystMargin) {
            this.index = rawIndex;
            this.dwellStartMs = nowMs;
            this.isArmed = true;
            this.confirmedWithPointing = false;
          }
        }
      }
    } else if (this.active && this.anchorX !== null && itemCount > 0) {
      d = (this.x - this.anchorX) / swWidth;

      if (!freezeInteraction) {
        // Re-centrado suave (v3): mientras leverState === 'neutral', el ancla se acerca a la mano con tau = 2000 ms
        // Nunca si |d| >= 0.30 para no frenar desplazamientos sostenidos
        if (
          this.leverState === 'neutral' &&
          Math.abs(d) < LEVER_DEAD &&
          prevUpdateMs !== null
        ) {
          const frameDt = Math.max(0, Math.min(500, nowMs - prevUpdateMs));
          const alpha = 1 - Math.exp(-frameDt / 2000);
          this.anchorX = this.anchorX + alpha * (this.x - this.anchorX);
          if (user) {
            this.anchorOffset = this.anchorX - user.cx;
          }
          // Recalcular d tras recentrado suave
          d = (this.x - this.anchorX) / swWidth;
        }

        // Cálculo del nuevo leverState con histéresis
        const newLeverState = computeLeverState(this.leverState, d);

        if (newLeverState !== this.leverState) {
          const oldState = this.leverState;
          this.leverState = newLeverState;

          const isExitingNeutral = oldState === 'neutral';
          const oldIsRight = oldState.endsWith('right');
          const newIsRight = newLeverState.endsWith('right');
          const isDirectionChanged =
            oldState !== 'neutral' &&
            newLeverState !== 'neutral' &&
            oldIsRight !== newIsRight;

          if (isExitingNeutral || isDirectionChanged) {
            this.leverEnteredMs = nowMs;
            this.lastStepMs = 0;
          } else if (newLeverState === 'neutral') {
            this.leverEnteredMs = null;
          }
          // Si es transición slow <-> fast en la misma dirección, se conserva lastStepMs
        }
      }

      if (this.leverState === 'slow_right' || this.leverState === 'fast_right') {
        directionArrow = 'right';
      } else if (this.leverState === 'slow_left' || this.leverState === 'fast_left') {
        directionArrow = 'left';
      } else {
        directionArrow = null;
      }

      // Palanca de pasos: congelada si Pointing_Up está activo o interacción congelada (v3)
      const isPointingActive =
        activeHand !== null &&
        activeHand.gesture === 'Pointing_Up' &&
        activeHand.score >= GESTURE_SCORE_MIN;

      if (
        !freezeInteraction &&
        !isPointingActive &&
        this.leverState !== 'neutral' &&
        this.leverEnteredMs !== null
      ) {
        const timeInLever = nowMs - this.leverEnteredMs;
        const isFast =
          this.leverState === 'fast_left' || this.leverState === 'fast_right';
        const stepInterval = isFast ? STEP_FAST_MS : STEP_SLOW_MS;
        const isRight =
          this.leverState === 'slow_right' || this.leverState === 'fast_right';
        const delta = isRight ? 1 : -1;

        if (this.lastStepMs === 0) {
          // El primer paso ocurre 250 ms después de salir de la zona neutra
          if (timeInLever >= STEP_FIRST_DELAY_MS) {
            const currentIdx =
              typeof this.index === 'number'
                ? this.index
                : typeof currentIndex === 'number'
                  ? currentIndex
                  : 0;
            const nextIdx = clamp(currentIdx + delta, 0, itemCount - 1);
            if (nextIdx !== this.index) {
              this.index = nextIdx;
              this.isArmed = true; // cambio de foco rearma confirmación
              this.confirmedWithPointing = false;
              this.dwellStartMs = nowMs;
              this.confirmAccumulatedMs = 0;
              this.confirmLastSeenMs = null;
              this.lastPointingMs = null;
              this.confirmProgress = 0;
            }
            this.lastStepMs = nowMs;
          }
        } else {
          // Pasos subsiguientes cada stepInterval
          if (nowMs - this.lastStepMs >= stepInterval) {
            const currentIdx =
              typeof this.index === 'number'
                ? this.index
                : typeof currentIndex === 'number'
                  ? currentIndex
                  : 0;
            const nextIdx = clamp(currentIdx + delta, 0, itemCount - 1);
            if (nextIdx !== this.index) {
              this.index = nextIdx;
              this.isArmed = true;
              this.confirmedWithPointing = false;
              this.dwellStartMs = nowMs;
              this.confirmAccumulatedMs = 0;
              this.confirmLastSeenMs = null;
              this.lastPointingMs = null;
              this.confirmProgress = 0;
            }
            this.lastStepMs = nowMs;
          }
        }
      }
    }

    // Registro del gesto actual para el atajo legacy
    if (activeHand) {
      this.gestureHistory.push({
        time: nowMs,
        gesture: activeHand.gesture,
        score: activeHand.score,
      });
      this.gestureHistory = this.gestureHistory.filter((g) => g.time >= nowMs - 1000);

      if (activeHand.gesture === 'Open_Palm' && activeHand.score >= GESTURE_SCORE_MIN) {
        this.hadOpenPalmDuringStable = true;
        this.pointingStartMs = null;
      } else if (
        activeHand.gesture === 'Pointing_Up' &&
        activeHand.score >= GESTURE_SCORE_MIN
      ) {
        if (this.pointingStartMs === null) {
          this.pointingStartMs = nowMs;
        }
      } else {
        this.pointingStartMs = null;
      }
    }

    // Rearme tras confirmar (v3): cuando el gesto deja de ser Pointing_Up durante >= 300 ms (cualquier gesto o None)
    const isCurrentlyPointing =
      activeHand !== null &&
      activeHand.gesture === 'Pointing_Up' &&
      activeHand.score >= GESTURE_SCORE_MIN;

    if (!isCurrentlyPointing) {
      if (this.notPointingSinceMs === null) {
        this.notPointingSinceMs = nowMs;
      } else if (nowMs - this.notPointingSinceMs >= REARM_TIMEOUT_MS) {
        if (this.confirmedWithPointing) {
          this.isArmed = true;
          this.confirmedWithPointing = false;
        }
      }
    } else {
      this.notPointingSinceMs = null;
    }

    // g) Pausa o Inactivo
    if (isPaused || !this.active) {
      this.dwellProgress = 0;
      this.confirmProgress = 0;
      this.dwellStartMs = nowMs;
      this.confirmAccumulatedMs = 0;
      this.confirmLastSeenMs = null;
      this.lastPointingMs = null;
    } else {
      let eventFired = false;

      // 2.3 CONFIRMACIÓN EXPLÍCITA (v3: independiente de la palanca / neutral)
      if (!enableDwell) {
        if (!freezeInteraction && isCurrentlyPointing && this.isArmed) {
          if (this.lastPointingMs === null) {
            const initialDt =
              prevUpdateMs !== null
                ? Math.min(150, Math.max(0, nowMs - prevUpdateMs))
                : 0;
            this.confirmAccumulatedMs += initialDt;
            this.lastPointingMs = nowMs;
            this.confirmLastSeenMs = nowMs;
            this.confirmProgress = clamp(this.confirmAccumulatedMs / CONFIRM_MS, 0, 1);

            if (this.confirmAccumulatedMs >= CONFIRM_MS) {
              events.push({
                type: 'take',
                index: this.index ?? 0,
                method: 'hand_point',
              });
              this.isArmed = false;
              this.confirmedWithPointing = true;
              this.confirmProgress = 0;
              this.confirmAccumulatedMs = 0;
              this.confirmLastSeenMs = null;
              this.lastPointingMs = null;
              eventFired = true;

              // Re-anclar en la posición actual de la mano tras completar la confirmación (v3)
              this.anchorX = this.x;
              if (user) {
                this.anchorOffset = this.x - user.cx;
              }
              this.leverState = 'neutral';
              this.leverEnteredMs = null;
              this.lastStepMs = 0;
            }
          } else {
            const dt = nowMs - this.lastPointingMs;
            this.confirmAccumulatedMs += dt;
            this.lastPointingMs = nowMs;
            this.confirmLastSeenMs = nowMs;
            this.confirmProgress = clamp(this.confirmAccumulatedMs / CONFIRM_MS, 0, 1);

            if (this.confirmAccumulatedMs >= CONFIRM_MS) {
              events.push({
                type: 'take',
                index: this.index ?? 0,
                method: 'hand_point',
              });
              this.isArmed = false;
              this.confirmedWithPointing = true;
              this.confirmProgress = 0;
              this.confirmAccumulatedMs = 0;
              this.confirmLastSeenMs = null;
              this.lastPointingMs = null;
              eventFired = true;

              // Re-anclar en la posición actual de la mano tras completar la confirmación (v3)
              this.anchorX = this.x;
              if (user) {
                this.anchorOffset = this.x - user.cx;
              }
              this.leverState = 'neutral';
              this.leverEnteredMs = null;
              this.lastStepMs = 0;
            }
          }
        } else if (!freezeInteraction && this.confirmLastSeenMs !== null) {
          // Huecos breves / pérdida de gesto
          this.lastPointingMs = null;
          if (activeHand !== null && activeHand.gesture === 'Open_Palm') {
            // Con Open_Palm se cancela la confirmación de inmediato
            this.confirmAccumulatedMs = 0;
            this.confirmProgress = 0;
            this.confirmLastSeenMs = null;
          } else {
            const timeSinceSeen = nowMs - this.confirmLastSeenMs;
            if (timeSinceSeen > GAP_LOST_MAX_MS) {
              // Se pierde > 300 ms: el anillo vuelve a 0
              this.confirmAccumulatedMs = 0;
              this.confirmProgress = 0;
              this.confirmLastSeenMs = null;
            }
            // Si timeSinceSeen <= GAP_LOST_MAX_MS, se congela el confirmProgress
          }
        } else if (!freezeInteraction) {
          this.confirmAccumulatedMs = 0;
          this.confirmProgress = 0;
          this.lastPointingMs = null;
        }
      } else {
        // e) DWELL LEGACY (detrás de ?hand_dwell=1)
        if (this.isArmed) {
          const elapsed = nowMs - this.dwellStartMs;
          this.dwellProgress = clamp(elapsed / DWELL_MS, 0, 1);

          if (elapsed >= DWELL_MS) {
            events.push({
              type: 'take',
              index: this.index ?? 0,
              method: 'hand_dwell',
            });
            this.isArmed = false;
            this.dwellProgress = 0;
            eventFired = true;
          }
        } else {
          this.dwellProgress = 0;
        }

        // f) Atajo Pointing_Up legacy
        if (
          !eventFired &&
          this.hadOpenPalmDuringStable &&
          this.isArmed &&
          this.pointingStartMs !== null
        ) {
          if (nowMs - this.pointingStartMs >= SHORTCUT_WINDOW_MS) {
            const cutoffShortcut = nowMs - SHORTCUT_WINDOW_MS;
            const shortcutIndices = [];
            for (let i = 0; i < this.gestureHistory.length; i++) {
              if (this.gestureHistory[i]!.time >= cutoffShortcut) {
                shortcutIndices.push(i);
              }
            }
            let effectiveGestureWindow = this.gestureHistory;
            if (shortcutIndices.length > 0) {
              const firstIdx = shortcutIndices[0]!;
              const startIdx = firstIdx > 0 ? firstIdx - 1 : firstIdx;
              effectiveGestureWindow = this.gestureHistory.slice(startIdx);
            }
            const pointingCount = effectiveGestureWindow.filter(
              (g) => g.gesture === 'Pointing_Up' && g.score >= GESTURE_SCORE_MIN,
            ).length;
            const pointingRatio =
              effectiveGestureWindow.length > 0
                ? pointingCount / effectiveGestureWindow.length
                : 0;

            if (pointingRatio >= SHORTCUT_RATIO && this.gesture === 'Pointing_Up') {
              events.push({
                type: 'take',
                index: this.index ?? 0,
                method: 'hand_point',
              });
              this.isArmed = false;
              this.pointingStartMs = null;
              eventFired = true;
            }
          }
        }
      }
    }

    const effectiveProgress = enableDwell ? this.dwellProgress : this.confirmProgress;

    const publishedIndex =
      this.active && !isLiveActive
        ? this.index
        : typeof currentIndex === 'number' && currentIndex >= 0
          ? currentIndex
          : null;

    return {
      cursor: {
        active: this.active,
        x: this.x,
        y: this.y,
        index: publishedIndex,
        dwellProgress: effectiveProgress,
        gesture: this.gesture,
        anchorX: this.anchorX,
        displacement: d,
        leverState: this.leverState,
        directionArrow,
        confirmProgress: this.confirmProgress,
        ownerReason: this.lastOwnerReason,
        activeHandSide: this.lockedHandSide,
        handSwitchCount: this.handSwitchCount,
        anchorOffsetSw: this.anchorOffsetSw,
        swWidth: user?.sw ?? null,
        stepBlockedReason: this.active ? 'ninguno' : 'sin cursor',
      },
      events,
      userHandsCount,
      detectedHandsCount,
    };
  }

  /**
   * Implementación Mano v4: Paso por Gesto, Identidad por Pose y Live con Índice
   */
  private updateStep(input: HandFrameInput): HandFrameOutput {
    const {
      nowMs,
      hands,
      user,
      itemCount,
      busy = false,
      pausedUntilMs = 0,
      currentIndex,
      isLiveAvailable = this.options.isLiveAvailable ?? false,
      isLiveActive = this.options.isLiveActive ?? false,
    } = input;
    const isPaused = busy || pausedUntilMs > nowMs || isLiveActive;
    const events: HandCursorEvent[] = [];

    const liveSessionJustEnded = this.lastLiveActive && !isLiveActive;
    this.lastLiveActive = isLiveActive;

    if (liveSessionJustEnded) {
      // 3.3 Al terminar la sesión: re-anclar en la posición actual, re-armar, y sincronizar
      // el índice del tracker con la prenda puesta (activeGarment)
      const swWidth = user && user.sw > 0 ? user.sw : 0.2;
      this.reanchor(this.x, user, swWidth);
      if (
        typeof currentIndex === 'number' &&
        currentIndex >= 0 &&
        currentIndex < itemCount
      ) {
        this.index = currentIndex;
      }
    }

    // Muestreo de intervalos observados
    const prevUpdateMs = this.lastUpdateMs;
    if (this.lastUpdateMs !== null) {
      const dt = nowMs - this.lastUpdateMs;
      if (dt > 0 && dt <= 1000) {
        this.sampleIntervals.push(dt);
        if (this.sampleIntervals.length > 10) {
          this.sampleIntervals.shift();
        }
      }
    }
    this.lastUpdateMs = nowMs;

    const observedIntervalMs =
      this.sampleIntervals.length > 0
        ? this.sampleIntervals.reduce((a, b) => a + b, 0) / this.sampleIntervals.length
        : 100;
    const effectiveDeactivationTimeoutMs = Math.max(
      DEACTIVATION_TIMEOUT_MS,
      2 * observedIntervalMs,
    );

    const sw = user && user.sw > 0 ? user.sw : 0.2;
    const ownerDist = Math.max(0.06, 0.6 * sw);

    // 1. Filtrar manos pertenecientes al usuario (por muñecas de pose, continuidad o bounding box)
    let userHands: DetectedHandInput[] = [];
    let reason: OwnerMatchReason = 'none';

    if (user && hands.length > 0) {
      const hasLockedWrists = Boolean(user.lockedWrists.left || user.lockedWrists.right);
      if (hasLockedWrists) {
        const wristMatches = hands.filter((h) => {
          let minDist = Infinity;
          if (user.lockedWrists.left) {
            minDist = Math.min(minDist, euclideanDist(h.wrist, user.lockedWrists.left));
          }
          if (user.lockedWrists.right) {
            minDist = Math.min(minDist, euclideanDist(h.wrist, user.lockedWrists.right));
          }
          return minDist <= ownerDist;
        });
        if (wristMatches.length > 0) {
          userHands = wristMatches;
          reason = 'wrist';
        }
      }

      if (userHands.length === 0 && this.v4ActivePalmCenter) {
        const continuityMatches = hands.filter(
          (h) => euclideanDist(h.palmCenter, this.v4ActivePalmCenter!) <= 0.5 * sw,
        );
        if (continuityMatches.length > 0) {
          userHands = continuityMatches;
          reason = 'continuity';
        }
      }

      if (userHands.length === 0 && !hasLockedWrists && user.box) {
        const box = user.box;
        const boxMatches = hands.filter(
          (h) =>
            h.palmCenter.x >= box.minX &&
            h.palmCenter.x <= box.maxX &&
            h.palmCenter.y >= box.minY &&
            h.palmCenter.y <= box.maxY,
        );
        if (boxMatches.length === 1) {
          userHands = boxMatches;
          reason = 'box';
        }
      }
    }

    this.lastOwnerReason = reason;
    const detectedHandsCount = hands.length;

    // Mano v4.1 §3.1: Solo cuentan las manos LEVANTADAS
    // Las manos NO levantadas se ignoran por completo (no activan, no compiten, no disparan pasos)
    userHands = userHands.filter((h) => isHandRaised(h, user));
    const userHandsCount = userHands.length;

    // Helper: comprobar si un gesto es válido (palma abierta o índice)
    const isGestureValid = (h: DetectedHandInput): boolean => {
      const isClassifierPoint = h.gesture === 'Pointing_Up' && h.score >= 0.4;
      const isGeomPoint = detectGeometricIndex(h.landmarks);
      const isIndex = isClassifierPoint || isGeomPoint;
      const isOpenPalm = h.gesture === 'Open_Palm' && h.score >= GESTURE_SCORE_MIN;
      return isOpenPalm || isIndex;
    };

    // 2. Selección y seguimiento de la mano activa por continuidad espacial (palmCenter <= 0.5 * sw)
    let activeHand: DetectedHandInput | null = null;

    if (this.active) {
      if (this.v4ActivePalmCenter !== null) {
        // Buscar coincidencia espacial de la mano activa
        const continuityMatches = userHands.filter(
          (h) => euclideanDist(h.palmCenter, this.v4ActivePalmCenter!) <= 0.5 * sw,
        );
        if (continuityMatches.length > 0) {
          // Ordenar por distancia más cercana a la posición anterior
          continuityMatches.sort(
            (a, b) =>
              euclideanDist(a.palmCenter, this.v4ActivePalmCenter!) -
              euclideanDist(b.palmCenter, this.v4ActivePalmCenter!),
          );
          activeHand = continuityMatches[0]!;
        }
      }

      // Si no hubo match por continuidad pero hay manos del usuario y solo 1 mano presente
      if (!activeHand && userHands.length === 1 && this.v4ActivePalmCenter) {
        activeHand = userHands[0]!;
      }

      const activeHasValid = activeHand !== null && isGestureValid(activeHand);

      if (activeHand && activeHasValid) {
        this.v4AlternativeValidSinceMs = null;
      } else {
        // La mano activa no tiene gesto válido o no está presente

        // Buscar otra mano del usuario con gesto válido
        const otherValidHands = userHands.filter((h) => {
          if (activeHand && h === activeHand) return false;
          if (activeHand && euclideanDist(h.palmCenter, activeHand.palmCenter) < 0.05) {
            return false;
          }
          return isGestureValid(h);
        });

        if (otherValidHands.length > 0) {
          // Tomar la más alta de las otras válidas
          otherValidHands.sort((a, b) => a.palmCenter.y - b.palmCenter.y);
          const altHand = otherValidHands[0]!;

          if (this.v4AlternativeValidSinceMs === null) {
            this.v4AlternativeValidSinceMs = nowMs;
          } else if (nowMs - this.v4AlternativeValidSinceMs >= 250) {
            // Cambio de mano (re-anclar)
            activeHand = altHand;
            this.v4ActivePalmCenter = altHand.palmCenter;
            this.v4AlternativeValidSinceMs = null;
            this.handSwitchCount++;

            // Re-anclar
            const rawNewX = 1 - altHand.palmCenter.x;
            this.x = rawNewX;
            this.y = altHand.palmCenter.y;
            this.xFilter.reset();
            this.yFilter.reset();
            this.reanchor(rawNewX, user, sw);
          }
        } else {
          this.v4AlternativeValidSinceMs = null;
        }
      }

      if (activeHand) {
        this.v4ActivePalmCenter = activeHand.palmCenter;
        this.lastValidHandMs = nowMs;
      }
    } else {
      // Inactivo: tomar la más alta de userHands con gesto válido (o simplemente la más alta)
      const validHands = userHands.filter(isGestureValid);
      if (validHands.length > 0) {
        validHands.sort((a, b) => a.palmCenter.y - b.palmCenter.y);
        activeHand = validHands[0]!;
      } else if (userHands.length > 0) {
        const sorted = [...userHands].sort((a, b) => a.palmCenter.y - b.palmCenter.y);
        activeHand = sorted[0]!;
      }
      if (activeHand) {
        this.v4ActivePalmCenter = activeHand.palmCenter;
      }
    }

    // 3. Activación del cursor (ventana de 250 ms)
    const isValidForActivation = activeHand !== null && isGestureValid(activeHand);
    this.activationHistory.push({ time: nowMs, valid: isValidForActivation });
    this.activationHistory = this.activationHistory.filter((h) => h.time >= nowMs - 1000);

    const cutoff250 = nowMs - ACTIVATION_WINDOW_MS;
    const insideIndices: number[] = [];
    for (let i = 0; i < this.activationHistory.length; i++) {
      if (this.activationHistory[i]!.time >= cutoff250) {
        insideIndices.push(i);
      }
    }
    let effectiveWindow: Array<{ time: number; valid: boolean }> = [];
    if (insideIndices.length > 0) {
      const firstInsideIdx = insideIndices[0]!;
      const startIdx = firstInsideIdx > 0 ? firstInsideIdx - 1 : firstInsideIdx;
      effectiveWindow = this.activationHistory.slice(startIdx);
    } else if (this.activationHistory.length > 0) {
      effectiveWindow = [this.activationHistory[this.activationHistory.length - 1]!];
    }

    const windowSpan =
      effectiveWindow.length > 1 && effectiveWindow[0]
        ? nowMs - effectiveWindow[0].time
        : 0;
    const validCount = effectiveWindow.filter((h) => h.valid).length;
    const validRatio =
      effectiveWindow.length > 0 ? validCount / effectiveWindow.length : 0;

    const last3 = this.activationHistory.slice(-3);
    const last3Span = last3.length === 3 ? nowMs - last3[0]!.time : 0;
    const last3AreValidLowFps =
      last3.length === 3 && last3.every((h) => h.valid) && last3Span >= 200;
    const shouldActivate =
      (windowSpan >= ACTIVATION_WINDOW_MS && validRatio >= ACTIVATION_RATIO) ||
      last3AreValidLowFps;

    let justActivated = false;
    if (!this.active) {
      if (shouldActivate && activeHand) {
        this.active = true;
        justActivated = true;
        this.lastValidHandMs = nowMs;
        this.v4ActivePalmCenter = activeHand.palmCenter;
        this.v4StepDisarmed = false;
        this.v4NeutralSinceMs = null;
        this.v4BeyondThresholdSinceMs = null;
        this.v4BeyondThresholdFrames = 0;
        this.v4PendingDirection = null;
        this.v4LiveAccumulatedMs = 0;
        this.v4LiveLastSeenMs = null;
        this.v4LiveDisarmed = false;
      }
    } else {
      if (userHandsCount > 0 || activeHand !== null) {
        this.lastValidHandMs = nowMs;
      } else if (nowMs - this.lastValidHandMs >= effectiveDeactivationTimeoutMs) {
        this.active = false;
        this.v4ActivePalmCenter = null;
        this.v4AlternativeValidSinceMs = null;
        this.v4StepDisarmed = false;
        this.v4NeutralSinceMs = null;
        this.v4BeyondThresholdSinceMs = null;
        this.v4BeyondThresholdFrames = 0;
        this.v4PendingDirection = null;
        this.v4PulseArrow = null;
        this.v4LiveAccumulatedMs = 0;
        this.v4LiveLastSeenMs = null;
        this.v4LiveDisarmed = false;
        this.anchorX = null;
        this.anchorOffset = null;
        this.xFilter.reset();
        this.yFilter.reset();
      }
    }

    // 4. Posición y Suavizado
    if (activeHand) {
      this.gesture = activeHand.gesture;
      const rawX = 1 - activeHand.palmCenter.x;
      const rawY = activeHand.palmCenter.y;
      this.x = this.xFilter.filter(rawX, nowMs);
      this.y = this.yFilter.filter(rawY, nowMs);

      // Calcular poseSide y classifierSide
      this.v4ClassifierSide = activeHand.handedness ?? 'None';
      this.v4PoseSide = computeHandPoseSide(activeHand.wrist, user);
    } else if (!this.active) {
      this.gesture = 'None';
      this.v4PoseSide = 'None';
      this.v4ClassifierSide = 'None';
    }

    // 5. Ancla y zona neutra (relativa al cuerpo)
    const swWidth = user && user.sw > 0 ? user.sw : 0.2;

    if (justActivated) {
      this.reanchor(this.x, user, swWidth);
      if (
        typeof currentIndex === 'number' &&
        currentIndex >= 0 &&
        currentIndex < itemCount
      ) {
        this.index = currentIndex;
      } else if (itemCount > 0) {
        this.index = Math.floor(itemCount / 2);
      }
    } else if (this.active && this.anchorX === null) {
      this.reanchor(this.x, user, swWidth);
    } else if (this.active && this.anchorX !== null) {
      // 3.1 Re-anclar (anchorX = x actual, disparador armado) cuando:
      // - cambia la persona fijada, o
      // - swWidth cambia más de 25 % respecto al valor del momento de anclar
      let personChanged = false;
      if (
        user &&
        user.userId != null &&
        this.lastUserPersonId != null &&
        user.userId !== this.lastUserPersonId
      ) {
        personChanged = true;
      }

      if (user && user.userId != null && !personChanged) {
        this.lastUserPersonId = user.userId;
      }

      let swChanged = false;
      if (this.anchorSwWidth !== null && this.anchorSwWidth > 0) {
        const swDiffRatio = Math.abs(swWidth - this.anchorSwWidth) / this.anchorSwWidth;
        if (swDiffRatio > 0.25) {
          swChanged = true;
        }
      }

      if (personChanged || swChanged) {
        const currentX = activeHand ? 1 - activeHand.palmCenter.x : this.x;
        this.x = currentX;
        this.xFilter.reset();
        this.yFilter.reset();
        this.reanchor(currentX, user, swWidth);
      } else if (user && this.anchorOffsetSw !== null) {
        // En cada frame: anchorX = cx + anchorOffsetSw · swWidth
        this.anchorX = user.cx + this.anchorOffsetSw * swWidth;
        this.anchorOffset = this.anchorX - user.cx;
      }
    }

    // 6. Detección de Índice (Geométrico + Clasificador)
    let isClassifierIndex = false;
    let isGeomIndex = false;
    if (activeHand) {
      isClassifierIndex = activeHand.gesture === 'Pointing_Up' && activeHand.score >= 0.4;
      isGeomIndex = detectGeometricIndex(activeHand.landmarks);
    }
    const isIndexUp = isClassifierIndex || isGeomIndex;

    if (isClassifierIndex && isGeomIndex) {
      this.v4IndexSource = 'ambos';
    } else if (isGeomIndex) {
      this.v4IndexSource = 'geométrico';
    } else if (isClassifierIndex) {
      this.v4IndexSource = 'clasificador';
    } else {
      this.v4IndexSource = 'ninguno';
    }

    // 7. Desplazamiento y lógica de Pasos
    let d = 0;

    if (this.active && this.anchorX !== null) {
      d = (this.x - this.anchorX) / swWidth;

      // Re-centrado suave en neutral (|d| < 0.20)
      if (Math.abs(d) < STEP_RESET_DEAD && prevUpdateMs !== null) {
        const frameDt = Math.max(0, Math.min(500, nowMs - prevUpdateMs));
        const alpha = 1 - Math.exp(-frameDt / 2000);
        this.anchorX = this.anchorX + alpha * (this.x - this.anchorX);
        if (user && swWidth > 0) {
          this.anchorOffsetSw = (this.anchorX - user.cx) / swWidth;
          this.anchorOffset = this.anchorX - user.cx;
          this.anchorSwWidth = swWidth;
        }
        d = (this.x - this.anchorX) / swWidth;
      }

      // Re-armado del disparador si volvió al centro (|d| < 0.20 durante >= 150 ms)
      if (Math.abs(d) < STEP_RESET_DEAD) {
        if (this.v4NeutralSinceMs === null) {
          this.v4NeutralSinceMs = nowMs;
        } else if (nowMs - this.v4NeutralSinceMs >= STEP_RESET_MS) {
          this.v4StepDisarmed = false;
          this.v4DisarmedSinceMs = null;
        }
      } else {
        this.v4NeutralSinceMs = null;
      }

      // 3.2 Auto-recuperación del disparador:
      // Si el disparador lleva DESARMADO más de 1500 ms sin volver a neutral,
      // re-anclar en la posición actual de la mano y re-armar (sin disparar paso en ese momento).
      if (this.v4StepDisarmed) {
        if (this.v4DisarmedSinceMs === null) {
          this.v4DisarmedSinceMs = nowMs;
        } else if (nowMs - this.v4DisarmedSinceMs > 1500) {
          const currentX = activeHand ? 1 - activeHand.palmCenter.x : this.x;
          this.x = currentX;
          this.xFilter.reset();
          this.yFilter.reset();
          this.reanchor(currentX, user, swWidth);
          d = 0;
        }
      } else {
        this.v4DisarmedSinceMs = null;
      }

      // Disparo de Paso por Gesto:
      // Congelado si isPaused, isIndexUp, isLiveActive, o si disparador está desarmado
      if (
        !isPaused &&
        !isIndexUp &&
        !isLiveActive &&
        !this.v4StepDisarmed &&
        itemCount > 0
      ) {
        let isEligible = false;
        let candidateDir: 'left' | 'right' | null = null;

        if (this.v4PoseSide === 'Left') {
          if (d <= -STEP_THRESHOLD) {
            isEligible = true;
            candidateDir = 'left';
          }
        } else if (this.v4PoseSide === 'Right') {
          if (d >= STEP_THRESHOLD) {
            isEligible = true;
            candidateDir = 'right';
          }
        } else {
          // Si el lado no se puede calcular, cualquier mano puede disparar en ambos sentidos
          if (d <= -STEP_THRESHOLD) {
            isEligible = true;
            candidateDir = 'left';
          } else if (d >= STEP_THRESHOLD) {
            isEligible = true;
            candidateDir = 'right';
          }
        }

        if (isEligible && candidateDir !== null) {
          if (this.v4PendingDirection === candidateDir) {
            this.v4BeyondThresholdFrames++;
          } else {
            this.v4PendingDirection = candidateDir;
            this.v4BeyondThresholdSinceMs = nowMs;
            this.v4BeyondThresholdFrames = 1;
          }

          const holdTime =
            this.v4BeyondThresholdSinceMs !== null
              ? nowMs - this.v4BeyondThresholdSinceMs
              : 0;
          const meetsNoiseFilter =
            this.v4BeyondThresholdFrames >= STEP_NOISE_FRAMES ||
            holdTime >= STEP_NOISE_MS;
          const meetsCooldown = nowMs - this.v4LastStepTriggeredMs >= STEP_COOLDOWN_MS;

          if (meetsNoiseFilter && meetsCooldown) {
            const delta = candidateDir === 'right' ? 1 : -1;
            const currentIdx =
              typeof this.index === 'number'
                ? this.index
                : typeof currentIndex === 'number'
                  ? currentIndex
                  : 0;
            const nextIdx = clamp(currentIdx + delta, 0, itemCount - 1);
            if (nextIdx !== this.index) {
              this.index = nextIdx;
              events.push({
                type: 'step',
                index: this.index,
                direction: candidateDir,
              });
            }
            this.v4LastStepTriggeredMs = nowMs;
            this.v4StepDisarmed = true;
            this.v4DisarmedSinceMs = nowMs;
            this.v4NeutralSinceMs = null;
            this.v4BeyondThresholdSinceMs = null;
            this.v4BeyondThresholdFrames = 0;
            this.v4PendingDirection = null;
            this.v4PulseArrow = candidateDir;
            this.v4PulseUntilMs = nowMs + STEP_PULSE_MS;
          }
        } else {
          this.v4PendingDirection = null;
          this.v4BeyondThresholdSinceMs = null;
          this.v4BeyondThresholdFrames = 0;
        }
      } else {
        this.v4PendingDirection = null;
        this.v4BeyondThresholdSinceMs = null;
        this.v4BeyondThresholdFrames = 0;
      }
    }

    // Pulso de flecha
    let pulseArrow: 'left' | 'right' | null = null;
    if (this.v4PulseArrow !== null && nowMs < this.v4PulseUntilMs) {
      pulseArrow = this.v4PulseArrow;
    } else {
      this.v4PulseArrow = null;
    }

    // 8. Confirmación Live con Índice (Sección 3.1)
    if (!isIndexUp) {
      if (this.v4LiveNotPointingSinceMs === null) {
        this.v4LiveNotPointingSinceMs = nowMs;
      } else if (nowMs - this.v4LiveNotPointingSinceMs >= LIVE_REARM_MS) {
        this.v4LiveDisarmed = false;
      }
      this.v4LiveAccumulatedMs = 0;
      this.v4LiveLastSeenMs = null;
    } else {
      this.v4LiveNotPointingSinceMs = null;

      if (!isPaused && this.active && !this.v4LiveDisarmed && isLiveAvailable) {
        if (this.v4LiveLastSeenMs === null) {
          const initialDt =
            prevUpdateMs !== null ? Math.min(150, Math.max(0, nowMs - prevUpdateMs)) : 0;
          this.v4LiveAccumulatedMs += initialDt;
        } else {
          this.v4LiveAccumulatedMs += Math.max(0, nowMs - this.v4LiveLastSeenMs);
        }
        this.v4LiveLastSeenMs = nowMs;

        if (this.v4LiveAccumulatedMs >= CONFIRM_LIVE_MS) {
          events.push({ type: 'live' });
          this.v4LiveDisarmed = true;
          this.v4LiveAccumulatedMs = 0;
          this.v4LiveLastSeenMs = null;
        }
      } else if (!isLiveAvailable) {
        this.v4LiveAccumulatedMs = 0;
        this.v4LiveLastSeenMs = null;
      }
    }

    const confirmProgress = isLiveAvailable
      ? clamp(this.v4LiveAccumulatedMs / CONFIRM_LIVE_MS, 0, 1)
      : 0;

    const publishedIndex =
      this.active && !isLiveActive
        ? this.index
        : typeof currentIndex === 'number' && currentIndex >= 0
          ? currentIndex
          : null;

    const handsStatus = hands.map((h) => {
      const side = computeHandPoseSide(h.wrist, user);
      const raised = isHandRaised(h, user);
      const sideLabel =
        side === 'Left' ? 'Izquierda' : side === 'Right' ? 'Derecha' : 'Mano';
      return `${sideLabel}: ${raised ? 'levantada' : 'abajo'}`;
    });
    const handsRaisedSummary =
      handsStatus.length > 0 ? handsStatus.join(' · ') : 'ninguna';
    const handRaisedState: 'levantada' | 'abajo' | 'ninguna' = activeHand
      ? isHandRaised(activeHand, user)
        ? 'levantada'
        : 'abajo'
      : 'ninguna';

    let stepBlockedReason: StepBlockedReason = 'ninguno';

    if (!this.active) {
      stepBlockedReason = 'sin cursor';
    } else if (!activeHand || !isHandRaised(activeHand, user)) {
      stepBlockedReason = 'mano abajo';
    } else if (isIndexUp) {
      stepBlockedReason = 'índice levantado';
    } else if (isLiveActive) {
      stepBlockedReason = 'pausado (en vivo)';
    } else if (pausedUntilMs > nowMs) {
      stepBlockedReason = 'pausado (táctil)';
    } else if (busy) {
      stepBlockedReason = 'pausado (vuelo)';
    } else if (nowMs - this.v4LastStepTriggeredMs < STEP_COOLDOWN_MS) {
      stepBlockedReason = 'anti-rebote';
    } else if (this.v4StepDisarmed) {
      stepBlockedReason = 'desarmado (esperando centro)';
    } else {
      stepBlockedReason = 'ninguno';
    }

    return {
      cursor: {
        active: this.active,
        x: this.x,
        y: this.y,
        index: publishedIndex,
        dwellProgress: confirmProgress,
        gesture: this.gesture,
        anchorX: this.anchorX,
        displacement: d,
        leverState: 'neutral',
        directionArrow: pulseArrow,
        confirmProgress,
        ownerReason: this.lastOwnerReason,
        activeHandSide: this.v4PoseSide,
        handSwitchCount: this.handSwitchCount,
        poseSide: this.v4PoseSide,
        classifierSide: this.v4ClassifierSide,
        indexSource: this.v4IndexSource,
        isStepDisarmed: this.v4StepDisarmed,
        pulseArrow,
        handRaisedState,
        handsRaisedSummary,
        anchorOffsetSw: this.anchorOffsetSw,
        swWidth,
        stepBlockedReason,
      },
      events,
      userHandsCount,
      detectedHandsCount,
    };
  }
}
