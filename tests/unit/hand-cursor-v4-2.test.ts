import { describe, it, expect } from 'vitest';
import {
  HandCursorTracker,
  type DetectedHandInput,
  type HandCursorEvent,
  type HandFrameUser,
  type HandFrameOutput,
} from '@/lib/hand-cursor';
import { selectUser, DEFAULT_ACTIVE_ZONE_CONFIG } from '@/lib/active-zone';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

function createPrng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const makeUser = (
  opts: {
    sw?: number;
    cx?: number;
    leftWristY?: number;
    rightWristY?: number;
    leftElbowY?: number;
    rightElbowY?: number;
    userId?: number | string | null;
  } = {},
): HandFrameUser => ({
  lockedWrists: {
    left: { x: 0.65, y: opts.leftWristY ?? 0.4 },
    right: { x: 0.35, y: opts.rightWristY ?? 0.4 },
  },
  lockedElbows: {
    left: { x: 0.65, y: opts.leftElbowY ?? 0.7 },
    right: { x: 0.35, y: opts.rightElbowY ?? 0.7 },
  },
  sw: opts.sw ?? 0.2,
  cx: opts.cx ?? 0.5,
  userId: opts.userId !== undefined ? opts.userId : 'person_1',
});

const makeHand = (
  side: 'left' | 'right',
  palmX: number,
  opts: {
    gesture?: string;
    score?: number;
    palmY?: number;
    wristY?: number;
  } = {},
): DetectedHandInput => {
  const wx = side === 'left' ? 0.65 : 0.35;
  const wy = opts.wristY ?? 0.4;
  return {
    wrist: { x: wx, y: wy },
    palmCenter: { x: palmX, y: opts.palmY ?? wy - 0.05 },
    gesture: opts.gesture ?? 'Open_Palm',
    score: opts.score ?? 0.9,
    handedness: side === 'left' ? 'Left' : 'Right',
  };
};

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

  lms[0] = { x: cx, y: cy - 0.2, z: 0, visibility: vis };
  lms[11] = { x: cx - sw / 2, y: cy, z: 0, visibility: vis };
  lms[12] = { x: cx + sw / 2, y: cy, z: 0, visibility: vis };
  lms[15] = { x: cx - sw / 2 - 0.05, y: cy + 0.25, z: 0, visibility: vis };
  lms[16] = { x: cx + sw / 2 + 0.05, y: cy + 0.25, z: 0, visibility: vis };
  lms[23] = { x: cx - sw / 2, y: cy + 0.3, z: 0, visibility: vis };
  lms[24] = { x: cx + sw / 2, y: cy + 0.3, z: 0, visibility: vis };

  return lms;
}

class Sim {
  tracker = new HandCursorTracker({ mode: 'step' });
  user: HandFrameUser;
  t = 0;
  last: HandFrameOutput | null = null;
  events: HandCursorEvent[] = [];
  private prng: () => number;

  constructor(
    private fps: number,
    seed: number,
    initialSw = 0.2,
    private itemCount = 10,
    public currentIndex = 5,
  ) {
    this.prng = createPrng(seed);
    this.user = makeUser({ sw: initialSw });
  }

  frame(
    hands: DetectedHandInput[],
    isLiveAvailable = false,
    isLiveActive = false,
    busy = false,
    pausedUntilMs = 0,
  ): HandFrameOutput {
    const out = this.tracker.update({
      nowMs: this.t,
      hands,
      user: this.user,
      itemCount: this.itemCount,
      currentIndex: this.currentIndex,
      isLiveAvailable,
      isLiveActive,
      busy,
      pausedUntilMs,
    });
    this.last = out;
    this.events.push(...out.events);
    const dtNominal = 1000 / this.fps;
    const jitter = this.prng() * 0.4 - 0.2; // jitter ±20%
    this.t += dtNominal * (1 + jitter);
    return out;
  }

  run(
    ms: number,
    fn: (elapsed: number) => DetectedHandInput[],
    isLiveAvailable = false,
    isLiveActive = false,
  ) {
    const start = this.t;
    while (this.t - start < ms) {
      this.frame(fn(this.t - start), isLiveAvailable, isLiveActive);
    }
  }

  activate(side: 'left' | 'right', initialScreenX?: number) {
    const screenX = initialScreenX ?? (side === 'left' ? 0.45 : 0.55);
    const videoX = 1 - screenX;
    this.run(500, () => [makeHand(side, videoX)]);
    expect(this.last!.cursor.active).toBe(true);
  }

  stepEvents() {
    return this.events.filter((e) => e.type === 'step');
  }
}

/** palmX (sin espejar) que produce un desplazamiento d respecto al ancla (en x espejado). */
const palmForD = (anchor: number, d: number, sw = 0.2) => 1 - (anchor + d * sw);

describe('Mano v4.2: Recuperar pasos y sesión en vivo (tests/unit/hand-cursor-v4-2.test.ts)', () => {
  describe('4.1 Acercarse (sw=0.30) y alejarse (sw=0.15) con mano quieta al cuerpo', () => {
    for (const fps of [10, 24]) {
      it(`mantiene d cerca de 0 y da exactamente 1 paso a la derecha a ${fps} fps con jitter`, () => {
        const sim = new Sim(fps, 101, 0.3);
        // Activar con mano derecha cerca (sw = 0.30) en screenX = 0.55
        // cx = 0.50, sw = 0.30 -> anchorOffsetSw = (0.55 - 0.50) / 0.30 = 0.1667
        sim.activate('right', 0.55);
        expect(sim.last?.cursor.active).toBe(true);

        // La persona se aleja: swWidth pasa a 0.15 con la mano quieta respecto al cuerpo
        sim.user.sw = 0.15;
        // Posición quieta respecto al cuerpo: cx + anchorOffsetSw * swWidth = 0.50 + (1/6) * 0.15 = 0.525
        const videoXFar = 1 - 0.525;
        sim.run(400, () => [makeHand('right', videoXFar)]);

        // d se mantiene cerca de 0
        expect(Math.abs(sim.last!.cursor.displacement ?? 0)).toBeLessThan(0.1);
        expect(sim.stepEvents().length).toBe(0);

        // Gesto a la derecha: d = 0.5 sostenido
        const a = sim.last!.cursor.anchorX ?? 0.525;
        sim.run(400, () => [makeHand('right', palmForD(a, 0.5, 0.15))]);

        // Da exactamente 1 paso a la derecha
        expect(sim.stepEvents().length).toBe(1);
        expect(sim.stepEvents()[0].direction).toBe('right');
      });
    }
  });

  describe('4.2 Auto-recuperación del disparador tras 1500 ms desarmado', () => {
    for (const fps of [10, 24]) {
      it(`se re-ancla y re-arma tras 1600 ms con d=0.6 sostenido y siguiente gesto da 1 paso a ${fps} fps`, () => {
        const sim = new Sim(fps, 202, 0.2);
        sim.activate('right', 0.5);
        expect(sim.last?.cursor.active).toBe(true);

        // Disparar paso a la derecha con d = 0.6
        // screenX = 0.50 + 0.60 * 0.20 = 0.62 -> videoX = 1 - 0.62 = 0.38
        const videoXRight = 1 - 0.62;
        sim.run(200, () => [makeHand('right', videoXRight)]);
        expect(sim.stepEvents().length).toBe(1);
        expect(sim.last!.cursor.isStepDisarmed).toBe(true);

        // Sostener d = 0.6 durante 1600 ms sin volver al centro (|d| >= 0.20)
        sim.run(1600, () => [makeHand('right', videoXRight)]);

        // Tras > 1500 ms de desarmado sostenido, auto-recovery re-ancla en la posición actual y re-arma
        expect(sim.last!.cursor.isStepDisarmed).toBe(false);
        expect(Math.abs(sim.last!.cursor.displacement ?? 0)).toBeLessThan(0.1);
        // No dispara pasos espurios durante la auto-recuperación
        expect(sim.stepEvents().length).toBe(1);

        // El siguiente gesto desde la nueva ancla a la derecha da 1 paso
        const a2 = sim.last!.cursor.anchorX ?? 0.62;
        sim.run(400, () => [makeHand('right', palmForD(a2, 0.5, 0.2))]);

        expect(sim.stepEvents().length).toBe(2);
        expect(sim.stepEvents()[1].direction).toBe('right');
      });
    }
  });

  describe('4.3 swWidth cambia 30% -> re-ancla sin disparar paso', () => {
    for (const fps of [10, 24]) {
      it(`re-ancla automáticamente sin emitir paso a ${fps} fps con jitter`, () => {
        const sim = new Sim(fps, 303, 0.2);
        sim.activate('right', 0.5);
        expect(sim.last?.cursor.active).toBe(true);

        // swWidth cambia 30%: de 0.20 a 0.26 (|0.26 - 0.20| / 0.20 = 0.30 > 0.25)
        sim.user.sw = 0.26;
        // Mano en screenX = 0.54 (videoX = 0.46)
        sim.run(150, () => [makeHand('right', 1 - 0.54)]);

        // Re-ancla en la posición actual (0.54) sin disparar paso
        expect(sim.stepEvents().length).toBe(0);
        expect(sim.last!.cursor.anchorX).toBeCloseTo(0.54, 1);
        expect(sim.last!.cursor.isStepDisarmed).toBe(false);
      });
    }
  });

  describe('4.4 Sesión en vivo: sin pasos durante live, sincronización con prenda puesta al terminar', () => {
    for (const fps of [10, 24]) {
      it(`0 steps durante 3 s en live; al terminar toma prenda 5 y siguiente paso da 6 a ${fps} fps`, () => {
        const sim = new Sim(fps, 404, 0.2, 10, 3);
        sim.activate('right', 0.5);
        expect(sim.last?.cursor.active).toBe(true);
        expect(sim.last?.cursor.index).toBe(3);

        // Con isLiveActive true durante 3 s y gestos laterales continuos
        sim.run(
          3000,
          (elapsed) => {
            const dir = Math.floor(elapsed / 500) % 2 === 0 ? 1 : -1;
            const screenX = 0.5 + dir * 0.45 * 0.2;
            return [makeHand(dir > 0 ? 'right' : 'left', 1 - screenX)];
          },
          true, // isLiveAvailable
          true, // isLiveActive
        );

        // 0 eventos step y el índice publicado no cambia durante live
        expect(sim.stepEvents().length).toBe(0);
        expect(sim.last?.cursor.index).toBe(3);

        // Al terminar la sesión (isLiveActive = false), con prenda puesta índice 5
        sim.currentIndex = 5;
        sim.frame([makeHand('right', 1 - 0.5)], true, false);

        // Tracker sincroniza inmediatamente con la prenda activa 5
        expect(sim.last?.cursor.index).toBe(5);

        // Y el siguiente paso a la derecha va a índice 6
        // screenX = 0.50 + 0.40 * 0.20 = 0.58 -> videoX = 1 - 0.58 = 0.42
        sim.run(250, () => [makeHand('right', 1 - 0.58)], true, false);

        expect(sim.stepEvents().length).toBe(1);
        expect(sim.stepEvents()[0].index).toBe(6);
        expect(sim.stepEvents()[0].direction).toBe('right');
        expect(sim.last?.cursor.index).toBe(6);
      });
    }
  });

  describe('4.5 Motivos de bloqueo de paso (stepBlockedReason)', () => {
    it('reporta correctamente cada motivo de bloqueo', () => {
      const tracker = new HandCursorTracker({ mode: 'step' });
      const user = makeUser({ sw: 0.2, cx: 0.5 });

      // 1. Sin cursor cuando está inactivo
      let out = tracker.update({
        nowMs: 100,
        hands: [],
        user,
        itemCount: 10,
      });
      expect(out.cursor.stepBlockedReason).toBe('sin cursor');

      // 2. Activar con mano derecha
      for (let t = 200; t <= 700; t += 100) {
        out = tracker.update({
          nowMs: t,
          hands: [makeHand('right', 1 - 0.5)],
          user,
          itemCount: 10,
        });
      }
      expect(out.cursor.active).toBe(true);
      expect(out.cursor.stepBlockedReason).toBe('ninguno');

      // 3. Mano abajo (wrist por debajo del codo)
      const handDown = makeHand('right', 1 - 0.5, { wristY: 0.8, palmY: 0.85 });
      out = tracker.update({
        nowMs: 800,
        hands: [handDown],
        user,
        itemCount: 10,
      });
      expect(out.cursor.stepBlockedReason).toBe('mano abajo');

      // 4. Índice levantado
      const handIndex = makeHand('right', 1 - 0.5, { gesture: 'Pointing_Up' });
      out = tracker.update({
        nowMs: 900,
        hands: [handIndex],
        user,
        itemCount: 10,
      });
      expect(out.cursor.stepBlockedReason).toBe('índice levantado');

      // 5. Pausado en vivo
      out = tracker.update({
        nowMs: 1000,
        hands: [makeHand('right', 1 - 0.5)],
        user,
        itemCount: 10,
        isLiveActive: true,
      });
      expect(out.cursor.stepBlockedReason).toBe('pausado (en vivo)');

      // 6. Pausado táctil
      out = tracker.update({
        nowMs: 1100,
        hands: [makeHand('right', 1 - 0.5)],
        user,
        itemCount: 10,
        pausedUntilMs: 3000,
      });
      expect(out.cursor.stepBlockedReason).toBe('pausado (táctil)');

      // 7. Pausado vuelo (busy)
      out = tracker.update({
        nowMs: 1200,
        hands: [makeHand('right', 1 - 0.5)],
        user,
        itemCount: 10,
        busy: true,
      });
      expect(out.cursor.stepBlockedReason).toBe('pausado (vuelo)');
    });
  });

  describe('4.6 Identidad de persona fijada y resiliencia a null/swaps (v4.2 ajuste)', () => {
    it('mismo userId con la mano desplazada en mitad de un gesto, y un cuadro con userId null -> 1 paso igual, 0 re-anclajes', () => {
      const tracker = new HandCursorTracker({ mode: 'step' });
      const userA = makeUser({ sw: 0.2, cx: 0.5, userId: 'user_A' });
      const userNull = makeUser({ sw: 0.2, cx: 0.5, userId: null });

      // Activar cursor centrado con mano derecha (screenX = 0.50, videoX = 0.50)
      let out = tracker.update({
        nowMs: 100,
        hands: [makeHand('right', 1 - 0.5)],
        user: userA,
        itemCount: 10,
        currentIndex: 5,
      });
      for (let t = 200; t <= 700; t += 100) {
        out = tracker.update({
          nowMs: t,
          hands: [makeHand('right', 1 - 0.5)],
          user: userA,
          itemCount: 10,
          currentIndex: 5,
        });
      }
      expect(out.cursor.active).toBe(true);
      const initialAnchorX = out.cursor.anchorX;
      expect(initialAnchorX).toBeCloseTo(0.5, 1);

      // Iniciar gesto a la derecha: desplazar mano derecha a screenX = 0.58 (videoX = 0.42)
      // d = (0.58 - 0.50) / 0.20 = 0.40 (> 0.30 umbral)
      const allStepEvents: HandCursorEvent[] = [];

      // Frame 1: mano desplazada con userA (t = 800)
      out = tracker.update({
        nowMs: 800,
        hands: [makeHand('right', 1 - 0.6)],
        user: userA,
        itemCount: 10,
        currentIndex: 5,
      });
      allStepEvents.push(...out.events.filter((e) => e.type === 'step'));
      expect(allStepEvents.length).toBe(0);
      expect(out.cursor.anchorX).toBeCloseTo(initialAnchorX!, 1);

      // Frame 2: en mitad del gesto, cuadro con userId null transitorio (t = 850)
      out = tracker.update({
        nowMs: 850,
        hands: [makeHand('right', 1 - 0.6)],
        user: userNull,
        itemCount: 10,
        currentIndex: 5,
      });
      allStepEvents.push(...out.events.filter((e) => e.type === 'step'));
      expect(allStepEvents.length).toBe(0);
      // NO debe re-anclar a 0.60; debe conservar el ancla en ~0.50
      expect(out.cursor.anchorX).toBeCloseTo(initialAnchorX!, 1);

      // Frame 3: mano sigue desplazada con userA (t = 900)
      out = tracker.update({
        nowMs: 900,
        hands: [makeHand('right', 1 - 0.6)],
        user: userA,
        itemCount: 10,
        currentIndex: 5,
      });
      allStepEvents.push(...out.events.filter((e) => e.type === 'step'));

      // Frame 4: mano sigue desplazada con userA (t = 950)
      out = tracker.update({
        nowMs: 950,
        hands: [makeHand('right', 1 - 0.6)],
        user: userA,
        itemCount: 10,
        currentIndex: 5,
      });
      allStepEvents.push(...out.events.filter((e) => e.type === 'step'));

      // Frame 5: mano sigue desplazada con userA (t = 1000)
      out = tracker.update({
        nowMs: 1000,
        hands: [makeHand('right', 1 - 0.6)],
        user: userA,
        itemCount: 10,
        currentIndex: 5,
      });
      allStepEvents.push(...out.events.filter((e) => e.type === 'step'));

      // El gesto continuó y emite exactamente 1 paso
      expect(allStepEvents.length).toBe(1);
      expect(allStepEvents[0].direction).toBe('right');
      expect(allStepEvents[0].index).toBe(6);
      // El ancla nunca se re-ancló a la mano desplazada (0 re-anclajes en el gesto)
      expect(out.cursor.anchorX).toBeCloseTo(initialAnchorX!, 1);
    });

    it("userId cambia de 'A' a 'B' (ambos no nulos) -> re-ancla sin dar paso", () => {
      const tracker = new HandCursorTracker({ mode: 'step' });
      const userA = makeUser({ sw: 0.2, cx: 0.5, userId: 'user_A' });
      const userB = makeUser({ sw: 0.2, cx: 0.5, userId: 'user_B' });

      // Activar con userA centrado
      let out = tracker.update({
        nowMs: 100,
        hands: [makeHand('right', 1 - 0.5)],
        user: userA,
        itemCount: 10,
        currentIndex: 5,
      });
      for (let t = 200; t <= 700; t += 100) {
        out = tracker.update({
          nowMs: t,
          hands: [makeHand('right', 1 - 0.5)],
          user: userA,
          itemCount: 10,
          currentIndex: 5,
        });
      }
      expect(out.cursor.active).toBe(true);
      expect(out.cursor.anchorX).toBeCloseTo(0.5, 1);

      // Desplazar mano a screenX = 0.58 con userA
      out = tracker.update({
        nowMs: 800,
        hands: [makeHand('right', 1 - 0.58)],
        user: userA,
        itemCount: 10,
        currentIndex: 5,
      });
      expect(out.events.filter((e) => e.type === 'step').length).toBe(0);

      // Al siguiente frame entra userB (ambos no nulos y distintos)
      out = tracker.update({
        nowMs: 850,
        hands: [makeHand('right', 1 - 0.58)],
        user: userB,
        itemCount: 10,
        currentIndex: 5,
      });

      // Debe re-anclar en la posición actual de la mano (0.58) sin emitir paso
      expect(out.events.filter((e) => e.type === 'step').length).toBe(0);
      expect(out.cursor.anchorX).toBeCloseTo(0.58, 1);
      expect(out.cursor.isStepDisarmed).toBe(false);

      // Siguiente frame manteniendo la mano en 0.58 no da paso porque ahora está en el nuevo centro
      out = tracker.update({
        nowMs: 950,
        hands: [makeHand('right', 1 - 0.58)],
        user: userB,
        itemCount: 10,
        currentIndex: 5,
      });
      expect(out.events.filter((e) => e.type === 'step').length).toBe(0);
    });

    it('dos personas que intercambian su orden en el arreglo cada 3 cuadros -> la clave de la persona fijada no cambia', () => {
      const personA = createDummyLandmarks({ cx: 0.5, sw: 0.28 });
      const personB = createDummyLandmarks({ cx: 0.35, sw: 0.24 });

      // Iniciar selección con personA en índice 0
      let state = selectUser(
        [{ landmarks: personA }, { landmarks: personB }],
        null,
        DEFAULT_ACTIVE_ZONE_CONFIG,
        0,
      ).state;

      // Esperar 600 ms para fijar personA
      let res = selectUser(
        [{ landmarks: personA }, { landmarks: personB }],
        state,
        DEFAULT_ACTIVE_ZONE_CONFIG,
        600,
      );
      state = res.state;
      expect(res.lockedIndex).toBe(0);
      expect(state.lockedPerson).not.toBeNull();
      const initialLockKey = String(state.lockedPerson!.lockedSinceMs);

      // Simular intercambio de orden en el array cada 3 cuadros
      let nowMs = 650;
      for (let cycle = 0; cycle < 4; cycle++) {
        // 3 cuadros con [personA, personB] (personA en índice 0)
        for (let frame = 0; frame < 3; frame++) {
          nowMs += 50;
          res = selectUser(
            [{ landmarks: personA }, { landmarks: personB }],
            state,
            DEFAULT_ACTIVE_ZONE_CONFIG,
            nowMs,
          );
          state = res.state;
          expect(res.lockedIndex).toBe(0);
          const currentLockKey = state.lockedPerson
            ? String(state.lockedPerson.lockedSinceMs)
            : null;
          expect(currentLockKey).toBe(initialLockKey);
        }

        // 3 cuadros con [personB, personA] (personA en índice 1)
        for (let frame = 0; frame < 3; frame++) {
          nowMs += 50;
          res = selectUser(
            [{ landmarks: personB }, { landmarks: personA }],
            state,
            DEFAULT_ACTIVE_ZONE_CONFIG,
            nowMs,
          );
          state = res.state;
          // lockedIndex cambia de 0 a 1 debido al orden de MediaPipe
          expect(res.lockedIndex).toBe(1);
          // Pero la clave de la persona fijada (lockedSinceMs) es idéntica
          const currentLockKey = state.lockedPerson
            ? String(state.lockedPerson.lockedSinceMs)
            : null;
          expect(currentLockKey).toBe(initialLockKey);
        }
      }
    });
  });
});
