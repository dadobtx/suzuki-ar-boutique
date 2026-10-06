/**
 * Funciones puras para métricas estadísticas y exportación CSV
 * del diagnóstico de detección de mano y gestos a distancia.
 */

export interface Landmark2D {
  x: number;
  y: number;
}

export interface HandFrameSample {
  timestamp: number;
  hasHand: boolean;
  palmWidthPx: number | null;
  gesture: string | null;
  gestureScore: number | null;
  gestureLatencyMs: number;
  poseActive: boolean;
  poseLatencyMs?: number;
  wristAboveShoulder?: boolean;
  wristVisibilityAvg?: number;
}

export interface DiagHandRecord {
  id: string;
  timestamp: number;
  camera: string;
  resolution: string;
  distance: number;
  requestedGesture: string;
  detectionRate: number;
  matchRate: number;
  avgScore: number;
  avgPalmWidthPx: number;
  gestureFps: number;
  poseFps: number | null;
  gestureLatencyP95: number;
  poseLatencyP95: number | null;
  delegate: string;
  thresholds: string;
}

/**
 * Mapeo de gestos pedidos a nombres canónicos reconocidos por MediaPipe.
 */
export const GESTURE_NAME_MAP: Record<string, string[]> = {
  'Palma abierta': ['Open_Palm'],
  Puño: ['Closed_Fist'],
  'Índice arriba': ['Pointing_Up'],
  'Mano bajada': ['None', ''],
};

/**
 * Comprueba si un gesto detectado coincide con el pedido por el usuario.
 */
export function matchesRequestedGesture(
  detected: string | null | undefined,
  requested: string,
): boolean {
  if (!detected || detected === 'None') {
    return requested === 'Mano bajada';
  }
  const expected = GESTURE_NAME_MAP[requested];
  if (expected) {
    return expected.includes(detected);
  }
  return detected.toLowerCase() === requested.toLowerCase();
}

/**
 * Calcula el percentil P de un arreglo de números (0 <= p <= 100).
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0]!;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

/**
 * Calcula el percentil 95 (P95).
 */
export function p95(values: number[]): number {
  return percentile(values, 95);
}

/**
 * Calcula el promedio aritmético de una serie de números.
 */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

/**
 * Calcula la tasa de detección (0–100%) en base a frames con mano detectada.
 */
export function calculateDetectionRate(samples: { hasHand: boolean }[]): number {
  if (samples.length === 0) return 0;
  const detected = samples.filter((s) => s.hasHand).length;
  return (detected / samples.length) * 100;
}

/**
 * Calcula el porcentaje de frames (0–100%) donde el gesto detectado coincide con el pedido.
 */
export function calculateMatchRate(
  samples: { gesture: string | null }[],
  requested: string,
): number {
  if (samples.length === 0) return 0;
  const matches = samples.filter((s) =>
    matchesRequestedGesture(s.gesture, requested),
  ).length;
  return (matches / samples.length) * 100;
}

/**
 * Ancho de palma en píxeles de la imagen original (distancia entre landmark 5 e landmark 17).
 */
export function calculatePalmWidth(
  landmark5: Landmark2D,
  landmark17: Landmark2D,
  imageWidth: number,
  imageHeight: number,
): number {
  const dx = (landmark17.x - landmark5.x) * imageWidth;
  const dy = (landmark17.y - landmark5.y) * imageHeight;
  return Math.hypot(dx, dy);
}

/**
 * Filtra muestras dentro de una ventana de tiempo móvil (por defecto 5000 ms).
 */
export function filterSlidingWindow<T extends { timestamp: number }>(
  samples: T[],
  now: number,
  windowMs = 5000,
): T[] {
  const cutoff = now - windowMs;
  return samples.filter((s) => s.timestamp >= cutoff);
}

/**
 * Calcula FPS a partir de timestamps dentro de una ventana de tiempo.
 */
export function calculateFpsFromTimestamps(
  timestamps: number[],
  windowMs = 5000,
): number {
  if (timestamps.length < 2) return 0;
  const sorted = [...timestamps].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return 0;
  const duration = last - first;
  if (duration <= 0) return 0;
  // Si la duración observada es menor que la ventana, computar fps sobre el span real
  const effectiveDurationSec = Math.min(duration, windowMs) / 1000;
  return (sorted.length - 1) / effectiveDurationSec;
}

/**
 * Determina el gesto dominante y su score promedio en una serie de muestras.
 */
export function getDominantGesture(
  samples: { gesture: string | null; gestureScore: number | null }[],
): { gesture: string; count: number; avgScore: number } | null {
  const counts: Record<string, { count: number; scoreSum: number }> = {};
  for (const s of samples) {
    if (!s.gesture || s.gesture === 'None') continue;
    const existing = counts[s.gesture];
    if (!existing) {
      counts[s.gesture] = { count: 1, scoreSum: s.gestureScore ?? 0 };
    } else {
      existing.count += 1;
      existing.scoreSum += s.gestureScore ?? 0;
    }
  }

  let dominant: string | null = null;
  let maxCount = 0;
  for (const [gest, data] of Object.entries(counts)) {
    if (data.count > maxCount) {
      maxCount = data.count;
      dominant = gest;
    }
  }

  if (!dominant) return null;
  const data = counts[dominant];
  if (!data) return null;
  return {
    gesture: dominant,
    count: data.count,
    avgScore: data.scoreSum / data.count,
  };
}

/**
 * Escapa un campo individual para formato CSV según RFC 4180.
 */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializa un conjunto de registros de diagnóstico a una cadena CSV compatible con Excel.
 */
export function recordsToCsv(records: DiagHandRecord[]): string {
  const headers = [
    'Fecha',
    'Cámara',
    'Resolución',
    'Distancia (m)',
    'Gesto pedido',
    'Tasa detección (%)',
    'Coincidencia (%)',
    'Score promedio',
    'Ancho palma (px)',
    'FPS gesto',
    'FPS pose',
    'Inferencia P95 (ms)',
    'Inferencia Pose P95 (ms)',
    'Delegate',
    'Umbrales',
  ];

  const lines = [headers.map(escapeCsvField).join(',')];

  for (const r of records) {
    const dateStr = new Date(r.timestamp).toISOString();
    const row = [
      dateStr,
      r.camera,
      r.resolution,
      r.distance.toFixed(1),
      r.requestedGesture,
      r.detectionRate.toFixed(1),
      r.matchRate.toFixed(1),
      r.avgScore.toFixed(2),
      r.avgPalmWidthPx.toFixed(1),
      r.gestureFps.toFixed(1),
      r.poseFps !== null ? r.poseFps.toFixed(1) : 'N/A',
      r.gestureLatencyP95.toFixed(1),
      r.poseLatencyP95 !== null ? r.poseLatencyP95.toFixed(1) : 'N/A',
      r.delegate,
      r.thresholds,
    ];
    lines.push(row.map(escapeCsvField).join(','));
  }

  return lines.join('\r\n');
}
