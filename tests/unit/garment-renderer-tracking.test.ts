// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGarmentRenderer } from '@/hooks/useGarmentRenderer';
import { computeSimilarityTransform } from '@/lib/illustration-transform';
import { useSizingStore } from '@/store/sizing';
import { useGarmentStore } from '@/store/garment';

describe('useGarmentRenderer tracking reset y referencia de escala independiente', () => {
  beforeEach(() => {
    useSizingStore.setState({
      hasProfile: false,
      sessionId: null,
      tallaHabitual: null,
      preferenciaFit: 'regular',
      arConfianza: 0,
      tallasElegidas: {},
    });
    useGarmentStore.setState({
      activeGarmentId: null,
      activeVariantId: null,
      runtime: null,
    });
  });

  it('(a) con referencia calculada con prenda de Ds=100, cambiar a prenda de Ds=160 -> la escala resultante NO queda forzada por el clamp anterior (escala ≈ fWidth/160)', () => {
    const fWidth = 200; // Ancho anatómico de hombros en pantalla
    const Ds1 = 100; // Prenda 1: distancia entre anclas de hombros
    const Ds2 = 160; // Prenda 2: distancia entre anclas de hombros

    // Simulación: se aprende el ancho anatómico en píxeles con la prenda 1
    // referenceShoulderWidthPx = fWidth = 200
    const referenceShoulderWidthPx = fWidth;

    // En la implementación anterior (con bug):
    // referenceScale era fWidth / Ds1 = 200 / 100 = 2.0.
    // Al cambiar a la prenda 2 (Ds2 = 160), computeSimilarityTransform recibía referenceScale = 2.0,
    // por lo que el clamp [0.90 * referenceScale, 1.12 * referenceScale] forzaba la escala a [1.80, 2.24],
    // a pesar de que la escala real debía ser fWidth / Ds2 = 200 / 160 = 1.25.
    const oldBuggyReferenceScale = fWidth / Ds1;
    const buggyTransform = computeSimilarityTransform({
      srcShoulderL: { x: 0, y: 0 },
      srcShoulderR: { x: Ds2, y: 0 },
      dstShoulderL: { x: 100, y: 200 },
      dstShoulderR: { x: 100 + fWidth, y: 200 },
      referenceScale: oldBuggyReferenceScale,
      fitFactor: 1.0,
    });
    // El clamp erróneo forzaba 0.90 * 2.0 = 1.80
    expect(buggyTransform.scale).toBeCloseTo(0.9 * oldBuggyReferenceScale, 3);
    expect(buggyTransform.scale).not.toBeCloseTo(fWidth / Ds2, 2);

    // Con la implementación corregida:
    // referenceScale independiente de la prenda = referenceShoulderWidthPx / Ds de la prenda actual
    const correctedReferenceScale = referenceShoulderWidthPx / Ds2; // 200 / 160 = 1.25
    const correctedTransform = computeSimilarityTransform({
      srcShoulderL: { x: 0, y: 0 },
      srcShoulderR: { x: Ds2, y: 0 },
      dstShoulderL: { x: 100, y: 200 },
      dstShoulderR: { x: 100 + fWidth, y: 200 },
      referenceScale: correctedReferenceScale,
      fitFactor: 1.0,
    });

    // La escala resultante NO queda forzada por el clamp anterior y es exactamente fWidth / Ds2
    expect(correctedTransform.scale).toBeCloseTo(fWidth / Ds2, 3);
    expect(correctedTransform.scale).toBeCloseTo(1.25, 3);
  });

  it('(b) cambio de sessionId -> todos los refs de tracking vuelven a null', () => {
    useSizingStore.setState({ sessionId: 'session-visitor-1' });

    const videoRef = { current: document.createElement('video') };
    const canvasRef = { current: document.createElement('canvas') };

    const { result } = renderHook(() =>
      useGarmentRenderer(videoRef, canvasRef, 'portrait', null, null, 'present'),
    );

    // Poblamos los refs con valores de tracking simulados
    act(() => {
      if (result.current._testTrackingRefs) {
        result.current._testTrackingRefs.referenceShoulderWidthPx = 215;
        result.current._testTrackingRefs.shoulderToEarRatio = 2.45;
        result.current._testTrackingRefs.lastValidTransform = {
          tx: 120,
          ty: 240,
          rotation: 0.05,
          scale: 1.15,
        };
        result.current._testTrackingRefs.lastValidAnchorsDst = [{ x: 10, y: 20 }];
        result.current._testTrackingRefs.lastValidAnchorsSrc = [{ x: 30, y: 40 }];
        result.current._testTrackingRefs.lostTrackingSince = 5000;
      }
    });

    // Verificamos que los refs están poblados
    expect(result.current._testTrackingRefs?.referenceShoulderWidthPx).toBe(215);
    expect(result.current._testTrackingRefs?.shoulderToEarRatio).toBe(2.45);
    expect(result.current._testTrackingRefs?.lastValidTransform).not.toBeNull();
    expect(result.current._testTrackingRefs?.lastValidAnchorsDst).toHaveLength(1);
    expect(result.current._testTrackingRefs?.lastValidAnchorsSrc).toHaveLength(1);
    expect(result.current._testTrackingRefs?.lostTrackingSince).toBe(5000);

    // Visitante nuevo (cambio de sessionId)
    act(() => {
      useSizingStore.setState({ sessionId: 'session-visitor-2' });
    });

    // Todos los refs de tracking deben haber vuelto a null
    expect(result.current._testTrackingRefs?.referenceShoulderWidthPx).toBeNull();
    expect(result.current._testTrackingRefs?.shoulderToEarRatio).toBeNull();
    expect(result.current._testTrackingRefs?.lastValidTransform).toBeNull();
    expect(result.current._testTrackingRefs?.lastValidAnchorsDst).toBeNull();
    expect(result.current._testTrackingRefs?.lastValidAnchorsSrc).toBeNull();
    expect(result.current._testTrackingRefs?.lostTrackingSince).toBeNull();
  });

  it('reinicio de sesión (sessionId -> null) -> todos los refs de tracking vuelven a null', () => {
    useSizingStore.setState({ sessionId: 'active-session-before-restart' });

    const videoRef = { current: document.createElement('video') };
    const canvasRef = { current: document.createElement('canvas') };

    const { result } = renderHook(() =>
      useGarmentRenderer(videoRef, canvasRef, 'portrait', null, null, 'present'),
    );

    act(() => {
      if (result.current._testTrackingRefs) {
        result.current._testTrackingRefs.referenceShoulderWidthPx = 190;
        result.current._testTrackingRefs.shoulderToEarRatio = 2.2;
        result.current._testTrackingRefs.lastValidTransform = {
          tx: 80,
          ty: 180,
          rotation: 0,
          scale: 1.0,
        };
      }
    });

    expect(result.current._testTrackingRefs?.referenceShoulderWidthPx).toBe(190);

    // Al reiniciar sesión (restartSession), sessionId se setea en null
    act(() => {
      useSizingStore.setState({ sessionId: null });
    });

    expect(result.current._testTrackingRefs?.referenceShoulderWidthPx).toBeNull();
    expect(result.current._testTrackingRefs?.shoulderToEarRatio).toBeNull();
    expect(result.current._testTrackingRefs?.lastValidTransform).toBeNull();
  });
});
