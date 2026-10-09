import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HandCursorTracker,
  selectUserHand,
  type DetectedHandInput,
  type HandFrameUser,
} from '@/lib/hand-cursor';

function createPrng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const makeUser = (
  cx = 0.5,
  sw = 0.2,
  box?: HandFrameUser['box'],
  lockedWrists?: HandFrameUser['lockedWrists'],
): HandFrameUser => ({
  lockedWrists: lockedWrists ?? {
    left: { x: cx - sw * 0.75, y: 0.6 },
    right: { x: cx + sw * 0.75, y: 0.6 },
  },
  sw,
  cx,
  box,
});

const makeHand = (
  gesture = 'Open_Palm',
  score = 0.9,
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

const TEST_RATES = [10, 24];

describe('Hand Cursor v2: Ancla, Palanca y Confirmación Explícita (tests/unit/hand-cursor-v2.test.ts)', () => {
  beforeEach(() => { window.history.replaceState(null, '', '/?hand_mode=palanca'); });
  afterEach(() => { window.history.replaceState(null, '', '/'); });
  // 1. Activación inicial no cambia el foco (prenda) aunque la mano aparezca a la derecha
  TEST_RATES.forEach((fps) => {
    it(`a ${fps} fps con jitter: activación inicial no cambia el foco aunque la mano aparezca a la derecha`, () => {
      const tracker = new HandCursorTracker();
      const user = makeUser(0.5, 0.2);
      // Mano a la derecha (x = 0.75, muñeca derecha del usuario)
      const hand = makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.75, 0.5);
      const prng = createPrng(fps * 101);
      const baseInterval = 1000 / fps;

      let t = 0;
      let activated = false;
      const initialIndex = 2;

      while (t <= 500) {
        const out = tracker.update({
          nowMs: t,
          hands: [hand],
          user,
          itemCount: 5,
          currentIndex: initialIndex,
        });

        if (out.cursor.active) {
          activated = true;
          // El foco no debe cambiar al activarse
          expect(out.cursor.index).toBe(initialIndex);
          expect(out.cursor.leverState).toBe('neutral');
          expect(out.cursor.directionArrow).toBeNull();
        }

        const dt = baseInterval * (1 + (prng() * 0.4 - 0.2));
        t += dt;
      }

      expect(activated).toBe(true);
    });
  });

  // 2. Temblores de ±0.15 sw alrededor del ancla durante 5 s → 0 pasos (foco inmóvil)
  TEST_RATES.forEach((fps) => {
    it(`a ${fps} fps con jitter: temblores de ±0.15 sw alrededor del ancla durante 5 s → 0 pasos`, () => {
      const tracker = new HandCursorTracker();
      const user = makeUser(0.5, 0.2);
      const prng = createPrng(fps * 202);
      const baseInterval = 1000 / fps;

      let t = 0;
      // Activar cursor primero
      while (t <= 400) {
        const hand = makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5);
        tracker.update({ nowMs: t, hands: [hand], user, itemCount: 5, currentIndex: 2 });
        t += baseInterval;
      }

      const initialAnchor = tracker.update({
        nowMs: t,
        hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5)],
        user,
        itemCount: 5,
      }).cursor.anchorX;
      expect(initialAnchor).not.toBeNull();

      const startIndex = 2;
      const tremorEndMs = t + 5000;

      while (t <= tremorEndMs) {
        // En coordenadas del cursor x = 1 - palmX, fluctuación de ±0.15 sw
        const tremorDelta = (prng() * 0.3 - 0.15) * user.sw;
        const currentPalmX = 1 - (initialAnchor! + tremorDelta);
        const hand = makeHand('Open_Palm', 0.9, 0.65, 0.6, currentPalmX, 0.5);

        const out = tracker.update({
          nowMs: t,
          hands: [hand],
          user,
          itemCount: 5,
        });

        expect(out.cursor.active).toBe(true);
        expect(out.cursor.index).toBe(startIndex);
        expect(out.cursor.leverState).toBe('neutral');
        expect(out.events).toHaveLength(0);

        const dt = baseInterval * (1 + (prng() * 0.4 - 0.2));
        t += dt;
      }
    });
  });

  // 3. d = 0.5 sostenido 2 s → 3 pasos (±1); d = 0.9 sostenido → 5 pasos (±1); al llegar al extremo se detiene
  TEST_RATES.forEach((fps) => {
    it(`a ${fps} fps: d = 0.5 sostenido 2 s → 3 pasos (±1); d = 0.9 sostenido → 5 pasos (±1); extremos`, () => {
      const baseInterval = 1000 / fps;

      // 3.1: d = 0.5 sostenido 2 s
      {
        const tracker = new HandCursorTracker();
        const user = makeUser(0.5, 0.2);
        let t = 0;
        // Activar en palmX = 0.65 (cursor x = 0.35)
        while (t <= 400) {
          tracker.update({
            nowMs: t,
            hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 10,
            currentIndex: 0,
          });
          t += baseInterval;
        }

        const anchor = tracker.update({
          nowMs: t,
          hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5)],
          user,
          itemCount: 10,
        }).cursor.anchorX!;

        // Desplazar a d = 0.5 (cursor x = anchor + 0.5 * sw => palmX = 1 - (anchor + 0.5 * sw))
        const targetPalmX = 1 - (anchor + 0.5 * user.sw);
        const startIdx = 0;
        const shiftEndMs = t + 2000;

        while (t <= shiftEndMs) {
          tracker.update({
            nowMs: t,
            hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, targetPalmX, 0.5)],
            user,
            itemCount: 10,
          });
          t += baseInterval;
        }

        const finalOut = tracker.update({
          nowMs: t,
          hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, targetPalmX, 0.5)],
          user,
          itemCount: 10,
        });

        const steps = finalOut.cursor.index - startIdx;
        // 3 pasos ± 1 (entre 2 y 4 pasos)
        expect(steps).toBeGreaterThanOrEqual(2);
        expect(steps).toBeLessThanOrEqual(4);
      }

      // 3.2: d = 0.9 sostenido 2 s
      {
        const tracker = new HandCursorTracker();
        const user = makeUser(0.5, 0.2);
        let t = 0;
        while (t <= 400) {
          tracker.update({
            nowMs: t,
            hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 10,
            currentIndex: 0,
          });
          t += baseInterval;
        }

        const anchor = tracker.update({
          nowMs: t,
          hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5)],
          user,
          itemCount: 10,
        }).cursor.anchorX!;

        const targetPalmX = 1 - (anchor + 0.9 * user.sw);
        const startIdx = 0;
        const shiftEndMs = t + 2000;

        while (t <= shiftEndMs) {
          tracker.update({
            nowMs: t,
            hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, targetPalmX, 0.5)],
            user,
            itemCount: 10,
          });
          t += baseInterval;
        }

        const finalOut = tracker.update({
          nowMs: t,
          hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, targetPalmX, 0.5)],
          user,
          itemCount: 10,
        });

        const steps = finalOut.cursor.index - startIdx;
        // 5 pasos ± 1 (entre 4 y 6 pasos)
        expect(steps).toBeGreaterThanOrEqual(4);
        expect(steps).toBeLessThanOrEqual(6);
      }

      // 3.3: Al llegar al extremo se detiene
      {
        const tracker = new HandCursorTracker();
        const user = makeUser(0.5, 0.2);
        let t = 0;
        while (t <= 400) {
          tracker.update({
            nowMs: t,
            hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 5,
            currentIndex: 3,
          });
          t += baseInterval;
        }

        const anchor = tracker.update({
          nowMs: t,
          hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5)],
          user,
          itemCount: 5,
        }).cursor.anchorX!;

        // Avanzar a la derecha 3 segundos enteros
        const rightPalmX = 1 - (anchor + 0.9 * user.sw);
        const endRightMs = t + 3000;
        while (t <= endRightMs) {
          const out = tracker.update({
            nowMs: t,
            hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, rightPalmX, 0.5)],
            user,
            itemCount: 5,
          });
          expect(out.cursor.index).toBeLessThanOrEqual(4);
          t += baseInterval;
        }

        const atEdge = tracker.update({
          nowMs: t,
          hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, rightPalmX, 0.5)],
          user,
          itemCount: 5,
        });
        expect(atEdge.cursor.index).toBe(4);

        // Ahora avanzar a la izquierda 4 segundos enteros
        const leftPalmX = 1 - (anchor - 0.9 * user.sw);
        const endLeftMs = t + 4000;
        while (t <= endLeftMs) {
          const out = tracker.update({
            nowMs: t,
            hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, leftPalmX, 0.5)],
            user,
            itemCount: 5,
          });
          expect(out.cursor.index).toBeGreaterThanOrEqual(0);
          t += baseInterval;
        }

        const atLeftEdge = tracker.update({
          nowMs: t,
          hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, leftPalmX, 0.5)],
          user,
          itemCount: 5,
        });
        expect(atLeftEdge.cursor.index).toBe(0);
      }
    });
  });

  // 4. Open_Palm quieta 5 s → 0 'take' (no hay toque de Midas)
  TEST_RATES.forEach((fps) => {
    it(`a ${fps} fps: Open_Palm quieta 5 s → 0 'take'`, () => {
      const tracker = new HandCursorTracker();
      const user = makeUser(0.5, 0.2);
      const hand = makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5);
      const prng = createPrng(fps * 303);
      const baseInterval = 1000 / fps;

      let t = 0;
      let takeEventsCount = 0;

      while (t <= 5500) {
        const out = tracker.update({
          nowMs: t,
          hands: [hand],
          user,
          itemCount: 5,
          currentIndex: 2,
        });

        for (const ev of out.events) {
          if (ev.type === 'take') {
            takeEventsCount++;
          }
        }

        // Anillo no avanza nunca con Open_Palm
        if (out.cursor.active) {
          expect(out.cursor.dwellProgress).toBe(0);
          expect(out.cursor.confirmProgress).toBe(0);
        }

        const dt = baseInterval * (1 + (prng() * 0.4 - 0.2));
        t += dt;
      }

      expect(takeEventsCount).toBe(0);
    });
  });

  // 5. Pointing_Up 600 ms en zona neutra → 1 'take'; 400 ms y vuelve a palma → 0 'take'
  TEST_RATES.forEach((fps) => {
    it(`a ${fps} fps: Pointing_Up 600 ms en zona neutra → 1 'take'; 400 ms y vuelve a palma → 0 'take'`, () => {
      const baseInterval = 1000 / fps;

      // 5.1: 600 ms → 1 'take'
      {
        const tracker = new HandCursorTracker();
        const user = makeUser(0.5, 0.2);
        let t = 0;

        // Activar con Open_Palm
        while (t <= 400) {
          tracker.update({
            nowMs: t,
            hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 5,
            currentIndex: 2,
          });
          t += baseInterval;
        }

        // Levantar el índice (Pointing_Up) en zona neutra durante 650 ms
        let takeCount = 0;
        const pointEndMs = t + 650;
        while (t <= pointEndMs) {
          const out = tracker.update({
            nowMs: t,
            hands: [makeHand('Pointing_Up', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 5,
          });

          for (const ev of out.events) {
            if (ev.type === 'take') {
              takeCount++;
              expect(ev.method).toBe('hand_point');
            }
          }
          t += baseInterval;
        }

        expect(takeCount).toBe(1);

        // Continuar con Pointing_Up no vuelve a disparar (desarmado)
        const postPointEndMs = t + 500;
        while (t <= postPointEndMs) {
          const out = tracker.update({
            nowMs: t,
            hands: [makeHand('Pointing_Up', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 5,
          });
          for (const ev of out.events) {
            if (ev.type === 'take') takeCount++;
          }
          t += baseInterval;
        }
        expect(takeCount).toBe(1);
      }

      // 5.2: 400 ms y vuelve a palma → 0 'take'
      {
        const tracker = new HandCursorTracker();
        const user = makeUser(0.5, 0.2);
        let t = 0;

        // Activar con Open_Palm
        while (t <= 400) {
          tracker.update({
            nowMs: t,
            hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 5,
            currentIndex: 2,
          });
          t += baseInterval;
        }

        let takeCount = 0;
        // Pointing_Up durante 400 ms
        const pointEndMs = t + 400;
        while (t <= pointEndMs) {
          const out = tracker.update({
            nowMs: t,
            hands: [makeHand('Pointing_Up', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 5,
          });
          for (const ev of out.events) {
            if (ev.type === 'take') takeCount++;
          }
          t += baseInterval;
        }

        // Vuelve a Open_Palm durante 1000 ms
        const palmEndMs = t + 1000;
        while (t <= palmEndMs) {
          const out = tracker.update({
            nowMs: t,
            hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 5,
          });
          for (const ev of out.events) {
            if (ev.type === 'take') takeCount++;
          }
          expect(out.cursor.confirmProgress).toBe(0);
          t += baseInterval;
        }

        expect(takeCount).toBe(0);
      }
    });
  });

  // 6. Hueco de 200 ms durante confirmación → completa igual; hueco de 400 ms → vuelve a 0
  TEST_RATES.forEach((fps) => {
    it(`a ${fps} fps: hueco de 200 ms completa; hueco de 400 ms vuelve a 0`, () => {
      const baseInterval = 1000 / fps;

      // 6.1: Hueco de 200 ms → completa igual
      {
        const tracker = new HandCursorTracker();
        const user = makeUser(0.5, 0.2);
        let t = 0;

        // Activar con Open_Palm
        while (t <= 400) {
          tracker.update({
            nowMs: t,
            hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 5,
            currentIndex: 2,
          });
          t += baseInterval;
        }

        // Pointing_Up durante 300 ms (anillo a ~50%)
        const point1End = t + 300;
        while (t <= point1End) {
          tracker.update({
            nowMs: t,
            hands: [makeHand('Pointing_Up', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 5,
          });
          t += baseInterval;
        }

        const midOut = tracker.update({
          nowMs: t,
          hands: [makeHand('Pointing_Up', 0.9, 0.65, 0.6, 0.65, 0.5)],
          user,
          itemCount: 5,
        });
        expect(midOut.cursor.confirmProgress).toBeGreaterThan(0.3);

        // Hueco de 200 ms sin mano detectada
        const gapEnd = t + 200;
        while (t <= gapEnd) {
          const gapOut = tracker.update({
            nowMs: t,
            hands: [],
            user,
            itemCount: 5,
          });
          // El cursor se mantiene activo y el anillo congelado
          expect(gapOut.cursor.active).toBe(true);
          expect(gapOut.cursor.confirmProgress).toBeGreaterThan(0.3);
          t += baseInterval;
        }

        // Retomar Pointing_Up durante 400 ms (total apuntando > 600 ms)
        let takeCount = 0;
        const resumeEnd = t + 400;
        while (t <= resumeEnd) {
          const out = tracker.update({
            nowMs: t,
            hands: [makeHand('Pointing_Up', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 5,
          });
          for (const ev of out.events) {
            if (ev.type === 'take') takeCount++;
          }
          t += baseInterval;
        }

        expect(takeCount).toBe(1);
      }

      // 6.2: Hueco de 400 ms → vuelve a 0
      {
        const tracker = new HandCursorTracker();
        const user = makeUser(0.5, 0.2);
        let t = 0;

        // Activar con Open_Palm
        while (t <= 400) {
          tracker.update({
            nowMs: t,
            hands: [makeHand('Open_Palm', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 5,
            currentIndex: 2,
          });
          t += baseInterval;
        }

        // Pointing_Up durante 300 ms
        const point1End = t + 300;
        while (t <= point1End) {
          tracker.update({
            nowMs: t,
            hands: [makeHand('Pointing_Up', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 5,
          });
          t += baseInterval;
        }

        // Hueco de 400 ms (> GAP_LOST_MAX_MS)
        const gapEnd = t + 400;
        while (t <= gapEnd) {
          tracker.update({
            nowMs: t,
            hands: [],
            user,
            itemCount: 5,
          });
          t += baseInterval;
        }

        // Al terminar el hueco de 400 ms, confirmProgress debe estar en 0
        const postGap = tracker.update({
          nowMs: t,
          hands: [],
          user,
          itemCount: 5,
        });
        expect(postGap.cursor.confirmProgress).toBe(0);

        // Si retoma solo 200 ms, no debe disparar
        let takeCount = 0;
        const resumeEnd = t + 200;
        while (t <= resumeEnd) {
          const out = tracker.update({
            nowMs: t,
            hands: [makeHand('Pointing_Up', 0.9, 0.65, 0.6, 0.65, 0.5)],
            user,
            itemCount: 5,
          });
          for (const ev of out.events) {
            if (ev.type === 'take') takeCount++;
          }
          t += baseInterval;
        }

        expect(takeCount).toBe(0);
      }
    });
  });

  // 7. Dueño: mano a 0.12 con sw = 0.3 → asignada (0.12 ≤ 0.18); mano de otra persona a 0.4 → rechazada
  it('Dueño: mano a 0.12 con sw = 0.3 → asignada; mano a 0.4 → rechazada', () => {
    const user: HandFrameUser = {
      cx: 0.5,
      sw: 0.3,
      lockedWrists: {
        left: null,
        right: { x: 0.65, y: 0.6 },
      },
    };

    // ownerDist = max(0.06, 0.6 * 0.3) = 0.18
    // Mano a distancia 0.12 de right wrist (0.65, 0.6) => (0.65, 0.48)
    const validHand = makeHand('Open_Palm', 0.9, 0.65, 0.48, 0.65, 0.4);
    const validRes = selectUserHand([validHand], user);
    expect(validRes.userHands).toHaveLength(1);
    expect(validRes.activeHand).not.toBeNull();
    expect(validRes.reason).toBe('wrist');

    // Mano de otra persona a distancia 0.40 (0.25, 0.6)
    const otherHand = makeHand('Open_Palm', 0.9, 0.25, 0.6, 0.25, 0.5);
    const otherRes = selectUserHand([otherHand], user);
    expect(otherRes.userHands).toHaveLength(0);
    expect(otherRes.activeHand).toBeNull();
    expect(otherRes.reason).toBe('none');
  });

  // 8. Continuidad: lockedWrists null durante 1 s con mano moviéndose suavemente → sigue asignada
  it('Continuidad: lockedWrists null durante 1 s con mano moviéndose suavemente → sigue asignada', () => {
    const sw = 0.3;
    const userWithWrist: HandFrameUser = {
      cx: 0.5,
      sw,
      lockedWrists: {
        left: null,
        right: { x: 0.65, y: 0.6 },
      },
    };

    let palmX = 0.65;
    let hand = makeHand('Open_Palm', 0.9, 0.65, 0.6, palmX, 0.5);

    // 1. Asignar inicialmente por muñeca
    const initialMatch = selectUserHand([hand], userWithWrist);
    expect(initialMatch.userHands).toHaveLength(1);
    expect(initialMatch.reason).toBe('wrist');

    let lastPalmCenter = initialMatch.activeHand!.palmCenter;

    // 2. Muñecas se vuelven null
    const userNoWrists: HandFrameUser = {
      cx: 0.5,
      sw,
      lockedWrists: {
        left: null,
        right: null,
      },
    };

    // Simular 1 segundo a 20 fps (20 pasos de 50 ms)
    for (let step = 0; step < 20; step++) {
      // Movimiento suave de 0.005 por frame (total 0.1, muy inferior a 0.5 * sw = 0.15 por frame)
      palmX += 0.005;
      hand = makeHand('Open_Palm', 0.9, 0.99, 0.99, palmX, 0.5);

      const res = selectUserHand([hand], userNoWrists, lastPalmCenter);
      expect(res.userHands).toHaveLength(1);
      expect(res.reason).toBe('continuity');
      lastPalmCenter = res.activeHand!.palmCenter;
    }
  });
});
