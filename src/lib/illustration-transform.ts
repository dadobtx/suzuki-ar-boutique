import type { Point } from '@/lib/garment-warping';

/**
 * Límite máximo de rotación permitido para la línea de hombros en ilustración (±15°).
 * Si la inclinación del usuario excede este valor, se satura suavemente al límite.
 */
export const MAX_ROTATION_RAD = (15 * Math.PI) / 180; // ~0.261799 rad

/**
 * Umbral mínimo de visibilidad (suavizada) requerido para las orejas (landmarks 7 y 8)
 * para calcular una zona de exclusión de cabeza confiable.
 */
export const HEAD_VISIBILITY_THRESHOLD = 0.3;

export interface SimilarityTransform {
  /** Traslación en coordenadas de destino (punto medio de hombros de destino Md) */
  tx: number;
  ty: number;
  /** Escala uniforme (la misma en X e Y) */
  scale: number;
  /** Rotación en radianes, ya limitada a [-MAX_ROTATION_RAD, MAX_ROTATION_RAD] */
  rotation: number;
}

export interface SimilarityInput {
  /** Hombro izquierdo en px de la ilustración (origen) */
  srcShoulderL: Point;
  /** Hombro derecho en px de la ilustración (origen) */
  srcShoulderR: Point;
  /** Hombro de destino izquierdo en coords de pantalla del canvas */
  dstShoulderL: Point;
  /** Hombro de destino derecho en coords de pantalla del canvas */
  dstShoulderR: Point;
  /** Escala estable previa (mediana o media lenta), null al inicio */
  referenceScale: number | null;
  /** Factor de ajuste por prenda (default 1.0) */
  fitFactor?: number;
}

/**
 * Calcula la transformación de similitud uniforme 2D (traslación, rotación acotada y escala)
 * que mapea el punto medio de hombros de origen Ms al punto medio de hombros de destino Md.
 *
 * Preserva estrictamente la relación de aspecto original (sin deformación vertical ni caderas).
 */
export function computeSimilarityTransform(input: SimilarityInput): SimilarityTransform {
  const {
    srcShoulderL,
    srcShoulderR,
    dstShoulderL,
    dstShoulderR,
    referenceScale,
    fitFactor = 1.0,
  } = input;

  // 1. Distancias y punto medio de destino
  const Ds = Math.hypot(srcShoulderR.x - srcShoulderL.x, srcShoulderR.y - srcShoulderL.y);

  const Md: Point = {
    x: (dstShoulderL.x + dstShoulderR.x) / 2,
    y: (dstShoulderL.y + dstShoulderR.y) / 2,
  };
  const Dd = Math.hypot(dstShoulderR.x - dstShoulderL.x, dstShoulderR.y - dstShoulderL.y);

  // 2. Escala uniforme
  let scale = Ds > 0 ? (Dd / Ds) * fitFactor : 1.0;

  // Anti-colapso de escala: con respaldo de orejas/postura fiable, clamp apretado a [0.90, 1.12] x referenceScale
  if (referenceScale !== null && referenceScale > 0) {
    const minScale = 0.9 * referenceScale;
    const maxScale = 1.12 * referenceScale;
    scale = Math.max(minScale, Math.min(maxScale, scale));
  }

  // 3. Rotación limitada a ±15°
  const rawDx = dstShoulderR.x - dstShoulderL.x;
  const rawDy = dstShoulderR.y - dstShoulderL.y;
  const rawRotation = Math.atan2(rawDy, rawDx);

  // Normalizar ángulo en (-PI, PI] y saturar en el rango permitido
  const normalizedRotation = Math.atan2(Math.sin(rawRotation), Math.cos(rawRotation));
  const rotation = Math.max(
    -MAX_ROTATION_RAD,
    Math.min(MAX_ROTATION_RAD, normalizedRotation),
  );

  return {
    tx: Md.x,
    ty: Md.y,
    scale,
    rotation,
  };
}

/**
 * Transforma un punto arbitrario de la ilustración aplicando la similitud centrada en srcMidpoint (Ms).
 * Garantiza que applySimilarityTransform(t, Ms, Ms) === { x: t.tx, y: t.ty } === Md.
 */
export function applySimilarityTransform(
  t: SimilarityTransform,
  pt: Point,
  srcMidpoint: Point,
): Point {
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  const dx = pt.x - srcMidpoint.x;
  const dy = pt.y - srcMidpoint.y;
  return {
    x: t.tx + t.scale * (cos * dx - sin * dy),
    y: t.ty + t.scale * (sin * dx + cos * dy),
  };
}

export interface HeadExclusionConfig {
  rx?: number;
  ryUp?: number;
  ryDown?: number;
  enabled?: boolean;
}

export const DEFAULT_HEAD_EXCLUSION_FACTORS = {
  rx: 0.75,
  ryUp: 1.05,
  ryDown: 1.05,
};

export interface HeadExclusion {
  /** Centro de la elipse en el canvas */
  cx: number;
  cy: number;
  /** Radio horizontal */
  rx: number;
  /** Radio vertical hacia arriba (coronilla) */
  ryUp: number;
  /** Radio vertical hacia abajo (mentón y cuello) */
  ryDown: number;
  /** Radio vertical simétrico de compatibilidad */
  ry?: number;
}

export interface LandmarkCssPoint {
  x: number;
  y: number;
  visibility?: number;
}

export type HeadLandmarksInput =
  | Record<number, LandmarkCssPoint>
  | (LandmarkCssPoint | null | undefined)[]
  | {
      earL: LandmarkCssPoint;
      earR: LandmarkCssPoint;
      nose?: LandmarkCssPoint;
      mouthL?: LandmarkCssPoint;
      mouthR?: LandmarkCssPoint;
    };

/**
 * Estima una zona de exclusión de cabeza y rostro a partir de los
 * landmarks de pose mapeados a coordenadas de pantalla.
 *
 * Permite calibración asimétrica por prenda (rx, ryUp, ryDown como múltiplos de dEar).
 */
export function computeHeadExclusion(
  landmarksCss: HeadLandmarksInput,
  configOrMinVis?: HeadExclusionConfig | number,
  minVisibilityArg: number = HEAD_VISIBILITY_THRESHOLD,
): HeadExclusion | null {
  const config =
    typeof configOrMinVis === 'object' && configOrMinVis !== null
      ? configOrMinVis
      : undefined;
  const minVisibility =
    typeof configOrMinVis === 'number' ? configOrMinVis : minVisibilityArg;

  if (config?.enabled === false) {
    return null;
  }

  let earL: LandmarkCssPoint | undefined | null;
  let earR: LandmarkCssPoint | undefined | null;

  if (
    typeof landmarksCss === 'object' &&
    landmarksCss !== null &&
    'earL' in landmarksCss
  ) {
    earL = landmarksCss.earL;
    earR = landmarksCss.earR;
  } else {
    earL = (landmarksCss as Record<number, LandmarkCssPoint>)[7];
    earR = (landmarksCss as Record<number, LandmarkCssPoint>)[8];
  }

  if (!earL || !earR) {
    return null;
  }

  const visL = earL.visibility ?? 1.0;
  const visR = earR.visibility ?? 1.0;

  if (visL < minVisibility || visR < minVisibility) {
    return null;
  }

  const dEar = Math.hypot(earR.x - earL.x, earR.y - earL.y);
  if (dEar <= 0 || !Number.isFinite(dEar)) {
    return null;
  }

  const cx = (earL.x + earR.x) / 2;
  // En canvas Y crece hacia abajo: restar para desplazar hacia arriba
  const cy = (earL.y + earR.y) / 2 - 0.1 * dEar;

  const rx = (config?.rx ?? DEFAULT_HEAD_EXCLUSION_FACTORS.rx) * dEar;
  const ryUp = (config?.ryUp ?? DEFAULT_HEAD_EXCLUSION_FACTORS.ryUp) * dEar;
  const ryDown = (config?.ryDown ?? DEFAULT_HEAD_EXCLUSION_FACTORS.ryDown) * dEar;

  return { cx, cy, rx, ryUp, ryDown, ry: ryDown };
}

/**
 * Verifica si un punto (x, y) cae dentro de la elipse de exclusión (asimétrica en Y).
 */
export function isPointInsideEllipse(pt: Point, el: HeadExclusion): boolean {
  if (el.rx <= 0) return false;
  const dx = pt.x - el.cx;
  const dy = pt.y - el.cy;
  const ry = dy < 0 ? el.ryUp : el.ryDown;
  if (ry <= 0) return false;
  return (dx * dx) / (el.rx * el.rx) + (dy * dy) / (ry * ry) <= 1.0;
}

/**
 * Dibuja la elipse de exclusión con destination-out y borde radial suave (~10% del radio).
 * Maneja la asimetría vertical (ryUp / ryDown) dividiendo en dos mitades continuas.
 */
export function renderHeadExclusion(
  ctx: CanvasRenderingContext2D,
  el: HeadExclusion,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';

  // Mitad superior (y <= cy): usa ryUp
  ctx.save();
  ctx.translate(el.cx, el.cy);
  ctx.scale(el.rx, el.ryUp);
  ctx.beginPath();
  ctx.rect(-1.2, -1.2, 2.4, 1.2);
  ctx.clip();
  const gradUp = ctx.createRadialGradient(0, 0, 0.9, 0, 0, 1.0);
  gradUp.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradUp.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradUp;
  ctx.beginPath();
  ctx.arc(0, 0, 1.0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();

  // Mitad inferior (y > cy): usa ryDown (hacia mentón y cuello)
  ctx.save();
  ctx.translate(el.cx, el.cy);
  ctx.scale(el.rx, el.ryDown);
  ctx.beginPath();
  ctx.rect(-1.2, 0, 2.4, 1.2);
  ctx.clip();
  const gradDown = ctx.createRadialGradient(0, 0, 0.9, 0, 0, 1.0);
  gradDown.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradDown.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradDown;
  ctx.beginPath();
  ctx.arc(0, 0, 1.0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}
