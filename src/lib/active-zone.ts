import type { NormalizedLandmark } from '@/types/pose';
import { computeCropOffset } from './center-crop';

export const ACTIVE_ZONE_STORAGE_KEY = 'suzuki-active-zone';
export const POSE_MAX_PERSONS = 3;

export type CandidateReason =
  | 'locked'
  | 'candidate'
  | 'far'
  | 'offCenter'
  | 'moving'
  | 'lowVis';

export interface ActiveZoneConfig {
  SW_MIN: number; // default 0.09
  CENTER_BAND: number; // default 0.22 (|cx - 0.5| max)
  VIS_MIN: number; // default 0.6
  SPEED_MAX: number; // default 0.35 (screen widths / s)
  LOCK_MS: number; // default 600
  LOST_MS: number; // default 1500
  HYST_SW: number; // default 0.85 (0.85 * SW_MIN for locked)
  HYST_BAND: number; // default 0.05 (+0.05 on CENTER_BAND for locked)
  MATCH_DIST: number; // default 0.15 (distance in shoulder midpoint)
}

export const DEFAULT_ACTIVE_ZONE_CONFIG: ActiveZoneConfig = {
  SW_MIN: 0.09,
  CENTER_BAND: 0.22,
  VIS_MIN: 0.6,
  SPEED_MAX: 0.35,
  LOCK_MS: 600,
  LOST_MS: 1500,
  HYST_SW: 0.85,
  HYST_BAND: 0.05,
  MATCH_DIST: 0.15,
};

export function parseActiveZoneFlag(val: string | null | undefined): boolean | null {
  if (val === null || val === undefined) return null;
  const lower = val.trim().toLowerCase();
  if (lower === '1' || lower === 'true' || lower === 'on') return true;
  if (lower === '0' || lower === 'false' || lower === 'off') return false;
  return null;
}

export function readUrlActiveZone(): boolean | null {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }

  // 1. window.location.search (?zona=...)
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const parsed = parseActiveZoneFlag(searchParams.get('zona'));
    if (parsed !== null) return parsed;
  } catch {
    // Ignore URL parsing errors
  }

  // 2. window.location.hash (#/...?...&zona=...)
  try {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex));
      const parsed = parseActiveZoneFlag(hashParams.get('zona'));
      if (parsed !== null) return parsed;
    }
  } catch {
    // Ignore URL parsing errors
  }

  return null;
}

export function readSessionActiveZone(): boolean | null {
  try {
    const val = sessionStorage.getItem(ACTIVE_ZONE_STORAGE_KEY);
    return parseActiveZoneFlag(val);
  } catch {
    return null;
  }
}

export function writeSessionActiveZone(enabled: boolean): void {
  try {
    sessionStorage.setItem(ACTIVE_ZONE_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // sessionStorage unavailable
  }
}

/**
 * Resolución de prioridad para el interruptor:
 * ?zona=1 / ?zona=0 (search o hash) > sessionStorage('suzuki-active-zone') > VITE_ACTIVE_ZONE > OFF.
 */
export function isActiveZoneEnabled(): boolean {
  // 1. URL (?zona=1 / ?zona=0 en search o hash)
  const fromUrl = readUrlActiveZone();
  if (fromUrl !== null) {
    return fromUrl;
  }

  // 2. sessionStorage
  const fromSession = readSessionActiveZone();
  if (fromSession !== null) {
    return fromSession;
  }

  // 3. Environment variable VITE_ACTIVE_ZONE
  const envVal = parseActiveZoneFlag(import.meta.env?.VITE_ACTIVE_ZONE);
  if (envVal !== null) {
    return envVal;
  }

  // 4. Default: OFF
  return false;
}

export function parseActiveZoneConfig(search?: string): ActiveZoneConfig {
  const config = { ...DEFAULT_ACTIVE_ZONE_CONFIG };
  let query = search;
  if (!query && typeof window !== 'undefined' && window.location) {
    query = window.location.search;
    if (!query && window.location.hash.includes('?')) {
      query = window.location.hash.slice(window.location.hash.indexOf('?'));
    }
  }

  if (!query) return config;

  try {
    const params = new URLSearchParams(query);
    const sw = params.get('zona_sw');
    if (sw && !isNaN(Number(sw))) config.SW_MIN = Number(sw);

    const band = params.get('zona_band');
    if (band && !isNaN(Number(band))) config.CENTER_BAND = Number(band);

    const speed = params.get('zona_speed');
    if (speed && !isNaN(Number(speed))) config.SPEED_MAX = Number(speed);
  } catch {
    // Ignore URL parse errors
  }

  return config;
}

export interface CandidateBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CandidateMetrics {
  sw: number;
  cx: number;
  vis: number;
  speed: number;
  score: number;
  midX: number;
  midY: number;
  reason: CandidateReason;
  box: CandidateBoundingBox;
}

export interface TrackedCandidate {
  lastMidX: number;
  lastMidY: number;
  lastCx: number;
  lastTimeMs: number;
  speed: number;
  eligibleSinceMs: number | null;
}

export interface ActiveZoneState {
  lockedPerson: {
    lastMidX: number;
    lastMidY: number;
    lastCx: number;
    lastTimeMs: number;
    speed: number;
    lockedSinceMs: number;
    lastSeenMs: number;
  } | null;
  trackedCandidates: TrackedCandidate[];
  lastNowMs: number;
}

export interface CandidateInput {
  landmarks: NormalizedLandmark[];
  visibleLandmarks?: NormalizedLandmark[];
}

export interface SelectUserResult {
  state: ActiveZoneState;
  lockedIndex: number | null;
  reasons: CandidateReason[];
  approaching: boolean;
  candidates: Array<{
    sw: number;
    cx: number;
    vis: number;
    speed: number;
    score: number;
    reason: CandidateReason;
    midX: number;
    midY: number;
    box: CandidateBoundingBox;
  }>;
}

/**
 * Transforma landmarks normalizados del video (0-1) a coordenadas normalizadas
 * respecto al viewport visible (0-1), considerando el center-crop en portrait
 * o 1:1 en landscape.
 */
export function toVisibleCoordinates(
  lm: NormalizedLandmark,
  layout: 'portrait' | 'landscape',
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
): NormalizedLandmark {
  if (
    layout === 'landscape' ||
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    containerWidth <= 0 ||
    containerHeight <= 0
  ) {
    return lm;
  }

  const crop = computeCropOffset(
    videoWidth,
    videoHeight,
    containerWidth,
    containerHeight,
  );

  const vx = lm.x * videoWidth;
  const vy = lm.y * videoHeight;

  const visX = (vx - crop.cropX) / crop.visibleWidth;
  const visY = (vy - crop.cropY) / crop.visibleHeight;

  return {
    ...lm,
    x: visX,
    y: visY,
  };
}

/**
 * Calcula métricas de una persona a partir de sus landmarks en coordenadas visibles.
 */
export function computeCandidateMetrics(
  landmarks: NormalizedLandmark[],
  prevTracked: TrackedCandidate | null,
  config: ActiveZoneConfig,
  nowMs: number,
): CandidateMetrics {
  const lm0 = landmarks[0];
  const lm11 = landmarks[11];
  const lm12 = landmarks[12];
  const lm23 = landmarks[23];
  const lm24 = landmarks[24];

  // sw = |x11 - x12|
  const x11 = lm11?.x ?? 0.5;
  const x12 = lm12?.x ?? 0.5;
  const sw = Math.abs(x11 - x12);

  // midX, midY: punto medio de hombros
  const y11 = lm11?.y ?? 0.5;
  const y12 = lm12?.y ?? 0.5;
  const midX = (x11 + x12) / 2;
  const midY = (y11 + y12) / 2;

  // cx = centro del torso
  const hipsVis1 = lm23?.visibility ?? 0;
  const hipsVis2 = lm24?.visibility ?? 0;
  let cx = (x11 + x12) / 2;
  if (hipsVis1 >= 0.5 && hipsVis2 >= 0.5 && lm23 && lm24) {
    cx = (x11 + x12 + lm23.x + lm24.x) / 4;
  }

  // vis = visibility promedio de 0, 11, 12, 23, 24
  const vis =
    ((lm0?.visibility ?? 0) +
      (lm11?.visibility ?? 0) +
      (lm12?.visibility ?? 0) +
      (lm23?.visibility ?? 0) +
      (lm24?.visibility ?? 0)) /
    5;

  // speed = |Δcx| / Δt con EMA α 0.3
  let speed = 0;
  if (prevTracked && prevTracked.lastTimeMs >= 0 && nowMs > prevTracked.lastTimeMs) {
    const dt = (nowMs - prevTracked.lastTimeMs) / 1000;
    const rawSpeed = dt > 0 ? Math.abs(cx - prevTracked.lastCx) / dt : 0;
    speed = 0.3 * rawSpeed + 0.7 * prevTracked.speed;
  }

  // score = sw - 0.5 * |cx - 0.5|
  const score = sw - 0.5 * Math.abs(cx - 0.5);

  // Bounding box en coordenadas visibles
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  let hasValidPoints = false;

  for (const lm of landmarks) {
    if ((lm.visibility ?? 0) >= 0.2) {
      if (lm.x < minX) minX = lm.x;
      if (lm.x > maxX) maxX = lm.x;
      if (lm.y < minY) minY = lm.y;
      if (lm.y > maxY) maxY = lm.y;
      hasValidPoints = true;
    }
  }

  const box: CandidateBoundingBox = hasValidPoints
    ? { minX, minY, maxX, maxY }
    : {
        minX: Math.max(0, midX - 0.15),
        minY: Math.max(0, midY - 0.25),
        maxX: Math.min(1, midX + 0.15),
        maxY: Math.min(1, midY + 0.45),
      };

  // Determinar razón preliminar
  let reason: CandidateReason = 'candidate';
  if (vis < config.VIS_MIN) {
    reason = 'lowVis';
  } else if (Math.abs(cx - 0.5) > config.CENTER_BAND) {
    reason = 'offCenter';
  } else if (sw < config.SW_MIN) {
    reason = 'far';
  } else if (speed > config.SPEED_MAX) {
    reason = 'moving';
  }

  return { sw, cx, vis, speed, score, midX, midY, reason, box };
}

/**
 * Función pura que selecciona al usuario de la zona activa entre las poses detectadas.
 */
export function selectUser(
  candidates: CandidateInput[],
  prevState: ActiveZoneState | null,
  config: ActiveZoneConfig = DEFAULT_ACTIVE_ZONE_CONFIG,
  nowMs: number = Date.now(),
): SelectUserResult {
  const prevTracked = prevState?.trackedCandidates ?? [];
  const lockedPerson = prevState?.lockedPerson ?? null;

  // 1. Extraer o calcular landmarks visibles de cada candidata
  const visibleCandidateLandmarks = candidates.map(
    (c) => c.visibleLandmarks ?? c.landmarks,
  );

  // 2. Asociar cada candidata con el candidato previo más cercano (para velocidad / continuidad)
  const candidateMetricsList: CandidateMetrics[] = [];
  const usedPrevIndices = new Set<number>();

  for (let i = 0; i < visibleCandidateLandmarks.length; i++) {
    const lms = visibleCandidateLandmarks[i];
    if (!lms) continue;
    const x11 = lms[11]?.x ?? 0.5;
    const x12 = lms[12]?.x ?? 0.5;
    const y11 = lms[11]?.y ?? 0.5;
    const y12 = lms[12]?.y ?? 0.5;
    const midX = (x11 + x12) / 2;
    const midY = (y11 + y12) / 2;

    let bestPrev: TrackedCandidate | null = null;
    let bestDist = Infinity;
    let bestIdx = -1;

    for (let p = 0; p < prevTracked.length; p++) {
      if (usedPrevIndices.has(p)) continue;
      const pt = prevTracked[p];
      if (!pt) continue;
      const dist = Math.hypot(midX - pt.lastMidX, midY - pt.lastMidY);
      if (dist <= config.MATCH_DIST && dist < bestDist) {
        bestDist = dist;
        bestPrev = pt;
        bestIdx = p;
      }
    }

    if (bestIdx !== -1) {
      usedPrevIndices.add(bestIdx);
    }

    const metrics = computeCandidateMetrics(lms, bestPrev, config, nowMs);
    candidateMetricsList.push(metrics);
  }

  // 3. Revisar si hay alguien "approaching": centrado y visible pero aún lejos (sw entre 0.6·SW_MIN y SW_MIN)
  const approaching = candidateMetricsList.some(
    (m) =>
      m.sw >= 0.6 * config.SW_MIN &&
      m.sw < config.SW_MIN &&
      Math.abs(m.cx - 0.5) <= config.CENTER_BAND &&
      m.vis >= config.VIS_MIN,
  );

  // 4. Caso A: Había una persona fijada previamente
  if (lockedPerson) {
    let matchedLockedIdx: number | null = null;
    let bestDist = Infinity;

    for (let i = 0; i < candidateMetricsList.length; i++) {
      const m = candidateMetricsList[i];
      if (!m) continue;
      const dist = Math.hypot(
        m.midX - lockedPerson.lastMidX,
        m.midY - lockedPerson.lastMidY,
      );
      if (dist <= config.MATCH_DIST && dist < bestDist) {
        bestDist = dist;
        matchedLockedIdx = i;
      }
    }

    if (matchedLockedIdx !== null) {
      const m = candidateMetricsList[matchedLockedIdx];
      if (!m) {
        // Fallback defensivo
        return {
          state: {
            lockedPerson: null,
            trackedCandidates: [],
            lastNowMs: nowMs,
          },
          lockedIndex: null,
          reasons: [],
          approaching,
          candidates: [],
        };
      }
      // Evaluar permanencia con histéresis:
      // SW_MIN * HYST_SW  y  CENTER_BAND + HYST_BAND
      const swHyst = config.SW_MIN * config.HYST_SW;
      const bandHyst = config.CENTER_BAND + config.HYST_BAND;
      const stillInZone =
        m.sw >= swHyst && Math.abs(m.cx - 0.5) <= bandHyst && m.vis >= config.VIS_MIN;

      if (stillInZone) {
        // Se mantiene fijada y activa
        const reasons = candidateMetricsList.map((cand, idx) =>
          idx === matchedLockedIdx ? 'locked' : cand.reason,
        );

        const nextLockedPerson = {
          lastMidX: m.midX,
          lastMidY: m.midY,
          lastCx: m.cx,
          lastTimeMs: nowMs,
          speed: m.speed,
          lockedSinceMs: lockedPerson.lockedSinceMs,
          lastSeenMs: nowMs,
        };

        const nextTrackedCandidates: TrackedCandidate[] = candidateMetricsList.map(
          (cand, idx) => ({
            lastMidX: cand.midX,
            lastMidY: cand.midY,
            lastCx: cand.cx,
            lastTimeMs: nowMs,
            speed: cand.speed,
            eligibleSinceMs: idx === matchedLockedIdx ? nowMs : null,
          }),
        );

        return {
          state: {
            lockedPerson: nextLockedPerson,
            trackedCandidates: nextTrackedCandidates,
            lastNowMs: nowMs,
          },
          lockedIndex: matchedLockedIdx,
          reasons,
          approaching,
          candidates: candidateMetricsList.map((cand, idx) => ({
            ...cand,
            reason: idx === matchedLockedIdx ? 'locked' : cand.reason,
          })),
        };
      } else {
        // Encontrada pero fuera de zona con histéresis
        const timeOutOfZone = nowMs - lockedPerson.lastSeenMs;
        if (timeOutOfZone >= config.LOST_MS) {
          // Soltar fijada tras superar LOST_MS
          // Al soltar, no se fija otra persona en el mismo frame (cumplir LOCK_MS desde cero)
          const nextTrackedCandidates: TrackedCandidate[] = candidateMetricsList.map(
            (cand) => ({
              lastMidX: cand.midX,
              lastMidY: cand.midY,
              lastCx: cand.cx,
              lastTimeMs: nowMs,
              speed: cand.speed,
              eligibleSinceMs: cand.reason === 'candidate' ? nowMs : null,
            }),
          );

          return {
            state: {
              lockedPerson: null,
              trackedCandidates: nextTrackedCandidates,
              lastNowMs: nowMs,
            },
            lockedIndex: null,
            reasons: candidateMetricsList.map((c) => c.reason),
            approaching,
            candidates: candidateMetricsList,
          };
        } else {
          // En periodo de gracia (sigue reportando locked mientras no expire LOST_MS)
          const reasons = candidateMetricsList.map((cand, idx) =>
            idx === matchedLockedIdx ? 'locked' : cand.reason,
          );

          return {
            state: {
              lockedPerson: {
                ...lockedPerson,
                lastMidX: m.midX,
                lastMidY: m.midY,
                lastCx: m.cx,
                lastTimeMs: nowMs,
                speed: m.speed,
              },
              trackedCandidates: candidateMetricsList.map((cand) => ({
                lastMidX: cand.midX,
                lastMidY: cand.midY,
                lastCx: cand.cx,
                lastTimeMs: nowMs,
                speed: cand.speed,
                eligibleSinceMs: null,
              })),
              lastNowMs: nowMs,
            },
            lockedIndex: matchedLockedIdx,
            reasons,
            approaching,
            candidates: candidateMetricsList.map((cand, idx) => ({
              ...cand,
              reason: idx === matchedLockedIdx ? 'locked' : cand.reason,
            })),
          };
        }
      }
    } else {
      // No encontrada en este frame
      const timeWithoutSeen = nowMs - lockedPerson.lastSeenMs;
      if (timeWithoutSeen >= config.LOST_MS) {
        // Soltar definitivamente
        return {
          state: {
            lockedPerson: null,
            trackedCandidates: candidateMetricsList.map((cand) => ({
              lastMidX: cand.midX,
              lastMidY: cand.midY,
              lastCx: cand.cx,
              lastTimeMs: nowMs,
              speed: cand.speed,
              eligibleSinceMs: cand.reason === 'candidate' ? nowMs : null,
            })),
            lastNowMs: nowMs,
          },
          lockedIndex: null,
          reasons: candidateMetricsList.map((c) => c.reason),
          approaching,
          candidates: candidateMetricsList,
        };
      } else {
        // Todavía en gracia pero sin pose este frame
        return {
          state: {
            lockedPerson,
            trackedCandidates: candidateMetricsList.map((cand) => ({
              lastMidX: cand.midX,
              lastMidY: cand.midY,
              lastCx: cand.cx,
              lastTimeMs: nowMs,
              speed: cand.speed,
              eligibleSinceMs: null,
            })),
            lastNowMs: nowMs,
          },
          lockedIndex: null,
          reasons: candidateMetricsList.map((c) => c.reason),
          approaching,
          candidates: candidateMetricsList,
        };
      }
    }
  }

  // 5. Caso B: No hay nadie fijado -> Buscar nueva persona a fijar
  // Actualizar eligibleSinceMs para cada candidata
  const updatedTracked: TrackedCandidate[] = [];
  const eligibleCandidates: Array<{
    index: number;
    metrics: CandidateMetrics;
    eligibleDuration: number;
  }> = [];

  for (let i = 0; i < candidateMetricsList.length; i++) {
    const m = candidateMetricsList[i];
    if (!m) continue;
    const isEligible = m.reason === 'candidate';

    // Buscar si tenía récord previo en prevTracked
    let prevCand: TrackedCandidate | null = null;
    let bestDist = Infinity;
    for (const pt of prevTracked) {
      if (!pt) continue;
      const dist = Math.hypot(m.midX - pt.lastMidX, m.midY - pt.lastMidY);
      if (dist <= config.MATCH_DIST && dist < bestDist) {
        bestDist = dist;
        prevCand = pt;
      }
    }

    let eligibleSinceMs: number | null = null;
    if (isEligible) {
      eligibleSinceMs = prevCand?.eligibleSinceMs ?? nowMs;
      const duration = nowMs - eligibleSinceMs;
      if (duration >= config.LOCK_MS) {
        eligibleCandidates.push({ index: i, metrics: m, eligibleDuration: duration });
      }
    }

    updatedTracked.push({
      lastMidX: m.midX,
      lastMidY: m.midY,
      lastCx: m.cx,
      lastTimeMs: nowMs,
      speed: m.speed,
      eligibleSinceMs,
    });
  }

  // Si hay al menos una candidata que cumplió LOCK_MS continuo:
  if (eligibleCandidates.length > 0) {
    // Escoger la de mayor puntaje
    eligibleCandidates.sort((a, b) => b.metrics.score - a.metrics.score);
    const winner = eligibleCandidates[0];
    if (winner) {
      const lockedIndex = winner.index;

      const reasons = candidateMetricsList.map((c, idx) =>
        idx === lockedIndex ? 'locked' : c.reason,
      );

      const newLockedPerson = {
        lastMidX: winner.metrics.midX,
        lastMidY: winner.metrics.midY,
        lastCx: winner.metrics.cx,
        lastTimeMs: nowMs,
        speed: winner.metrics.speed,
        lockedSinceMs: nowMs,
        lastSeenMs: nowMs,
      };

      return {
        state: {
          lockedPerson: newLockedPerson,
          trackedCandidates: updatedTracked,
          lastNowMs: nowMs,
        },
        lockedIndex,
        reasons,
        approaching,
        candidates: candidateMetricsList.map((cand, idx) => ({
          ...cand,
          reason: idx === lockedIndex ? 'locked' : cand.reason,
        })),
      };
    }
  }

  // Nadie fijado todavía
  return {
    state: {
      lockedPerson: null,
      trackedCandidates: updatedTracked,
      lastNowMs: nowMs,
    },
    lockedIndex: null,
    reasons: candidateMetricsList.map((c) => c.reason),
    approaching,
    candidates: candidateMetricsList,
  };
}
