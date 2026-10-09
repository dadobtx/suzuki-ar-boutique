import { OneEuroFilter } from './one-euro-filter';

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
}

export interface HandFrameInput {
  nowMs: number;
  hands: DetectedHandInput[];
  user: HandFrameUser | null;
  itemCount: number;
  busy?: boolean;
  pausedUntilMs?: number;
}

export interface HandCursorData {
  active: boolean;
  x: number;
  y: number;
  index: number;
  dwellProgress: number;
  gesture: string;
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
 * Una mano pertenece al usuario si su muñeca está a <= OWNER_DIST (0.08) de
 * lockedWrists.left o .right. Si hay dos del usuario, se usa la más alta (y menor).
 */
export function selectUserHand(
  hands: DetectedHandInput[],
  user: HandFrameUser | null,
): { userHands: DetectedHandInput[]; activeHand: DetectedHandInput | null } {
  if (!user || (!user.lockedWrists.left && !user.lockedWrists.right)) {
    return { userHands: [], activeHand: null };
  }

  const userHands = hands.filter((h) => {
    let minDist = Infinity;
    if (user.lockedWrists.left) {
      minDist = Math.min(minDist, euclideanDist(h.wrist, user.lockedWrists.left));
    }
    if (user.lockedWrists.right) {
      minDist = Math.min(minDist, euclideanDist(h.wrist, user.lockedWrists.right));
    }
    return minDist <= OWNER_DIST;
  });

  if (userHands.length === 0) {
    return { userHands: [], activeHand: null };
  }

  // Si hay más de una, usar la más alta (menor y)
  const sorted = [...userHands].sort((a, b) => a.palmCenter.y - b.palmCenter.y);
  return { userHands, activeHand: sorted[0] ?? null };
}

/**
 * Estado interno mutable mantenido por HandCursorTracker.
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
  private indexStableSinceMs = 0;
  private hadOpenPalmDuringStable = false;
  private gestureHistory: Array<{ time: number; gesture: string; score: number }> = [];
  private pointingStartMs: number | null = null;

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
    this.indexStableSinceMs = 0;
    this.hadOpenPalmDuringStable = false;
    this.gestureHistory = [];
    this.pointingStartMs = null;
  }

  update(input: HandFrameInput): HandFrameOutput {
    const { nowMs, hands, user, itemCount, busy = false, pausedUntilMs = 0 } = input;
    const isPaused = busy || pausedUntilMs > nowMs;
    const events: HandCursorEvent[] = [];

    // a) Dueño de la mano
    const { userHands, activeHand } = selectUserHand(hands, user);
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

    // Intervalo de muestreo promedio u observado (por defecto 100 ms si no hay historial)
    const observedIntervalMs =
      this.sampleIntervals.length > 0
        ? this.sampleIntervals.reduce((a, b) => a + b, 0) / this.sampleIntervals.length
        : 100;
    const effectiveDeactivationTimeoutMs = Math.max(
      DEACTIVATION_TIMEOUT_MS,
      2 * observedIntervalMs,
    );

    // b) Activación: ventana de 250 ms
    const isValidGesture =
      activeHand !== null &&
      (activeHand.gesture === 'Open_Palm' || activeHand.gesture === 'Pointing_Up') &&
      activeHand.score >= GESTURE_SCORE_MIN;

    this.activationHistory.push({ time: nowMs, valid: isValidGesture });
    // Conservar las muestras de los últimos 1000 ms
    this.activationHistory = this.activationHistory.filter((h) => h.time >= nowMs - 1000);

    // Ventana efectiva = las muestras con time >= nowMs - 250, MÁS la muestra inmediatamente anterior a ese corte (si existe)
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
      // Si ninguna está estrictamente dentro, tomar la última si existe
      effectiveWindow = [this.activationHistory[this.activationHistory.length - 1]!];
    }

    const windowSpan =
      effectiveWindow.length > 1 && effectiveWindow[0]
        ? nowMs - effectiveWindow[0].time
        : 0;
    const validCount = effectiveWindow.filter((h) => h.valid).length;
    const validRatio =
      effectiveWindow.length > 0 ? validCount / effectiveWindow.length : 0;

    // Condición: (span >= 250 ms Y ratio de válidas >= 60 %) O (las últimas 3 muestras son válidas con span >= 200 ms para bajas frecuencias)
    const last3 = this.activationHistory.slice(-3);
    const last3Span = last3.length === 3 ? nowMs - last3[0]!.time : 0;
    const last3AreValidLowFps =
      last3.length === 3 && last3.every((h) => h.valid) && last3Span >= 200;
    const shouldActivate =
      (windowSpan >= ACTIVATION_WINDOW_MS && validRatio >= ACTIVATION_RATIO) ||
      last3AreValidLowFps;

    if (!this.active) {
      if (shouldActivate) {
        this.active = true;
        this.lastValidHandMs = nowMs;
        this.dwellStartMs = nowMs;
        this.indexStableSinceMs = nowMs;
        this.isArmed = true;
        this.hadOpenPalmDuringStable = false;
        this.gestureHistory = [];
        this.pointingStartMs = null;
      }
    } else {
      if (isValidGesture) {
        this.lastValidHandMs = nowMs;
      } else if (nowMs - this.lastValidHandMs >= effectiveDeactivationTimeoutMs) {
        this.active = false;
        this.dwellProgress = 0;
        this.isArmed = true;
        this.hadOpenPalmDuringStable = false;
        this.gestureHistory = [];
        this.activationHistory = [];
        this.pointingStartMs = null;
        this.xFilter.reset();
        this.yFilter.reset();
      }
    }

    // c) Posición y Suavizado
    if (activeHand) {
      this.gesture = activeHand.gesture;
      // Espejado: x de palmCenter invertido en el espejo
      const rawX = 1 - activeHand.palmCenter.x;
      const rawY = activeHand.palmCenter.y;

      this.x = this.xFilter.filter(rawX, nowMs);
      this.y = this.yFilter.filter(rawY, nowMs);
    } else if (!this.active) {
      this.gesture = 'None';
    }

    // d) Mapeo a prenda con histéresis
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
          this.indexStableSinceMs = nowMs;
          this.dwellStartMs = nowMs;
          this.isArmed = true;
          this.hadOpenPalmDuringStable = false;
          this.gestureHistory = [];
          this.pointingStartMs = null;
        } else if (t > currentBandRight + hystMargin) {
          this.index = rawIndex;
          this.indexStableSinceMs = nowMs;
          this.dwellStartMs = nowMs;
          this.isArmed = true;
          this.hadOpenPalmDuringStable = false;
          this.gestureHistory = [];
          this.pointingStartMs = null;
        }
      }
    }

    // Registro del gesto actual para el atajo
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

    // g) busy o pausa: no emite eventos y el progreso vuelve a 0
    if (isPaused || !this.active) {
      this.dwellProgress = 0;
      this.dwellStartMs = nowMs;
    } else {
      // f) Atajo: índice estable >= 300 ms, paso de Open_Palm a Pointing_Up sostenido >= 300 ms (>= 70% de 300 ms)
      const isIndexStable = nowMs - this.indexStableSinceMs >= SHORTCUT_STABLE_MS;
      let shortcutFired = false;

      if (
        isIndexStable &&
        this.hadOpenPalmDuringStable &&
        this.isArmed &&
        this.pointingStartMs !== null &&
        nowMs - this.pointingStartMs >= SHORTCUT_WINDOW_MS
      ) {
        const cutoffShortcut = nowMs - SHORTCUT_WINDOW_MS;
        const shortcutIndices = [];
        for (let i = 0; i < this.gestureHistory.length; i++) {
          if (this.gestureHistory[i]!.time >= cutoffShortcut) {
            shortcutIndices.push(i);
          }
        }
        let effectiveGestureWindow: Array<{
          time: number;
          gesture: string;
          score: number;
        }> = [];
        if (shortcutIndices.length > 0) {
          const firstIdx = shortcutIndices[0]!;
          const startIdx = firstIdx > 0 ? firstIdx - 1 : firstIdx;
          effectiveGestureWindow = this.gestureHistory.slice(startIdx);
        } else if (this.gestureHistory.length > 0) {
          effectiveGestureWindow = [this.gestureHistory[this.gestureHistory.length - 1]!];
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
          this.dwellProgress = 0;
          this.dwellStartMs = nowMs;
          this.pointingStartMs = null;
          shortcutFired = true;
        }
      }

      // e) Permanencia (Dwell): 1200 ms con cursor activo y armado
      if (!shortcutFired) {
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
          }
        } else {
          this.dwellProgress = 0;
        }
      }
    }

    return {
      cursor: {
        active: this.active,
        x: this.x,
        y: this.y,
        index: this.index,
        dwellProgress: this.dwellProgress,
        gesture: this.gesture,
      },
      events,
      userHandsCount,
      detectedHandsCount,
    };
  }
}
