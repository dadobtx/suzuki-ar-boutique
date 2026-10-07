// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  selectUser,
  toVisibleCoordinates,
  computeVisibleAspectRatio,
  computeCandidateMetrics,
  DEFAULT_ACTIVE_ZONE_CONFIG,
  type CandidateInput,
  type ActiveZoneState,
} from '@/lib/active-zone';
import { HandCursorTracker } from '@/lib/hand-cursor';
import type { NormalizedLandmark } from '@/types/pose';

function createDummyLandmarks(options: {
  cx?: number;
  sw?: number;
  cy?: number;
  vis?: number;
}): NormalizedLandmark[] {
  const cx = options.cx ?? 0.5;
  const sw = options.sw ?? 0.28;
  const cy = options.cy ?? 0.5;
  const vis = options.vis ?? 0.9;

  const lms: NormalizedLandmark[] = [];
  for (let i = 0; i < 33; i++) {
    lms.push({ x: cx, y: cy, z: 0, visibility: vis });
  }

  // 0: Nariz
  lms[0] = { x: cx, y: cy - 0.2, z: 0, visibility: vis };
  // 11: Hombro izquierdo
  lms[11] = { x: cx - sw / 2, y: cy, z: 0, visibility: vis };
  // 12: Hombro derecho
  lms[12] = { x: cx + sw / 2, y: cy, z: 0, visibility: vis };
  // 15: Muñeca izquierda
  lms[15] = { x: cx - sw / 2 - 0.05, y: cy + 0.25, z: 0, visibility: vis };
  // 16: Muñeca derecha
  lms[16] = { x: cx + sw / 2 + 0.05, y: cy + 0.25, z: 0, visibility: vis };
  // 23: Cadera izquierda
  lms[23] = { x: cx - sw / 2, y: cy + 0.3, z: 0, visibility: vis };
  // 24: Cadera derecha
  lms[24] = { x: cx + sw / 2, y: cy + 0.3, z: 0, visibility: vis };

  return lms;
}

describe('Active Zone - Algoritmo de selección y permanencia', () => {
  it('Persona lejana (sw 0.10) centrada y quieta → no se fija; approaching true si sw >= 0.132', () => {
    const farLms = createDummyLandmarks({ cx: 0.5, sw: 0.1 });
    const res1 = selectUser([{ landmarks: farLms }], null, DEFAULT_ACTIVE_ZONE_CONFIG, 0);

    expect(res1.lockedIndex).toBeNull();
    expect(res1.reasons[0]).toBe('far');
    expect(res1.approaching).toBe(false);

    // Con sw = 0.15 (>= 0.6 * SW_MIN = 0.132 y < SW_MIN = 0.22)
    const approachingLms = createDummyLandmarks({ cx: 0.5, sw: 0.15 });
    const res2 = selectUser(
      [{ landmarks: approachingLms }],
      null,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      0,
    );

    expect(res2.lockedIndex).toBeNull();
    expect(res2.reasons[0]).toBe('far');
    expect(res2.approaching).toBe(true);
  });

  it('Persona cerca pero descentrada (cx 0.85) → no se fija ("offCenter")', () => {
    const offCenterLms = createDummyLandmarks({ cx: 0.85, sw: 0.28 });
    const res = selectUser(
      [{ landmarks: offCenterLms }],
      null,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      0,
    );

    expect(res.lockedIndex).toBeNull();
    expect(res.reasons[0]).toBe('offCenter');
  });

  it('Persona cerca y centrada que cruza (speed > SPEED_MAX) → no se fija ("moving")', () => {
    // Alguien cruzando a ~1 ancho de pantalla por segundo (Δx = 0.08 cada 80ms <= MATCH_DIST 0.15)
    // Frame 1 en cx = 0.38, t = 0
    const f1Lms = createDummyLandmarks({ cx: 0.38, sw: 0.28 });
    const r1 = selectUser([{ landmarks: f1Lms }], null, DEFAULT_ACTIVE_ZONE_CONFIG, 0);
    expect(r1.lockedIndex).toBeNull();

    // Frame 2 en cx = 0.46, t = 80ms (rawSpeed = 1.0, EMA = 0.3)
    const f2Lms = createDummyLandmarks({ cx: 0.46, sw: 0.28 });
    const r2 = selectUser(
      [{ landmarks: f2Lms }],
      r1.state,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      80,
    );

    // Frame 3 en cx = 0.54 (centrada y cerca), t = 160ms (rawSpeed = 1.0, EMA = 0.3*1 + 0.7*0.3 = 0.51 > 0.35)
    const f3Lms = createDummyLandmarks({ cx: 0.54, sw: 0.28 });
    const r3 = selectUser(
      [{ landmarks: f3Lms }],
      r2.state,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      160,
    );

    expect(r3.lockedIndex).toBeNull();
    expect(r3.reasons[0]).toBe('moving');
  });

  it('Una persona elegible → se fija recién después de LOCK_MS', () => {
    const lms = createDummyLandmarks({ cx: 0.5, sw: 0.28 });
    const input: CandidateInput[] = [{ landmarks: lms }];

    // t = 0: elegible pero 0 ms < LOCK_MS (600 ms)
    const r0 = selectUser(input, null, DEFAULT_ACTIVE_ZONE_CONFIG, 0);
    expect(r0.lockedIndex).toBeNull();
    expect(r0.reasons[0]).toBe('candidate');

    // t = 300 ms: 300 ms < 600 ms
    const r300 = selectUser(input, r0.state, DEFAULT_ACTIVE_ZONE_CONFIG, 300);
    expect(r300.lockedIndex).toBeNull();
    expect(r300.reasons[0]).toBe('candidate');

    // t = 600 ms: cumplió 600 ms -> se fija
    const r600 = selectUser(input, r300.state, DEFAULT_ACTIVE_ZONE_CONFIG, 600);
    expect(r600.lockedIndex).toBe(0);
    expect(r600.reasons[0]).toBe('locked');
  });

  it('Dos elegibles → se fija la de mayor puntaje', () => {
    // Candidata 0: sw = 0.24, cx = 0.45 -> score = 0.24 - 0.5 * 0.05 = 0.215
    // Candidata 1: sw = 0.32, cx = 0.5 -> score = 0.32
    const cand0 = createDummyLandmarks({ cx: 0.45, sw: 0.24 });
    const cand1 = createDummyLandmarks({ cx: 0.5, sw: 0.32 });
    const input: CandidateInput[] = [{ landmarks: cand0 }, { landmarks: cand1 }];

    const r0 = selectUser(input, null, DEFAULT_ACTIVE_ZONE_CONFIG, 0);
    const r600 = selectUser(input, r0.state, DEFAULT_ACTIVE_ZONE_CONFIG, 600);

    expect(r600.lockedIndex).toBe(1);
    expect(r600.reasons[1]).toBe('locked');
  });

  it('Con una fijada, aparece otra con más puntaje → la fijada NO cambia (persona fija)', () => {
    const cand0 = createDummyLandmarks({ cx: 0.48, sw: 0.28 });
    let state: ActiveZoneState | null = null;

    // Fijamos cand0 a t = 600
    state = selectUser(
      [{ landmarks: cand0 }],
      state,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      0,
    ).state;
    const lockedRes = selectUser(
      [{ landmarks: cand0 }],
      state,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      600,
    );
    expect(lockedRes.lockedIndex).toBe(0);
    state = lockedRes.state;

    // Aparece cand1 con mayor puntaje a t = 800
    const cand1New = createDummyLandmarks({ cx: 0.5, sw: 0.35 });
    const dualRes = selectUser(
      [{ landmarks: cand0 }, { landmarks: cand1New }],
      state,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      800,
    );

    // Debe seguir fijada cand0 en índice 0
    expect(dualRes.lockedIndex).toBe(0);
    expect(dualRes.reasons[0]).toBe('locked');
    expect(dualRes.reasons[1]).toBe('candidate');
  });

  it('El orden de las poses se invierte entre frames → la identidad se mantiene por MATCH_DIST', () => {
    const personA = createDummyLandmarks({ cx: 0.5, sw: 0.28 });
    const personB = createDummyLandmarks({ cx: 0.35, sw: 0.24 });

    // Fijamos personA (en índice 0)
    let state = selectUser(
      [{ landmarks: personA }, { landmarks: personB }],
      null,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      0,
    ).state;
    state = selectUser(
      [{ landmarks: personA }, { landmarks: personB }],
      state,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      600,
    ).state;

    // MediaPipe invierte el orden en el siguiente frame: personB es 0, personA es 1
    const swappedRes = selectUser(
      [{ landmarks: personB }, { landmarks: personA }],
      state,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      700,
    );

    // personA (en cx = 0.50) ahora está en índice 1 y debe ser la fijada
    expect(swappedRes.lockedIndex).toBe(1);
    expect(swappedRes.reasons[1]).toBe('locked');
  });

  it('La fijada desaparece 1 s y vuelve → sigue fijada; desaparece 1.6 s → se suelta', () => {
    const person = createDummyLandmarks({ cx: 0.5, sw: 0.28 });

    // Fijamos a t = 600
    let state = selectUser(
      [{ landmarks: person }],
      null,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      0,
    ).state;
    state = selectUser(
      [{ landmarks: person }],
      state,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      600,
    ).state;

    // Desaparece por 1000 ms (t = 1600): periodo de gracia (LOST_MS = 1500)
    const emptyFrame = selectUser([], state, DEFAULT_ACTIVE_ZONE_CONFIG, 1600);
    expect(emptyFrame.lockedIndex).toBeNull();
    state = emptyFrame.state;

    // Reaparece a t = 1800 (1200 ms desde t=600 < 1500 ms)
    const returnFrame = selectUser(
      [{ landmarks: person }],
      state,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      1800,
    );
    expect(returnFrame.lockedIndex).toBe(0);
    expect(returnFrame.reasons[0]).toBe('locked');
    state = returnFrame.state;

    // Ahora desaparece por 1600 ms desde t = 1800 (t = 3400)
    const lostFrame = selectUser([], state, DEFAULT_ACTIVE_ZONE_CONFIG, 3400);
    expect(lostFrame.lockedIndex).toBeNull();
    state = lostFrame.state;

    // Si vuelve a t = 3500, ya NO está fijada inmediatamente: requiere cumplir LOCK_MS desde cero
    const newArrival = selectUser(
      [{ landmarks: person }],
      state,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      3500,
    );
    expect(newArrival.lockedIndex).toBeNull();
    expect(newArrival.reasons[0]).toBe('candidate');
  });

  it('Histéresis: la fijada con sw 0.20 (entre 0.85·SW_MIN y SW_MIN) sigue fijada', () => {
    const personNormal = createDummyLandmarks({ cx: 0.5, sw: 0.28 });

    // Fijamos con sw = 0.28
    let state = selectUser(
      [{ landmarks: personNormal }],
      null,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      0,
    ).state;
    state = selectUser(
      [{ landmarks: personNormal }],
      state,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      600,
    ).state;

    // Se aleja un poco a sw = 0.20 (SW_MIN = 0.22, 0.85 * 0.22 = 0.187). 0.20 > 0.187.
    const personSlightlyFar = createDummyLandmarks({ cx: 0.5, sw: 0.2 });
    const hystRes = selectUser(
      [{ landmarks: personSlightlyFar }],
      state,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      700,
    );

    expect(hystRes.lockedIndex).toBe(0);
    expect(hystRes.reasons[0]).toBe('locked');
  });

  it('Coordenadas visibles: en portrait, un cx de video que cae fuera del recorte visible cuenta como descentrado', () => {
    // Video 1280x720 recortado con object-fit cover en contenedor portrait 1080x1920
    const nativeLm: NormalizedLandmark = { x: 0.15, y: 0.5, z: 0, visibility: 0.9 };
    const visLm = toVisibleCoordinates(nativeLm, 'portrait', 1280, 720, 1080, 1920);

    // En 16:9 recortado a 9:16, x=0.15 nativo queda totalmente fuera de la pantalla (visX < 0)
    expect(visLm.x).toBeLessThan(0);
    expect(Math.abs(visLm.x - 0.5)).toBeGreaterThan(
      DEFAULT_ACTIVE_ZONE_CONFIG.CENTER_BAND,
    );
  });

  it('Persona fijada con speed alta (> SPEED_MAX) durante 2 s sigue fijada si está dentro de la banda', () => {
    const person = createDummyLandmarks({ cx: 0.5, sw: 0.28 });

    // Fijamos a t = 600
    let state = selectUser(
      [{ landmarks: person }],
      null,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      0,
    ).state;
    state = selectUser(
      [{ landmarks: person }],
      state,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      600,
    ).state;

    // Movimiento rápido durante 2s (20 frames de 100ms oscilando 0.45 <-> 0.55, speed ~1.0 > SPEED_MAX 0.35)
    let curTime = 700;
    for (let frame = 0; frame < 20; frame++) {
      const cx = frame % 2 === 0 ? 0.55 : 0.45;
      const movingLms = createDummyLandmarks({ cx, sw: 0.28 });
      const res = selectUser(
        [{ landmarks: movingLms }],
        state,
        DEFAULT_ACTIVE_ZONE_CONFIG,
        curTime,
      );
      expect(res.lockedIndex).toBe(0);
      expect(res.reasons[0]).toBe('locked');
      state = res.state;
      curTime += 100;
    }
  });

  it('Misma persona da el mismo sw normalizado por altura en portrait (center-crop) y en landscape (contain)', () => {
    // Video 1280x720, persona en el centro con hombros separados 200px
    const rawLandmarks = createDummyLandmarks({
      cx: 0.5,
      sw: 200 / 1280,
    });

    // 1. Landscape (contain) en pantalla 1920x1080
    const visLandscape = rawLandmarks.map((lm) =>
      toVisibleCoordinates(lm, 'landscape', 1280, 720, 1920, 1080),
    );
    const arLandscape = computeVisibleAspectRatio('landscape', 1280, 720, 1920, 1080);
    const metricsLandscape = computeCandidateMetrics(
      visLandscape,
      null,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      0,
      arLandscape,
    );

    // 2. Portrait (center-crop) en pantalla 1080x1920
    const visPortrait = rawLandmarks.map((lm) =>
      toVisibleCoordinates(lm, 'portrait', 1280, 720, 1080, 1920),
    );
    const arPortrait = computeVisibleAspectRatio('portrait', 1280, 720, 1080, 1920);
    const metricsPortrait = computeCandidateMetrics(
      visPortrait,
      null,
      DEFAULT_ACTIVE_ZONE_CONFIG,
      0,
      arPortrait,
    );

    // swWidth difiere porque el ancho del viewport visible es diferente
    expect(metricsLandscape.swWidth).not.toBeCloseTo(metricsPortrait.swWidth, 2);

    // Pero sw (normalizado por altura visible = 200 / 720 ≈ 0.2778) es idéntico
    expect(metricsLandscape.sw).toBeCloseTo(200 / 720, 4);
    expect(metricsPortrait.sw).toBeCloseTo(200 / 720, 4);
    expect(metricsLandscape.sw).toBeCloseTo(metricsPortrait.sw, 4);
  });

  it('Con la misma persona, el índice del cursor para una misma posición de mano es idéntico usando swWidth', () => {
    const tracker1 = new HandCursorTracker();
    const tracker2 = new HandCursorTracker();

    const swWidth = 0.25;

    // Antes de calibración de altura: targetUser.sw recibía el ancho visible
    const userBefore = {
      lockedWrists: { left: { x: 0.4, y: 0.6 }, right: { x: 0.6, y: 0.6 } },
      sw: swWidth,
      cx: 0.5,
    };

    // Ahora: useHandCursor pasa sw: lockedCandidate.swWidth ?? lockedCandidate.sw
    const userAfter = {
      lockedWrists: { left: { x: 0.4, y: 0.6 }, right: { x: 0.6, y: 0.6 } },
      sw: swWidth,
      cx: 0.5,
    };

    const hand = {
      wrist: { x: 0.56, y: 0.58 },
      palmCenter: { x: 0.56, y: 0.5 },
      gesture: 'Open_Palm',
      score: 0.9,
    };

    tracker1.update({
      nowMs: 100,
      hands: [hand],
      user: userBefore,
      itemCount: 5,
    });
    const out1 = tracker1.update({
      nowMs: 400,
      hands: [hand],
      user: userBefore,
      itemCount: 5,
    });

    tracker2.update({
      nowMs: 100,
      hands: [hand],
      user: userAfter,
      itemCount: 5,
    });
    const out2 = tracker2.update({
      nowMs: 400,
      hands: [hand],
      user: userAfter,
      itemCount: 5,
    });

    expect(out1.cursor.index).toBe(out2.cursor.index);
    expect(out1.cursor.x).toBeCloseTo(out2.cursor.x, 4);
  });
});
