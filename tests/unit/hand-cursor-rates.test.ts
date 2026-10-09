import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HandCursorTracker,
  type HandCursorEvent,
  type DetectedHandInput,
  type HandFrameUser,
} from '@/lib/hand-cursor';

/**
 * Generador de números pseudo-aleatorios con semilla fija (Linear Congruential Generator)
 */
function createPrng(seed = 123456789) {
  let s = seed >>> 0;
  return function next() {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('Robust Hand Cursor Rates & Jitter Tests (tests/unit/hand-cursor-rates.test.ts)', () => {
  beforeEach(() => { window.history.replaceState(null, '', '/?hand_mode=palanca'); });
  afterEach(() => { window.history.replaceState(null, '', '/'); });
  const makeUser = (cx = 0.5, sw = 0.2): HandFrameUser => ({
    lockedWrists: {
      left: { x: 0.35, y: 0.6 },
      right: { x: 0.65, y: 0.6 },
    },
    sw,
    cx,
  });

  const makeHand = (
    gesture = 'Open_Palm',
    score = 0.8,
    wristX = 0.65,
    wristY = 0.6,
    palmX = 0.65,
    palmY = 0.5,
  ): DetectedHandInput => ({
    wrist: { x: wristX, y: wristY },
    palmCenter: { x: palmX, y: palmY },
    gesture,
    score,
  });

  const TEST_RATES = [5, 7, 10, 15, 24, 30];

  // 1. A 5, 7, 10, 15, 24 y 30 fps el cursor se activa en <= 450 ms (con jitter +- 20%)
  TEST_RATES.forEach((fps) => {
    it(`a ${fps} fps con jitter ±20%: se activa en ≤ 450 ms`, () => {
      const tracker = new HandCursorTracker();
      const user = makeUser();
      const hand = makeHand('Open_Palm', 0.8);
      const prng = createPrng(fps * 1000 + 7);

      const baseInterval = 1000 / fps;
      let currentTimeMs = 0;
      let activatedAtMs: number | null = null;

      // Simular hasta 600 ms
      while (currentTimeMs <= 600) {
        const out = tracker.update({
          nowMs: currentTimeMs,
          hands: [hand],
          user,
          itemCount: 5,
        });

        if (out.cursor.active && activatedAtMs === null) {
          activatedAtMs = currentTimeMs;
          break;
        }

        // Intervalo con jitter ±20%
        const jitter = (prng() * 0.4 - 0.2) * baseInterval;
        const dt = Math.max(1, baseInterval + jitter);
        currentTimeMs += dt;
      }

      expect(activatedAtMs).not.toBeNull();
      expect(activatedAtMs!).toBeLessThanOrEqual(450);
    });
  });

  // 2. A esas mismas frecuencias, quedarse en la misma prenda dispara 'take' entre 1200 y 1500 ms después de activarse, una sola vez
  TEST_RATES.forEach((fps) => {
    it(`a ${fps} fps con jitter ±20%: dwell dispara 'take' entre 1200 y 1500 ms tras activación, una sola vez`, () => {
      const tracker = new HandCursorTracker({ enableDwell: true });
      const user = makeUser();
      const hand = makeHand('Open_Palm', 0.8);
      const prng = createPrng(fps * 2000 + 13);

      const baseInterval = 1000 / fps;
      let currentTimeMs = 0;
      let activatedAtMs: number | null = null;
      const takeEvents: Array<{ time: number; event: HandCursorEvent }> = [];

      // Simular hasta 3000 ms
      while (currentTimeMs <= 3000) {
        const out = tracker.update({
          nowMs: currentTimeMs,
          hands: [hand],
          user,
          itemCount: 5,
        });

        if (out.cursor.active && activatedAtMs === null) {
          activatedAtMs = currentTimeMs;
        }

        if (out.events.length > 0) {
          for (const ev of out.events) {
            if (ev.type === 'take') {
              takeEvents.push({ time: currentTimeMs, event: ev });
            }
          }
        }

        const jitter = (prng() * 0.4 - 0.2) * baseInterval;
        const dt = Math.max(1, baseInterval + jitter);
        currentTimeMs += dt;
      }

      expect(activatedAtMs).not.toBeNull();
      expect(takeEvents).toHaveLength(1);

      const elapsedAfterActivation = takeEvents[0]!.time - activatedAtMs!;
      expect(elapsedAfterActivation).toBeGreaterThanOrEqual(1200);
      expect(elapsedAfterActivation).toBeLessThanOrEqual(1500);
      expect(takeEvents[0]!.event.method).toBe('hand_dwell');
    });
  });

  // 3. Con 40 % de frames sin mano mezclados al azar (sin rachas > 300 ms) el cursor no se desactiva
  it('con 40 % de frames sin mano mezclados al azar (sin rachas > 300 ms), el cursor activo no se desactiva', () => {
    const tracker = new HandCursorTracker();
    const user = makeUser();
    const hand = makeHand('Open_Palm', 0.8);

    // Activar primero con 300 ms de mano continua
    for (let t = 0; t <= 300; t += 50) {
      tracker.update({ nowMs: t, hands: [hand], user, itemCount: 5 });
    }
    const checkActive = tracker.update({ nowMs: 350, hands: [hand], user, itemCount: 5 });
    expect(checkActive.cursor.active).toBe(true);

    // Simular 2000 ms a 20 fps (intervalo 50 ms) con 40% frames sin mano
    // Asegurando que ninguna racha consecutiva de vacíos exceda 300 ms (<= 5 frames de 50 ms)
    const prng = createPrng(999);
    let consecutiveEmptyMs = 0;
    let t = 400;

    while (t <= 2400) {
      const isRandomEmpty = prng() < 0.4;
      const shouldEmpty = isRandomEmpty && consecutiveEmptyMs + 50 <= 300;

      const currentHands = shouldEmpty ? [] : [hand];
      if (shouldEmpty) {
        consecutiveEmptyMs += 50;
      } else {
        consecutiveEmptyMs = 0;
      }

      const out = tracker.update({
        nowMs: t,
        hands: currentHands,
        user,
        itemCount: 5,
      });

      expect(out.cursor.active).toBe(true);
      t += 50;
    }
  });

  // 4. Al bajar la mano (sin mano 600 ms) se desactiva a cualquier frecuencia
  TEST_RATES.forEach((fps) => {
    it(`al bajar la mano (sin mano 600 ms) se desactiva a ${fps} fps`, () => {
      const tracker = new HandCursorTracker();
      const user = makeUser();
      const hand = makeHand('Open_Palm', 0.8);
      const baseInterval = 1000 / fps;

      // Primero activar
      let t = 0;
      while (t <= 450) {
        tracker.update({ nowMs: t, hands: [hand], user, itemCount: 5 });
        t += baseInterval;
      }
      const activeOut = tracker.update({ nowMs: t, hands: [hand], user, itemCount: 5 });
      expect(activeOut.cursor.active).toBe(true);

      // Ahora 600 ms sin mano
      const dropStart = t;
      t += baseInterval;
      while (t <= dropStart + 600) {
        tracker.update({ nowMs: t, hands: [], user, itemCount: 5 });
        t += baseInterval;
      }

      const finalOut = tracker.update({ nowMs: t, hands: [], user, itemCount: 5 });
      expect(finalOut.cursor.active).toBe(false);
    });
  });

  // 5. El atajo Open_Palm → Pointing_Up funciona a 10 y 30 fps
  [10, 30].forEach((fps) => {
    it(`el atajo Open_Palm → Pointing_Up funciona a ${fps} fps`, () => {
      const tracker = new HandCursorTracker({ enableDwell: true });
      const user = makeUser();
      const openPalmHand = makeHand('Open_Palm', 0.8);
      const pointingHand = makeHand('Pointing_Up', 0.8);
      const interval = 1000 / fps;

      let t = 0;
      // 1. Activar y estabilizar índice >= 300 ms con Open_Palm (hasta 500 ms)
      while (t <= 500) {
        tracker.update({ nowMs: t, hands: [openPalmHand], user, itemCount: 5 });
        t += interval;
      }

      // 2. Transición a Pointing_Up durante 400 ms
      let shortcutFired = false;
      const pointStart = t;
      while (t <= pointStart + 400) {
        const out = tracker.update({
          nowMs: t,
          hands: [pointingHand],
          user,
          itemCount: 5,
        });
        const pointEvent = out.events.find((e) => e.method === 'hand_point');
        if (pointEvent) {
          shortcutFired = true;
          expect(pointEvent.type).toBe('take');
          break;
        }
        t += interval;
      }

      expect(shortcutFired).toBe(true);
    });
  });

  // 6. Para la métrica: 20 inferencias en 2 s → "FPS Gesto" = 10
  it('métrica: 20 inferencias completadas en los últimos 2 s da FPS Gesto = 10', () => {
    const completedTimestamps: number[] = [];
    const nowMs = 2000;

    // Distribuir 20 inferencias entre t = 100 y t = 2000 (últimos 2 s)
    for (let i = 0; i < 20; i++) {
      completedTimestamps.push(100 + i * 95);
    }

    const cutoff2s = nowMs - 2000;
    const inside2s = completedTimestamps.filter((t) => t >= cutoff2s);
    const calculatedFps = Math.round(inside2s.length / 2);

    expect(inside2s).toHaveLength(20);
    expect(calculatedFps).toBe(10);
  });
});
