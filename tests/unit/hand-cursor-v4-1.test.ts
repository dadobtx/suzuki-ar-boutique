import { describe, it, expect, beforeEach } from 'vitest';
import {
  HandCursorTracker,
  isHandRaised,
  type DetectedHandInput,
  type HandFrameUser,
  type HandFrameOutput,
  type HandCursorEvent,
} from '@/lib/hand-cursor';

const SW = 0.2;

const makeUser = (
  opts: {
    leftWristY?: number;
    rightWristY?: number;
    leftElbowY?: number;
    rightElbowY?: number;
  } = {},
): HandFrameUser => ({
  lockedWrists: {
    left: { x: 0.65, y: opts.leftWristY ?? 0.7 },
    right: { x: 0.35, y: opts.rightWristY ?? 0.4 },
  },
  lockedElbows: {
    left: { x: 0.65, y: opts.leftElbowY ?? 0.5 },
    right: { x: 0.35, y: opts.rightElbowY ?? 0.5 },
  },
  sw: SW,
  cx: 0.5,
});

const makeHand = (
  side: 'left' | 'right',
  palmX: number,
  opts: {
    palmY?: number;
    wristY?: number;
    gesture?: string;
    score?: number;
  } = {},
): DetectedHandInput => {
  const wx = side === 'left' ? 0.65 : 0.35;
  const wy = opts.wristY ?? (side === 'left' ? 0.7 : 0.4);
  return {
    wrist: { x: wx, y: wy },
    palmCenter: { x: palmX, y: opts.palmY ?? wy - 0.05 },
    gesture: opts.gesture ?? 'Open_Palm',
    score: opts.score ?? 0.9,
    handedness: side === 'left' ? 'Left' : 'Right',
  };
};

describe('Mano v4.1: Mano levantada y posición inicial correcta (tests/unit/hand-cursor-v4-1.test.ts)', () => {
  let tracker: HandCursorTracker;

  beforeEach(() => {
    tracker = new HandCursorTracker({ mode: 'step' });
  });

  it('función isHandRaised verifica muñeca sobre el codo y respaldos', () => {
    const user = makeUser();
    // Mano derecha con muñeca y=0.4 y codo y=0.5 -> 0.4 < 0.48 -> levantada
    const rightRaised = makeHand('right', 0.35, { wristY: 0.4 });
    expect(isHandRaised(rightRaised, user)).toBe(true);

    // Mano izquierda con muñeca y=0.7 y codo y=0.5 -> 0.7 >= 0.48 -> abajo
    const leftHanging = makeHand('left', 0.65, { wristY: 0.7 });
    expect(isHandRaised(leftHanging, user)).toBe(false);

    // Sin codo visible pero con cadera visible en y=0.8
    const userNoElbow: HandFrameUser = {
      lockedWrists: { left: null, right: { x: 0.35, y: 0.6 } },
      lockedElbows: { left: null, right: { x: 0.35, y: 0.5, visibility: 0.2 } },
      lockedHips: { left: null, right: { x: 0.35, y: 0.8, visibility: 0.9 } },
      sw: SW,
      cx: 0.5,
    };
    // palmCenter.y=0.65 < 0.8 - 0.10 (0.70) -> levantada
    expect(isHandRaised(makeHand('right', 0.35, { palmY: 0.65 }), userNoElbow)).toBe(
      true,
    );
    // palmCenter.y=0.75 >= 0.70 -> abajo
    expect(isHandRaised(makeHand('right', 0.35, { palmY: 0.75 }), userNoElbow)).toBe(
      false,
    );
  });

  it('Mano derecha levantada (muñeca sobre el codo) activa y la izquierda colgando (muñeca bajo el codo) con Open_Palm score 0.9 → la izquierda no cuenta: 0 cambios de mano, 0 pasos de ella', () => {
    const user = makeUser(); // der muñeca 0.4 (codo 0.5), izq muñeca 0.7 (codo 0.5)
    const rightHand = makeHand('right', 0.35, { wristY: 0.4 });
    const leftHanging = makeHand('left', 0.65, {
      wristY: 0.7,
      gesture: 'Open_Palm',
      score: 0.9,
    });

    let t = 0;
    let lastOut: HandFrameOutput | null = null;
    const events: HandCursorEvent[] = [];

    // Activar con la mano derecha levantada (con la izquierda colgando al mismo tiempo)
    while (t <= 600) {
      lastOut = tracker.update({
        nowMs: t,
        hands: [rightHand, leftHanging],
        user,
        itemCount: 10,
        currentIndex: 5,
      });
      events.push(...lastOut.events);
      t += 50;
    }

    expect(lastOut?.cursor.active).toBe(true);
    expect(lastOut?.cursor.poseSide).toBe('Right');
    expect(lastOut?.cursor.handSwitchCount).toBe(0);

    // Mantener 1500 ms más ambas manos presentes
    while (t <= 2100) {
      lastOut = tracker.update({
        nowMs: t,
        hands: [rightHand, leftHanging],
        user,
        itemCount: 10,
        currentIndex: 5,
      });
      events.push(...lastOut.events);
      t += 50;
    }

    expect(lastOut?.cursor.poseSide).toBe('Right');
    expect(lastOut?.cursor.handSwitchCount).toBe(0);
    // 0 pasos de la izquierda
    const leftSteps = events.filter((e) => e.type === 'step' && e.direction === 'left');
    expect(leftSteps).toHaveLength(0);
  });

  it('La izquierda colgando hace un movimiento lateral grande → 0 pasos', () => {
    const user = makeUser();
    let t = 0;
    const events: HandCursorEvent[] = [];

    // La izquierda colgando se mueve lateralmente
    while (t <= 2000) {
      // Mueve x desde 0.65 hasta 0.95
      const palmX = 0.65 + 0.3 * Math.sin(t / 200);
      const hangingHand = makeHand('left', palmX, {
        wristY: 0.7,
        gesture: 'Open_Palm',
        score: 0.9,
      });
      const out = tracker.update({
        nowMs: t,
        hands: [hangingHand],
        user,
        itemCount: 10,
        currentIndex: 5,
      });
      events.push(...out.events);
      t += 50;
    }

    expect(events.filter((e) => e.type === 'step')).toHaveLength(0);
  });

  it('Bajar la mano activa (muñeca pasa bajo el codo) 400 ms → cursor inactivo', () => {
    const user = makeUser();
    let t = 0;
    let out: HandFrameOutput | null = null;

    // Activar mano derecha levantada
    while (t <= 500) {
      const raisedHand = makeHand('right', 0.35, { wristY: 0.4 });
      out = tracker.update({
        nowMs: t,
        hands: [raisedHand],
        user,
        itemCount: 10,
        currentIndex: 5,
      });
      t += 50;
    }
    expect(out?.cursor.active).toBe(true);

    // Bajar la mano derecha: muñeca pasa a 0.65 (codo en 0.5)
    // El usuario de pose ahora tiene muñeca derecha en 0.65
    const userLowered = makeUser({ rightWristY: 0.65 });
    while (t <= 1000) {
      const loweredHand = makeHand('right', 0.35, { wristY: 0.65 });
      out = tracker.update({
        nowMs: t,
        hands: [loweredHand],
        user: userLowered,
        itemCount: 10,
        currentIndex: 5,
      });
      t += 50;
    }

    // Tras 500 ms bajada (> 300 ms de timeout), el cursor debe estar inactivo
    expect(out?.cursor.active).toBe(false);
  });

  it('Con la prenda del índice 6 puesta: bajar la mano, que el tracker se reinicie, y volver a levantarla → al activarse el índice es 6; un paso a la derecha → 7 (no 1)', () => {
    const user = makeUser();
    let t = 0;
    let out: HandFrameOutput | null = null;
    const events: HandCursorEvent[] = [];

    // 1. Activar con prenda 6 puesta (currentIndex = 6)
    while (t <= 500) {
      const hand = makeHand('right', 0.35, { wristY: 0.4 });
      out = tracker.update({
        nowMs: t,
        hands: [hand],
        user,
        itemCount: 10,
        currentIndex: 6,
      });
      t += 50;
    }
    expect(out?.cursor.active).toBe(true);
    expect(out?.cursor.index).toBe(6);

    // 2. Bajar la mano 400 ms
    const userLowered = makeUser({ rightWristY: 0.65 });
    while (t <= 950) {
      const lowered = makeHand('right', 0.35, { wristY: 0.65 });
      out = tracker.update({
        nowMs: t,
        hands: [lowered],
        user: userLowered,
        itemCount: 10,
        currentIndex: 6,
      });
      t += 50;
    }
    expect(out?.cursor.active).toBe(false);

    // 3. Reiniciar tracker y verificar que NUNCA publica index = 0 mientras está inactivo
    tracker.reset();
    const inactiveOut = tracker.update({
      nowMs: t,
      hands: [],
      user,
      itemCount: 10,
      currentIndex: 6,
    });
    expect(inactiveOut.cursor.active).toBe(false);
    expect(inactiveOut.cursor.index).toBe(6); // Mantiene el de la prenda activa, no 0

    // 4. Volver a levantar la mano
    t += 50;
    while (t <= 1500) {
      const hand = makeHand('right', 0.35, { wristY: 0.4 });
      out = tracker.update({
        nowMs: t,
        hands: [hand],
        user,
        itemCount: 10,
        currentIndex: 6,
      });
      t += 50;
    }
    expect(out?.cursor.active).toBe(true);
    // Al activarse el índice debe ser 6 (la prenda puesta)
    expect(out?.cursor.index).toBe(6);

    // 5. Un paso a la derecha (desplazar x hacia afuera, d >= 0.35)
    // Con sw = 0.2 y anchorX = 0.65 (espejado 1 - 0.35), para d = +0.5 requerimos rawX = 0.65 + 0.5 * 0.2 = 0.75 -> palmX = 1 - 0.75 = 0.25
    while (t <= 2200) {
      const displacedHand = makeHand('right', 0.2, { wristY: 0.4 });
      out = tracker.update({
        nowMs: t,
        hands: [displacedHand],
        user,
        itemCount: 10,
        currentIndex: 6,
      });
      events.push(...out.events);
      t += 50;
    }

    const stepEvents = events.filter((e) => e.type === 'step');
    expect(stepEvents.length).toBeGreaterThanOrEqual(1);
    expect(stepEvents[0]?.direction).toBe('right');
    // El índice debe haber avanzado a 7, NO a 1
    expect(stepEvents[0]?.index).toBe(7);
    expect(out?.cursor.index).toBe(7);
  });

  it('Sin prenda puesta y foco en 4 → al activarse el índice es 4', () => {
    const user = makeUser();
    let t = 0;
    let out: HandFrameOutput | null = null;

    // Activar con currentIndex = 4 (foco en 4, sin prenda puesta)
    while (t <= 500) {
      const hand = makeHand('right', 0.35, { wristY: 0.4 });
      out = tracker.update({
        nowMs: t,
        hands: [hand],
        user,
        itemCount: 10,
        currentIndex: 4,
      });
      t += 50;
    }

    expect(out?.cursor.active).toBe(true);
    expect(out?.cursor.index).toBe(4);
  });

  it('Con el cursor inactivo, el tracker publica el índice recibido o null, nunca 0 arbitrario por reset', () => {
    tracker.reset();
    const out1 = tracker.update({
      nowMs: 100,
      hands: [],
      user: makeUser(),
      itemCount: 10,
      currentIndex: 8,
    });
    expect(out1.cursor.active).toBe(false);
    expect(out1.cursor.index).toBe(8);

    tracker.reset();
    const out2 = tracker.update({
      nowMs: 200,
      hands: [],
      user: makeUser(),
      itemCount: 10,
    });
    expect(out2.cursor.active).toBe(false);
    expect(out2.cursor.index).toBeNull();
  });
});
