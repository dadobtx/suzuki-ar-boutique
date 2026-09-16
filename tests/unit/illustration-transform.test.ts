import { describe, it, expect } from 'vitest';
import {
  computeSimilarityTransform,
  applySimilarityTransform,
  computeHeadExclusion,
  isPointInsideEllipse,
  MAX_ROTATION_RAD,
  HEAD_VISIBILITY_THRESHOLD,
} from '@/lib/illustration-transform';
import type { SimilarityInput } from '@/lib/illustration-transform';
import type { Point } from '@/lib/garment-warping';

describe('illustration-transform', () => {
  // Anchors de origen representativos de 990F0-BKTM1 (1254x1254)
  const baseInput: SimilarityInput = {
    srcShoulderL: { x: 290, y: 189 },
    srcShoulderR: { x: 957, y: 189 },
    dstShoulderL: { x: 200, y: 300 },
    dstShoulderR: { x: 400, y: 300 },
    referenceScale: null,
    fitFactor: 1.0,
  };

  const imgW = 1254;
  const imgH = 1254;
  const srcCorners: Point[] = [
    { x: 0, y: 0 },
    { x: imgW, y: 0 },
    { x: imgW, y: imgH },
    { x: 0, y: imgH },
  ];
  const srcMs: Point = {
    x: (baseInput.srcShoulderL.x + baseInput.srcShoulderR.x) / 2,
    y: (baseInput.srcShoulderL.y + baseInput.srcShoulderR.y) / 2,
  };

  it('Conservación de proporciones: la relación ancho/alto del cuadrilátero transformado es idéntica a la del origen (tolerancia 1e-6)', () => {
    const testCases: SimilarityInput[] = [
      baseInput,
      {
        ...baseInput,
        dstShoulderL: { x: 150, y: 220 },
        dstShoulderR: { x: 380, y: 240 }, // leve rotación
      },
      {
        ...baseInput,
        dstShoulderL: { x: 300, y: 100 },
        dstShoulderR: { x: 450, y: 90 }, // otra escala y ángulo
        fitFactor: 0.95,
      },
    ];

    const originAspect = imgW / imgH;

    for (const input of testCases) {
      const transform = computeSimilarityTransform(input);
      const curSrcMs: Point = {
        x: (input.srcShoulderL.x + input.srcShoulderR.x) / 2,
        y: (input.srcShoulderL.y + input.srcShoulderR.y) / 2,
      };

      const p0 = applySimilarityTransform(transform, srcCorners[0]!, curSrcMs);
      const p1 = applySimilarityTransform(transform, srcCorners[1]!, curSrcMs);
      const p2 = applySimilarityTransform(transform, srcCorners[2]!, curSrcMs);
      const p3 = applySimilarityTransform(transform, srcCorners[3]!, curSrcMs);

      const topWidth = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const bottomWidth = Math.hypot(p2.x - p3.x, p2.y - p3.y);
      const leftHeight = Math.hypot(p3.x - p0.x, p3.y - p0.y);
      const rightHeight = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      // Los lados opuestos deben ser iguales
      expect(Math.abs(topWidth - bottomWidth)).toBeLessThan(1e-6);
      expect(Math.abs(leftHeight - rightHeight)).toBeLessThan(1e-6);

      const transformedAspect = topWidth / leftHeight;
      expect(Math.abs(transformedAspect - originAspect)).toBeLessThan(1e-6);
    }
  });

  it('Relación bajo/superior constante: el cociente entre el ancho del ruedo y el ancho de hombros se preserva exactamente', () => {
    // Tomamos dos anchos en la ilustración original: hombros y ruedo (bajo)
    const shoulderWidthSrc = Math.hypot(
      baseInput.srcShoulderR.x - baseInput.srcShoulderL.x,
      baseInput.srcShoulderR.y - baseInput.srcShoulderL.y,
    );
    const hemPtL: Point = { x: 348, y: 1195 };
    const hemPtR: Point = { x: 905, y: 1195 };
    const hemWidthSrc = Math.hypot(hemPtR.x - hemPtL.x, hemPtR.y - hemPtL.y);
    const expectedRatio = hemWidthSrc / shoulderWidthSrc;

    const transform = computeSimilarityTransform(baseInput);

    const pShoulderL = applySimilarityTransform(transform, baseInput.srcShoulderL, srcMs);
    const pShoulderR = applySimilarityTransform(transform, baseInput.srcShoulderR, srcMs);
    const pHemL = applySimilarityTransform(transform, hemPtL, srcMs);
    const pHemR = applySimilarityTransform(transform, hemPtR, srcMs);

    const shoulderWidthDst = Math.hypot(
      pShoulderR.x - pShoulderL.x,
      pShoulderR.y - pShoulderL.y,
    );
    const hemWidthDst = Math.hypot(pHemR.x - pHemL.x, pHemR.y - pHemL.y);
    const dstRatio = hemWidthDst / shoulderWidthDst;

    expect(Math.abs(dstRatio - expectedRatio)).toBeLessThan(1e-6);
  });

  it('Límite de rotación: con una línea de hombros a 40°, la rotación devuelta se satura en MAX_ROTATION_RAD y no salta', () => {
    const angle40Deg = (40 * Math.PI) / 180;
    const dist = 200;
    const input40Deg: SimilarityInput = {
      ...baseInput,
      dstShoulderL: { x: 100, y: 100 },
      dstShoulderR: {
        x: 100 + dist * Math.cos(angle40Deg),
        y: 100 + dist * Math.sin(angle40Deg),
      },
    };

    const transformPos = computeSimilarityTransform(input40Deg);
    expect(transformPos.rotation).toBeCloseTo(MAX_ROTATION_RAD, 5);

    // Caso inverso: -40°
    const inputMinus40Deg: SimilarityInput = {
      ...baseInput,
      dstShoulderL: { x: 100, y: 100 },
      dstShoulderR: {
        x: 100 + dist * Math.cos(-angle40Deg),
        y: 100 + dist * Math.sin(-angle40Deg),
      },
    };
    const transformNeg = computeSimilarityTransform(inputMinus40Deg);
    expect(transformNeg.rotation).toBeCloseTo(-MAX_ROTATION_RAD, 5);
  });

  it('Anti-colapso de escala: con referenceScale fijo y un Dd que cae a la mitad (giro de cuerpo), la escala no baja de 0.90 x referenceScale', () => {
    const referenceScale = 0.5;
    const normalDd = 667 * referenceScale; // 333.5
    const halfDd = normalDd / 2; // cuerpo girado, distancia proyectada reducida al 50%

    const inputHalfWidth: SimilarityInput = {
      ...baseInput,
      dstShoulderL: { x: 200, y: 300 },
      dstShoulderR: { x: 200 + halfDd, y: 300 },
      referenceScale,
    };

    const transform = computeSimilarityTransform(inputHalfWidth);
    // Sin anti-colapso sería 0.25; con anti-colapso no debe bajar de 0.90 * 0.5 = 0.45
    expect(transform.scale).toBeCloseTo(0.9 * referenceScale, 5);
  });

  it('Anti-colapso de escala superior: no excede 1.12 x referenceScale', () => {
    const referenceScale = 0.5;
    const doubleDd = 667 * referenceScale * 2; // acercamiento brusco

    const inputDoubleWidth: SimilarityInput = {
      ...baseInput,
      dstShoulderL: { x: 200, y: 300 },
      dstShoulderR: { x: 200 + doubleDd, y: 300 },
      referenceScale,
    };

    const transform = computeSimilarityTransform(inputDoubleWidth);
    expect(transform.scale).toBeCloseTo(1.12 * referenceScale, 5);
  });

  it('Escala uniforme: la escala es un único factor aplicable a X e Y', () => {
    const transform = computeSimilarityTransform(baseInput);
    expect(typeof transform.scale).toBe('number');
    expect(Number.isFinite(transform.scale)).toBe(true);
    expect(transform.scale).toBeGreaterThan(0);

    // Mapeo de Ms debe ser exactamente Md
    const curSrcMs: Point = {
      x: (baseInput.srcShoulderL.x + baseInput.srcShoulderR.x) / 2,
      y: (baseInput.srcShoulderL.y + baseInput.srcShoulderR.y) / 2,
    };
    const mappedMs = applySimilarityTransform(transform, curSrcMs, curSrcMs);
    expect(mappedMs.x).toBeCloseTo(
      baseInput.dstShoulderL.x / 2 + baseInput.dstShoulderR.x / 2,
      5,
    );
    expect(mappedMs.y).toBeCloseTo(
      baseInput.dstShoulderL.y / 2 + baseInput.dstShoulderR.y / 2,
      5,
    );
  });

  describe('computeHeadExclusion', () => {
    it('con orejas a distancia conocida, la elipse cubre el punto de la boca (9/10) y el de la nariz (0)', () => {
      // Simulación de una cabeza humana centrada en x=200, nivel de orejas y=150, dEar=80
      const dEar = 80;
      const earL = { x: 200 - dEar / 2, y: 150, visibility: 0.9 };
      const earR = { x: 200 + dEar / 2, y: 150, visibility: 0.9 };

      // Landmarks faciales proporcionales a dEar:
      // Nariz ~ 0.20 dEar debajo de la línea de orejas
      const nose = { x: 200, y: 150 + 0.2 * dEar, visibility: 0.9 };
      // Comisuras de boca ~ 0.45 dEar debajo
      const mouthL = { x: 200 - 0.2 * dEar, y: 150 + 0.45 * dEar, visibility: 0.9 };
      const mouthR = { x: 200 + 0.2 * dEar, y: 150 + 0.45 * dEar, visibility: 0.9 };

      const landmarks = {
        0: nose,
        7: earL,
        8: earR,
        9: mouthL,
        10: mouthR,
      };

      const exclusion = computeHeadExclusion(landmarks);
      expect(exclusion).not.toBeNull();
      expect(exclusion!.cx).toBe(200);
      expect(exclusion!.cy).toBeCloseTo(150 - 0.1 * dEar, 5);
      expect(exclusion!.rx).toBeCloseTo(0.75 * dEar, 5);
      expect(exclusion!.ryUp).toBeCloseTo(1.05 * dEar, 5);
      expect(exclusion!.ryDown).toBeCloseTo(1.05 * dEar, 5);
      expect(exclusion!.ry).toBeCloseTo(1.05 * dEar, 5);

      // Verificamos que nariz y boca estén contenidos en la elipse
      expect(isPointInsideEllipse(nose, exclusion!)).toBe(true);
      expect(isPointInsideEllipse(mouthL, exclusion!)).toBe(true);
      expect(isPointInsideEllipse(mouthR, exclusion!)).toBe(true);
    });

    it('soporta configuración asimétrica personalizada (ej. chaleco con capucha)', () => {
      const dEar = 100;
      const landmarks = {
        7: { x: 200 - dEar / 2, y: 200, visibility: 0.95 },
        8: { x: 200 + dEar / 2, y: 200, visibility: 0.95 },
      };
      const config = { rx: 0.85, ryUp: 1.1, ryDown: 1.3 };
      const exclusion = computeHeadExclusion(landmarks, config);

      expect(exclusion).not.toBeNull();
      expect(exclusion!.rx).toBeCloseTo(config.rx * dEar, 5);
      expect(exclusion!.ryUp).toBeCloseTo(config.ryUp * dEar, 5);
      expect(exclusion!.ryDown).toBeCloseTo(config.ryDown * dEar, 5);

      // Punto en el mentón/cuello (dy > 0): a cy + 120px debe estar adentro (120 < 130)
      const chinPoint = { x: 200, y: exclusion!.cy + 120 };
      expect(isPointInsideEllipse(chinPoint, exclusion!)).toBe(true);

      // Punto más abajo de ryDown: a cy + 135px debe estar afuera
      const chestPoint = { x: 200, y: exclusion!.cy + 135 };
      expect(isPointInsideEllipse(chestPoint, exclusion!)).toBe(false);

      // Hacia arriba (dy < 0): a cy - 105px adentro (105 < 110), a cy - 115px afuera
      const foreheadPoint = { x: 200, y: exclusion!.cy - 105 };
      expect(isPointInsideEllipse(foreheadPoint, exclusion!)).toBe(true);
      const aboveHeadPoint = { x: 200, y: exclusion!.cy - 115 };
      expect(isPointInsideEllipse(aboveHeadPoint, exclusion!)).toBe(false);
    });

    it('devuelve null si enabled es false en la configuración', () => {
      const landmarks = {
        7: { x: 150, y: 200, visibility: 0.95 },
        8: { x: 250, y: 200, visibility: 0.95 },
      };
      const exclusion = computeHeadExclusion(landmarks, { enabled: false });
      expect(exclusion).toBeNull();
    });

    it('devuelve null si la visibilidad de una oreja está por debajo del umbral', () => {
      const landmarksLowVis = {
        7: { x: 160, y: 150, visibility: HEAD_VISIBILITY_THRESHOLD - 0.05 },
        8: { x: 240, y: 150, visibility: 0.9 },
      };
      expect(computeHeadExclusion(landmarksLowVis)).toBeNull();

      const landmarksMissing = {
        7: { x: 160, y: 150, visibility: 0.9 },
      };
      expect(computeHeadExclusion(landmarksMissing)).toBeNull();
    });
  });
});
