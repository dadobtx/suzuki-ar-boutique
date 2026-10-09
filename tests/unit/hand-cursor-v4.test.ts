import { describe, it, expect } from 'vitest';
import {
  HandCursorTracker,
  computeHandPoseSide,
  detectGeometricIndex,
  type DetectedHandInput,
  type HandCursorEvent,
  type HandFrameUser,
  type HandLandmarkPoint,
  type HandFrameOutput,
} from '@/lib/hand-cursor';

function createPrng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const SW = 0.2;

/**
 * Coordenadas de video SIN espejar: la mano izquierda de la persona aparece a la
 * DERECHA del video (x > centro) y, tras el espejo, a la izquierda de la pantalla.
 */
const makeUser = (): HandFrameUser => ({
  lockedWrists: {
    left: { x: 0.65, y: 0.6 }, // muñeca 15 del pose (izquierda de la persona)
    right: { x: 0.35, y: 0.6 }, // muñeca 16 del pose (derecha de la persona)
  },
  sw: SW,
  cx: 0.5,
});

type Side = 'left' | 'right';
type FingerKind = 'index' | 'open' | 'fist';

function makeLandmarks(kind: FingerKind, wx: number, wy = 0.6): HandLandmarkPoint[] {
  const pts: HandLandmarkPoint[] = Array.from({ length: 21 }, () => ({
    x: wx,
    y: wy - 0.03,
  }));
  pts[0] = { x: wx, y: wy };
  for (const k of [5, 9, 13, 17]) pts[k] = { x: wx, y: wy - 0.06 };
  const indexExtended = kind === 'index' || kind === 'open';
  pts[6] = { x: wx, y: indexExtended ? wy - 0.09 : wy - 0.07 };
  pts[8] = { x: wx, y: indexExtended ? wy - 0.14 : wy - 0.04 };
  const othersExtended = kind === 'open';
  for (const k of [12, 16, 20])
    pts[k] = { x: wx, y: othersExtended ? wy - 0.14 : wy - 0.04 };
  return pts;
}

const makeHand = (
  side: Side,
  palmX: number,
  opts: {
    gesture?: string;
    score?: number;
    kind?: FingerKind;
    handedness?: 'Left' | 'Right' | 'None';
    palmY?: number;
  } = {},
): DetectedHandInput => {
  const wx = side === 'left' ? 0.65 : 0.35;
  return {
    wrist: { x: wx, y: 0.6 },
    palmCenter: { x: palmX, y: opts.palmY ?? 0.5 },
    gesture: opts.gesture ?? 'Open_Palm',
    score: opts.score ?? 0.9,
    handedness: opts.handedness ?? (side === 'left' ? 'Left' : 'Right'),
    landmarks: opts.kind ? makeLandmarks(opts.kind, wx) : undefined,
  };
};

/** palmX (sin espejar) que produce un desplazamiento d respecto al ancla (en x espejado). */
const palmForD = (anchor: number, d: number) => 1 - (anchor + d * SW);

class Sim {
  tracker = new HandCursorTracker({ mode: 'step' });
  user = makeUser();
  t = 0;
  anchor = 0.5;
  last: HandFrameOutput | null = null;
  events: HandCursorEvent[] = [];
  private prng: () => number;
  constructor(
    private fps: number,
    seed: number,
    private itemCount = 10,
    private currentIndex = 5,
  ) {
    this.prng = createPrng(seed);
  }

  frame(hands: DetectedHandInput[], isLiveAvailable = false): HandFrameOutput {
    const out = this.tracker.update({
      nowMs: this.t,
      hands,
      user: this.user,
      itemCount: this.itemCount,
      currentIndex: this.currentIndex,
      isLiveAvailable,
    });
    this.last = out;
    if (out.cursor.anchorX !== null && out.cursor.anchorX !== undefined) {
      this.anchor = out.cursor.anchorX;
    }
    this.events.push(...out.events);
    this.t += (1000 / this.fps) * (1 + (this.prng() * 0.4 - 0.2));
    return out;
  }

  /** Ejecuta durante ms; fn recibe el tiempo transcurrido en la fase. */
  run(ms: number, fn: (elapsed: number) => DetectedHandInput[], isLiveAvailable = false) {
    const start = this.t;
    while (this.t - start < ms) {
      this.frame(fn(this.t - start), isLiveAvailable);
    }
  }

  activate(side: Side, isLiveAvailable = false) {
    const x0 = side === 'left' ? 0.65 : 0.35;
    this.run(500, () => [makeHand(side, x0)], isLiveAvailable);
    expect(this.last!.cursor.active).toBe(true);
  }

  steps() {
    return this.events.filter((e) => e.type === 'step') as Array<
      Extract<HandCursorEvent, { type: 'step' }>
    >;
  }
  lives() {
    return this.events.filter((e) => e.type === 'live');
  }
}

const RATES = [10, 24];

describe('Hand Cursor v4: un gesto = un paso (tests/unit/hand-cursor-v4.test.ts)', () => {
  RATES.forEach((fps) => {
    it(`a ${fps} fps: mano derecha d=0.6 sostenida 3 s → exactamente 1 paso a la derecha`, () => {
      const sim = new Sim(fps, fps * 11);
      sim.activate('right');
      const anchor = sim.anchor;
      sim.run(3000, () => [makeHand('right', palmForD(anchor, 0.6))]);
      expect(sim.steps()).toHaveLength(1);
      expect(sim.steps()[0]!.direction).toBe('right');
      expect(sim.last!.cursor.index).toBe(6);
    });

    it(`a ${fps} fps: 3 excursiones separadas por vueltas al centro → 3 pasos`, () => {
      const sim = new Sim(fps, fps * 13);
      sim.activate('right');
      for (let i = 0; i < 3; i++) {
        const a = sim.anchor;
        sim.run(700, () => [makeHand('right', palmForD(a, 0.6))]);
        const a2 = sim.anchor;
        sim.run(300, () => [makeHand('right', palmForD(a2, 0.05))]);
        const a3 = sim.anchor;
        sim.run(300, () => [makeHand('right', palmForD(a3, 0.0))]);
      }
      expect(sim.steps()).toHaveLength(3);
      expect(sim.last!.cursor.index).toBe(8);
    });

    it(`a ${fps} fps: mano derecha cruzando hacia la izquierda (d=-0.6) → 0 pasos`, () => {
      const sim = new Sim(fps, fps * 17);
      sim.activate('right');
      const anchor = sim.anchor;
      sim.run(2000, () => [makeHand('right', palmForD(anchor, -0.6))]);
      expect(sim.steps()).toHaveLength(0);
    });

    it(`a ${fps} fps: mano izquierda d=-0.6 → 1 paso a la izquierda; d=+0.6 → 0 pasos`, () => {
      const left = new Sim(fps, fps * 19);
      left.activate('left');
      expect(left.last!.cursor.poseSide).toBe('Left');
      const a = left.anchor;
      left.run(2000, () => [makeHand('left', palmForD(a, -0.6))]);
      expect(left.steps()).toHaveLength(1);
      expect(left.steps()[0]!.direction).toBe('left');
      expect(left.last!.cursor.index).toBe(4);

      const cross = new Sim(fps, fps * 23);
      cross.activate('left');
      const b = cross.anchor;
      cross.run(2000, () => [makeHand('left', palmForD(b, 0.6))]);
      expect(cross.steps()).toHaveLength(0);
    });

    it(`a ${fps} fps: un solo cuadro con d=0.6 entre cuadros con d=0 → 0 pasos`, () => {
      const sim = new Sim(fps, fps * 29);
      sim.activate('right');
      const anchor = sim.anchor;
      sim.run(500, () => [makeHand('right', palmForD(anchor, 0))]);
      sim.frame([makeHand('right', palmForD(anchor, 0.6))]);
      sim.run(800, () => [makeHand('right', palmForD(anchor, 0))]);
      expect(sim.steps()).toHaveLength(0);
    });

    it(`a ${fps} fps: dos excursiones a menos de 400 ms → 1 paso`, () => {
      const sim = new Sim(fps, fps * 31);
      sim.activate('right');
      const anchor = sim.anchor;
      sim.run(250, () => [makeHand('right', palmForD(anchor, 0.7))]);
      sim.run(100, () => [makeHand('right', palmForD(anchor, 0))]);
      sim.run(150, () => [makeHand('right', palmForD(anchor, 0.7))]);
      expect(sim.steps().length).toBeLessThanOrEqual(1);
    });

    it(`a ${fps} fps: activar el cursor sin moverse → ningún paso ni cambio de prenda`, () => {
      const sim = new Sim(fps, fps * 37, 10, 3);
      sim.activate('right');
      const anchor = sim.anchor;
      sim.run(2000, () => [makeHand('right', palmForD(anchor, 0.02))]);
      expect(sim.events).toHaveLength(0);
      expect(sim.last!.cursor.index).toBe(3);
    });

    it(`a ${fps} fps: índice geométrico (gesture None) 1200 ms → 1 evento live; 900 ms → 0`, () => {
      const long = new Sim(fps, fps * 41);
      long.activate('right', true);
      const x = palmForD(long.anchor, 0);
      long.run(
        1400,
        () => [makeHand('right', x, { gesture: 'None', score: 0, kind: 'index' })],
        true,
      );
      expect(long.lives()).toHaveLength(1);

      const short = new Sim(fps, fps * 43);
      short.activate('right', true);
      const y = palmForD(short.anchor, 0);
      short.run(
        900,
        () => [makeHand('right', y, { gesture: 'None', score: 0, kind: 'index' })],
        true,
      );
      expect(short.lives()).toHaveLength(0);
    });

    it(`a ${fps} fps: mano abierta (todos extendidos) o puño (todos recogidos) → 0 live`, () => {
      const open = new Sim(fps, fps * 47);
      open.activate('right', true);
      const x = palmForD(open.anchor, 0);
      open.run(
        2000,
        () => [makeHand('right', x, { gesture: 'Open_Palm', kind: 'open' })],
        true,
      );
      expect(open.lives()).toHaveLength(0);

      const fist = new Sim(fps, fps * 53);
      fist.activate('right', true);
      const y = palmForD(fist.anchor, 0);
      fist.run(
        2000,
        () => [makeHand('right', y, { gesture: 'None', score: 0, kind: 'fist' })],
        true,
      );
      expect(fist.lives()).toHaveLength(0);
    });

    it(`a ${fps} fps: mano izquierda con Pointing_Up score 0.45 durante 1200 ms → 1 live`, () => {
      const sim = new Sim(fps, fps * 59);
      sim.activate('left', true);
      const x = palmForD(sim.anchor, 0);
      sim.run(
        1400,
        () => [makeHand('left', x, { gesture: 'Pointing_Up', score: 0.45 })],
        true,
      );
      expect(sim.lives()).toHaveLength(1);
    });

    it(`a ${fps} fps: sin botón en vivo disponible el anillo no avanza y no hay evento live`, () => {
      const sim = new Sim(fps, fps * 61);
      sim.activate('right', false);
      const x = palmForD(sim.anchor, 0);
      let maxProgress = 0;
      sim.run(
        2500,
        () => [
          makeHand('right', x, { gesture: 'Pointing_Up', score: 0.9, kind: 'index' }),
        ],
        false,
      );
      maxProgress = Math.max(maxProgress, sim.last!.cursor.confirmProgress ?? 0);
      expect(maxProgress).toBe(0);
      expect(sim.lives()).toHaveLength(0);
    });

    it(`a ${fps} fps: etiqueta del clasificador alternando Left/Right cada 3 cuadros → la activa sigue siendo la derecha`, () => {
      const sim = new Sim(fps, fps * 67);
      let n = 0;
      const frameHands = () => {
        const label = Math.floor(n / 3) % 2 === 0 ? 'Left' : 'Right';
        n++;
        return [
          makeHand('right', 0.35, { gesture: 'Open_Palm', handedness: label }),
          // mano izquierda relajada, más baja y sin gesto válido
          makeHand('left', 0.65, {
            gesture: 'None',
            score: 0.9,
            palmY: 0.7,
            handedness: label === 'Left' ? 'Right' : 'Left',
          }),
        ];
      };
      sim.run(3000, frameHands);
      expect(sim.last!.cursor.active).toBe(true);
      expect(sim.last!.cursor.poseSide).toBe('Right');
      expect(sim.last!.cursor.handSwitchCount).toBe(0);
      expect(sim.steps()).toHaveLength(0);
    });
  });

  describe('computeHandPoseSide / detectGeometricIndex', () => {
    it('con muñecas del pose: la muñeca más cercana define el lado (video sin espejar)', () => {
      const user = makeUser();
      expect(computeHandPoseSide({ x: 0.66, y: 0.6 }, user)).toBe('Left');
      expect(computeHandPoseSide({ x: 0.34, y: 0.6 }, user)).toBe('Right');
    });

    it('sin muñecas del pose: la mano izquierda de la persona (x de video > centro) da Left', () => {
      const user: HandFrameUser = {
        lockedWrists: { left: null, right: null },
        sw: SW,
        cx: 0.5, // el hook lo pasa espejado (1 - cx)
      };
      expect(computeHandPoseSide({ x: 0.65, y: 0.6 }, user)).toBe('Left');
      expect(computeHandPoseSide({ x: 0.35, y: 0.6 }, user)).toBe('Right');
    });

    it('detectGeometricIndex distingue índice, mano abierta y puño', () => {
      expect(detectGeometricIndex(makeLandmarks('index', 0.5))).toBe(true);
      expect(detectGeometricIndex(makeLandmarks('open', 0.5))).toBe(false);
      expect(detectGeometricIndex(makeLandmarks('fist', 0.5))).toBe(false);
      expect(detectGeometricIndex(undefined)).toBe(false);
    });
  });
});
