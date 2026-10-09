import { OneEuroFilter } from './one-euro-filter';
import type { CandidateBoundingBox } from './active-zone';

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

// Constantes Mano v2: Palanca y Confirmación explícita
export const LEVER_DEAD = 0.3;
export const LEVER_FAST = 0.75;
export const STEP_SLOW_MS = 650;
export const STEP_FAST_MS = 350;
export const STEP_FIRST_DELAY_MS = 250;
export const CONFIRM_MS = 600;
export const CONFIRM_LOST_MAX_MS = 300;
export const GAP_LOST_MAX_MS = 300;

export interface HandLandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface DetectedHandInput {
  wrist: HandLandmarkPoint;
  palmCenter: HandLandmarkPoint;
  gesture: string;
  score: number;
}

export interface LockedUserWrists {
  left: HandLandmarkPoint | null;
  right: HandLandmarkPoint | null;
}

export interface HandFrameUser {
  lockedWrists: LockedUserWrists;
  sw: number;
  cx: number;
  box?: CandidateBoundingBox;
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
}

export type LeverState =
  | 'neutral'
  | 'slow_left'
  | 'slow_right'
  | 'fast_left'
  | 'fast_right';
export type OwnerMatchReason = 'wrist' | 'continuity' | 'box' | 'none';

export interface HandCursorData {
  active: boolean;
  x: number;
  y: number;
  index: number;
  dwellProgress: number;
  gesture: string;
  // Propiedades v2
  anchorX?: number | null;
  displacement?: number;
  leverState?: LeverState;
  directionArrow?: 'left' | 'right' | null;
  confirmProgress?: number;
  ownerReason?: OwnerMatchReason;
}

export interface HandCursorEvent {
  type: 'take';
  index: number;
  method?: 'hand_dwell' | 'hand_point';
}

export interface HandFrameOutput {
  cursor: HandCursorData;
  events: HandCursorEvent[];
  userHandsCount: number;
  detectedHandsCount: number;
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
 * Filtra las manos detectadas para encontrar las pertenecientes al usuario fijado.
 * Reglas v2:
 * 1. ownerDist = max(0.06, 0.6 * sw)
 * 2. Continuidad: si ya había una mano del usuario y su palmCenter está a <= 0.5 * sw de la anterior
 * 3. Si lockedWrists son null pero hay una sola mano dentro del box del usuario, es del usuario
 */
export function selectUserHand(
  hands: DetectedHandInput[],
  user: HandFrameUser | null,
  lastUserPalmCenter?: HandLandmarkPoint | null,
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
      const sorted = [...wristMatches].sort((a, b) => a.palmCenter.y - b.palmCenter.y);
      return { userHands: wristMatches, activeHand: sorted[0] ?? null, reason: 'wrist' };
    }
  }

  // 2. Continuidad si teníamos una posición anterior conocida de la mano del usuario
  if (lastUserPalmCenter) {
    const continuityMaxDist = 0.5 * sw;
    const continuityMatches = hands.filter(
      (h) => euclideanDist(h.palmCenter, lastUserPalmCenter) <= continuityMaxDist,
    );

    if (continuityMatches.length > 0) {
      const sorted = [...continuityMatches].sort(
        (a, b) => a.palmCenter.y - b.palmCenter.y,
      );
      return {
        userHands: continuityMatches,
        activeHand: sorted[0] ?? null,
        reason: 'continuity',
      };
    }
  }

  // 3. Fallback por bounding box si lockedWrists son null y hay una sola mano dentro del recuadro
  if (!hasLockedWrists && user.box) {
    const box = user.box;
    const handsInBox = hands.filter(
      (h) =>
        h.palmCenter.x >= box.minX &&
        h.palmCenter.x <= box.maxX &&
        h.palmCenter.y >= box.minY &&
        h.palmCenter.y <= box.maxY,
    );

    if (handsInBox.length === 1) {
      return { userHands: handsInBox, activeHand: handsInBox[0] ?? null, reason: 'box' };
    }
  }

  return { userHands: [], activeHand: null, reason: 'none' };
}

export interface HandCursorTrackerOptions {
  enableDwell?: boolean;
  useAbsoluteMapping?: boolean;
}

/**
 * Estado interno mutable mantenido por HandCursorTracker (Mano v2: Ancla, Palanca y Confirmación explícita).
 */
export class HandCursorTracker {
  private active = false;
  private x = 0.5;
  private y = 0.5;
  private index = 0;
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

  // Estado v2
  private anchorX: number | null = null;
  private lastUserPalmCenter: HandLandmarkPoint | null = null;
  private leverState: LeverState = 'neutral';
  private leverEnteredMs: number | null = null;
  private lastStepMs: number = 0;
  private confirmAccumulatedMs = 0;
  private confirmLastSeenMs: number | null = null;
  private lastPointingMs: number | null = null;
  private confirmProgress = 0;
  private lastOwnerReason: OwnerMatchReason = 'none';
  private confirmedWithPointing = false;

  private options: HandCursorTrackerOptions;

  constructor(options?: HandCursorTrackerOptions) {
    this.options = {
      enableDwell: options?.enableDwell ?? false,
      useAbsoluteMapping: options?.useAbsoluteMapping ?? false,
    };
  }

  setOptions(opts: Partial<HandCursorTrackerOptions>): void {
    this.options = { ...this.options, ...opts };
  }

  reset(): void {
    this.active = false;
    this.x = 0.5;
    this.y = 0.5;
    this.index = 0;
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

    // Reset v2
    this.anchorX = null;
    this.lastUserPalmCenter = null;
    this.leverState = 'neutral';
    this.leverEnteredMs = null;
    this.lastStepMs = 0;
    this.confirmAccumulatedMs = 0;
    this.confirmLastSeenMs = null;
    this.lastPointingMs = null;
    this.confirmProgress = 0;
    this.lastOwnerReason = 'none';
    this.confirmedWithPointing = false;
  }

  update(input: HandFrameInput): HandFrameOutput {
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
    } = input;
    const isPaused = busy || pausedUntilMs > nowMs;
    const events: HandCursorEvent[] = [];

    // a) Dueño de la mano con continuidad y box fallback
    const {
      userHands,
      activeHand,
      reason: ownerReason,
    } = selectUserHand(hands, user, this.lastUserPalmCenter);
    this.lastOwnerReason = ownerReason;
    if (activeHand) {
      this.lastUserPalmCenter = activeHand.palmCenter;
    }
    const detectedHandsCount = hands.length;
    const userHandsCount = userHands.length;

    // Medición de intervalos de muestreo observados
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
        this.confirmProgress = 0;
      }
    } else {
      if (isValidGesture) {
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
        this.lastUserPalmCenter = null;
        this.leverState = 'neutral';
        this.leverEnteredMs = null;
        this.confirmAccumulatedMs = 0;
        this.confirmLastSeenMs = null;
        this.lastPointingMs = null;
        this.xFilter.reset();
        this.yFilter.reset();
      }
    }

    // c) Posición y Suavizado
    if (activeHand) {
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
    }

    // d) Mapeo a prenda
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
          const currentBandLeft = this.index * bandW;
          const currentBandRight = (this.index + 1) * bandW;
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
      // 2.2 PALANCA (control por desplazamiento relativo)
      d = (this.x - this.anchorX) / swWidth;
      const absD = Math.abs(d);

      let newLeverState: LeverState = 'neutral';
      if (absD < LEVER_DEAD) {
        newLeverState = 'neutral';
        directionArrow = null;
      } else if (absD < LEVER_FAST) {
        newLeverState = d > 0 ? 'slow_right' : 'slow_left';
        directionArrow = d > 0 ? 'right' : 'left';
      } else {
        newLeverState = d > 0 ? 'fast_right' : 'fast_left';
        directionArrow = d > 0 ? 'right' : 'left';
      }

      if (newLeverState !== this.leverState) {
        this.leverState = newLeverState;
        this.leverEnteredMs = nowMs;
        this.lastStepMs = 0;
      }

      if (this.leverState !== 'neutral' && this.leverEnteredMs !== null) {
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
            const nextIdx = clamp(this.index + delta, 0, itemCount - 1);
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
            const nextIdx = clamp(this.index + delta, 0, itemCount - 1);
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
        // En v2: volver a Open_Palm tras confirmar con Pointing_Up rearma
        if (this.confirmedWithPointing) {
          this.isArmed = true;
          this.confirmedWithPointing = false;
        }
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

      // 2.3 CONFIRMACIÓN EXPLÍCITA (por defecto activa; toma por Pointing_Up en zona neutra)
      if (!enableDwell) {
        const isNeutral = this.leverState === 'neutral';
        const isPointing =
          activeHand !== null &&
          activeHand.gesture === 'Pointing_Up' &&
          activeHand.score >= GESTURE_SCORE_MIN;

        if (isPointing && isNeutral && this.isArmed) {
          if (this.lastPointingMs === null) {
            this.lastPointingMs = nowMs;
            this.confirmLastSeenMs = nowMs;
          } else {
            const dt = nowMs - this.lastPointingMs;
            this.confirmAccumulatedMs += dt;
            this.lastPointingMs = nowMs;
            this.confirmLastSeenMs = nowMs;
            this.confirmProgress = clamp(this.confirmAccumulatedMs / CONFIRM_MS, 0, 1);

            if (this.confirmAccumulatedMs >= CONFIRM_MS) {
              events.push({
                type: 'take',
                index: this.index,
                method: 'hand_point',
              });
              this.isArmed = false;
              this.confirmedWithPointing = true;
              this.confirmProgress = 0;
              this.confirmAccumulatedMs = 0;
              this.confirmLastSeenMs = null;
              this.lastPointingMs = null;
              eventFired = true;
            }
          }
        } else if (this.confirmLastSeenMs !== null) {
          // Huecos breves / pérdida de gesto o no apuntando en zona neutra
          this.lastPointingMs = null;
          if (activeHand !== null && activeHand.gesture === 'Open_Palm') {
            // Con Open_Palm se cancela la confirmación de inmediato
            this.confirmAccumulatedMs = 0;
            this.confirmProgress = 0;
            this.confirmLastSeenMs = null;
          } else {
            const timeSinceSeen = nowMs - this.confirmLastSeenMs;
            if (timeSinceSeen > GAP_LOST_MAX_MS || !isNeutral) {
              // Se pierde > 300 ms o sale de zona neutra: el anillo vuelve a 0
              this.confirmAccumulatedMs = 0;
              this.confirmProgress = 0;
              this.confirmLastSeenMs = null;
            }
            // Si timeSinceSeen <= GAP_LOST_MAX_MS, se congela el confirmProgress
          }
        } else {
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
              index: this.index,
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
                index: this.index,
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

    return {
      cursor: {
        active: this.active,
        x: this.x,
        y: this.y,
        index: this.index,
        dwellProgress: effectiveProgress,
        gesture: this.gesture,
        anchorX: this.anchorX,
        displacement: d,
        leverState: this.leverState,
        directionArrow,
        confirmProgress: this.confirmProgress,
        ownerReason: this.lastOwnerReason,
      },
      events,
      userHandsCount,
      detectedHandsCount,
    };
  }
}
