import { describe, it, expect, beforeEach } from 'vitest';
import {
  HandCursorTracker,
  selectUserHand,
  REACH,
  type DetectedHandInput,
  type HandFrameUser,
} from '@/lib/hand-cursor';

describe('Hand Cursor Engine (src/lib/hand-cursor.ts)', () => {
  let tracker: HandCursorTracker;

  beforeEach(() => {
    tracker = new HandCursorTracker();
  });

  const makeUser = (cx = 0.5, sw = 0.2): HandFrameUser => ({
    lockedWrists: {
      left: { x: 0.35, y: 0.6 },
      right: { x: 0.65, y: 0.6 },
    },
    sw,
    cx,
  });

  const makeHand = (
    wristX = 0.65,
    wristY = 0.6,
    palmX = 0.65,
    palmY = 0.5,
    gesture = 'Open_Palm',
    score = 0.9,
  ): DetectedHandInput => ({
    wrist: { x: wristX, y: wristY },
    palmCenter: { x: palmX, y: palmY },
    gesture,
    score,
  });

  it('Mano lejos de lockedWrists → ignorada (no activa cursor)', () => {
    const user = makeUser();
    // Mano a distancia > 0.08 de ambas muñecas
    const farHand = makeHand(0.5, 0.2, 0.5, 0.1);

    const { userHands, activeHand } = selectUserHand([farHand], user);
    expect(userHands).toHaveLength(0);
    expect(activeHand).toBeNull();

    // Alimentar durante 300 ms
    for (let t = 0; t <= 300; t += 50) {
      const output = tracker.update({
        nowMs: t,
        hands: [farHand],
        user,
        itemCount: 5,
      });
      expect(output.cursor.active).toBe(false);
      expect(output.userHandsCount).toBe(0);
    }
  });

  it('Mano del usuario con Open_Palm 60 % de 250 ms → activa; con 50 % → no', () => {
    const user = makeUser();
    const validHand = makeHand();
    const invalidGestureHand = makeHand(0.65, 0.6, 0.65, 0.5, 'Closed_Fist', 0.9);

    // Caso 50 % (3 válidos de 6 frames en ventana de 250 ms): no activa
    tracker.reset();
    tracker.update({ nowMs: 0, hands: [validHand], user, itemCount: 5 });
    tracker.update({ nowMs: 50, hands: [invalidGestureHand], user, itemCount: 5 });
    tracker.update({ nowMs: 100, hands: [validHand], user, itemCount: 5 });
    tracker.update({ nowMs: 150, hands: [invalidGestureHand], user, itemCount: 5 });
    tracker.update({ nowMs: 200, hands: [validHand], user, itemCount: 5 });
    const out50 = tracker.update({
      nowMs: 250,
      hands: [invalidGestureHand],
      user,
      itemCount: 5,
    });
    expect(out50.cursor.active).toBe(false);

    // Caso 60 % (4 válidos de 6 frames en ventana de 250 ms = 66.7 %): activa
    tracker.reset();
    tracker.update({ nowMs: 0, hands: [validHand], user, itemCount: 5 });
    tracker.update({ nowMs: 50, hands: [validHand], user, itemCount: 5 });
    tracker.update({ nowMs: 100, hands: [invalidGestureHand], user, itemCount: 5 });
    tracker.update({ nowMs: 150, hands: [invalidGestureHand], user, itemCount: 5 });
    tracker.update({ nowMs: 200, hands: [validHand], user, itemCount: 5 });
    const out60 = tracker.update({
      nowMs: 250,
      hands: [validHand],
      user,
      itemCount: 5,
    });
    expect(out60.cursor.active).toBe(true);
  });

  it('Sin mano 400 ms → cursor se apaga y el progreso vuelve a 0', () => {
    const user = makeUser();
    const validHand = makeHand();

    // Activar cursor primero
    for (let t = 0; t <= 250; t += 50) {
      tracker.update({ nowMs: t, hands: [validHand], user, itemCount: 5 });
    }
    const activeOut = tracker.update({
      nowMs: 300,
      hands: [validHand],
      user,
      itemCount: 5,
    });
    expect(activeOut.cursor.active).toBe(true);

    // Desaparece la mano durante 350 ms: sigue activo
    const stillActive = tracker.update({
      nowMs: 650,
      hands: [],
      user,
      itemCount: 5,
    });
    expect(stillActive.cursor.active).toBe(true);

    // Alcanza 400 ms sin mano (300 ms + 400 ms = 700 ms)
    const deactivated = tracker.update({
      nowMs: 700,
      hands: [],
      user,
      itemCount: 5,
    });
    expect(deactivated.cursor.active).toBe(false);
    expect(deactivated.cursor.dwellProgress).toBe(0);
  });

  it('Mapeo: x en cx − REACH·sw → índice 0; en cx + REACH·sw → último; en cx → el del medio', () => {
    const cx = 0.5;
    const sw = 0.2;
    const user = makeUser(cx, sw);
    const itemCount = 5;

    const inicio = cx - REACH * sw; // 0.5 - 0.32 = 0.18
    const fin = cx + REACH * sw; // 0.5 + 0.32 = 0.82
    const medio = cx; // 0.5

    // Espejado: cursor.x = 1 - palmX -> palmX = 1 - cursor.x
    // Para cursor.x = inicio (0.18) -> palmX = 0.82
    tracker.reset();
    for (let t = 0; t <= 250; t += 50) {
      tracker.update({
        nowMs: t,
        hands: [makeHand(0.65, 0.6, 1 - inicio, 0.5)],
        user,
        itemCount,
      });
    }
    const outMin = tracker.update({
      nowMs: 300,
      hands: [makeHand(0.65, 0.6, 1 - inicio, 0.5)],
      user,
      itemCount,
    });
    expect(outMin.cursor.index).toBe(0);

    // Para cursor.x = fin (0.82) -> palmX = 0.18
    tracker.reset();
    for (let t = 0; t <= 250; t += 50) {
      tracker.update({
        nowMs: t,
        hands: [makeHand(0.65, 0.6, 1 - fin, 0.5)],
        user,
        itemCount,
      });
    }
    const outMax = tracker.update({
      nowMs: 300,
      hands: [makeHand(0.65, 0.6, 1 - fin, 0.5)],
      user,
      itemCount,
    });
    expect(outMax.cursor.index).toBe(itemCount - 1);

    // Para cursor.x = medio (0.5) -> palmX = 0.5
    tracker.reset();
    for (let t = 0; t <= 250; t += 50) {
      tracker.update({
        nowMs: t,
        hands: [makeHand(0.65, 0.6, 1 - medio, 0.5)],
        user,
        itemCount,
      });
    }
    const outMid = tracker.update({
      nowMs: 300,
      hands: [makeHand(0.65, 0.6, 1 - medio, 0.5)],
      user,
      itemCount,
    });
    expect(outMid.cursor.index).toBe(Math.floor(0.5 * itemCount)); // 2
  });

  it('Espejado: mover la mano a la derecha de la imagen = cursor a la izquierda en pantalla', () => {
    const user = makeUser();
    // Mano a la derecha de la imagen (palmX = 0.85)
    tracker.reset();
    for (let t = 0; t <= 300; t += 50) {
      tracker.update({
        nowMs: t,
        hands: [makeHand(0.65, 0.6, 0.85, 0.5)],
        user,
        itemCount: 5,
      });
    }
    const outRightInImage = tracker.update({
      nowMs: 350,
      hands: [makeHand(0.65, 0.6, 0.85, 0.5)],
      user,
      itemCount: 5,
    });
    // Cursor en pantalla debe estar a la izquierda (< 0.5)
    expect(outRightInImage.cursor.x).toBeLessThan(0.3);

    // Mano a la izquierda de la imagen (palmX = 0.15)
    tracker.reset();
    for (let t = 0; t <= 300; t += 50) {
      tracker.update({
        nowMs: t,
        hands: [makeHand(0.35, 0.6, 0.15, 0.5)],
        user,
        itemCount: 5,
      });
    }
    const outLeftInImage = tracker.update({
      nowMs: 350,
      hands: [makeHand(0.35, 0.6, 0.15, 0.5)],
      user,
      itemCount: 5,
    });
    // Cursor en pantalla debe estar a la derecha (> 0.5)
    expect(outLeftInImage.cursor.x).toBeGreaterThan(0.7);
  });

  it('Histéresis: oscilar ±5 % de banda en el borde no cambia el índice', () => {
    // 5 prendas -> bandas de 0.2 ancho en t.
    // Índice 2 corresponde a t in [0.4, 0.6).
    // Borde entre índice 2 y 3 está en t = 0.6.
    // Con 15 % de histéresis (0.03), oscilar +- 5 % (0.01) de t no cruza el umbral.
    const cx = 0.5;
    const sw = 0.2;
    const user = makeUser(cx, sw);
    const itemCount = 5;
    const inicio = cx - REACH * sw;
    const ancho = 2 * REACH * sw;

    // Posicionar cursor en t = 0.5 (índice 2)
    const tCenter = 0.5;
    const xCenter = inicio + tCenter * ancho;
    for (let t = 0; t <= 300; t += 50) {
      tracker.update({
        nowMs: t,
        hands: [makeHand(0.65, 0.6, 1 - xCenter, 0.5)],
        user,
        itemCount,
      });
    }
    const centerOut = tracker.update({
      nowMs: 350,
      hands: [makeHand(0.65, 0.6, 1 - xCenter, 0.5)],
      user,
      itemCount,
    });
    expect(centerOut.cursor.index).toBe(2);

    // Acercar al borde derecho t = 0.6 + 0.05 * 0.2 = 0.61 (cruza borde pero < 15 % histéresis)
    const tOsc1 = 0.61;
    const xOsc1 = inicio + tOsc1 * ancho;
    const outOsc1 = tracker.update({
      nowMs: 400,
      hands: [makeHand(0.65, 0.6, 1 - xOsc1, 0.5)],
      user,
      itemCount,
    });
    expect(outOsc1.cursor.index).toBe(2);

    // Retroceder a t = 0.59
    const tOsc2 = 0.59;
    const xOsc2 = inicio + tOsc2 * ancho;
    const outOsc2 = tracker.update({
      nowMs: 450,
      hands: [makeHand(0.65, 0.6, 1 - xOsc2, 0.5)],
      user,
      itemCount,
    });
    expect(outOsc2.cursor.index).toBe(2);
  });

  it('Permanencia: 1199 ms no dispara; 1200 ms dispara una vez; seguir quieto no vuelve a disparar; cambiar de índice y volver rearma', () => {
    const user = makeUser();
    const hand = makeHand();

    // Activar cursor a los 250 ms
    for (let t = 0; t <= 250; t += 50) {
      tracker.update({ nowMs: t, hands: [hand], user, itemCount: 5 });
    }

    // A los 1199 ms desde activación (ahora ms = 250 + 1199 = 1449)
    const preOut = tracker.update({ nowMs: 1449, hands: [hand], user, itemCount: 5 });
    expect(preOut.events).toHaveLength(0);
    expect(preOut.cursor.dwellProgress).toBeGreaterThan(0.95);

    // A los 1200 ms (250 + 1200 = 1450)
    const fireOut = tracker.update({ nowMs: 1450, hands: [hand], user, itemCount: 5 });
    expect(fireOut.events).toHaveLength(1);
    expect(fireOut.events[0]).toEqual({
      type: 'take',
      index: fireOut.cursor.index,
      method: 'hand_dwell',
    });

    // Seguir quieto a los 1600 ms: no vuelve a disparar (desarmado)
    const postOut = tracker.update({ nowMs: 1600, hands: [hand], user, itemCount: 5 });
    expect(postOut.events).toHaveLength(0);
    expect(postOut.cursor.dwellProgress).toBe(0);

    // Mover a otro índice para rearmar (índice 0)
    const cx = user.cx;
    const sw = user.sw;
    const xOther = cx - REACH * sw + 0.1 * 2 * REACH * sw; // índice 0
    const otherHand = makeHand(0.65, 0.6, 1 - xOther, 0.5);
    let indexZeroReachedMs = 0;
    for (let t = 1700; t <= 2200; t += 50) {
      const out = tracker.update({ nowMs: t, hands: [otherHand], user, itemCount: 5 });
      if (out.cursor.index === 0 && !indexZeroReachedMs) {
        indexZeroReachedMs = t;
      }
    }
    expect(indexZeroReachedMs).toBeGreaterThan(0);

    // Volver a hand y esperar hasta que el índice vuelva a 2 y transcurran 1200 ms
    let indexTwoReachedMs = 0;
    let firedOut: ReturnType<typeof tracker.update> | null = null;
    for (let t = 2250; t <= 4500; t += 50) {
      const out = tracker.update({ nowMs: t, hands: [hand], user, itemCount: 5 });
      if (out.cursor.index === 2 && !indexTwoReachedMs) {
        indexTwoReachedMs = t;
      }
      if (out.events.length > 0) {
        firedOut = out;
        break;
      }
    }
    expect(firedOut).not.toBeNull();
    expect(firedOut?.events).toHaveLength(1);
    expect(firedOut?.events[0]?.method).toBe('hand_dwell');
  });

  it('Atajo: Open_Palm → Pointing_Up sostenido 300 ms dispara; Pointing_Up desde el inicio (sin palma previa) no dispara el atajo (solo mueve el cursor)', () => {
    const user = makeUser();

    // Caso A: Pointing_Up desde el inicio (sin palma previa)
    tracker.reset();
    const pointingHand = makeHand(0.65, 0.6, 0.65, 0.5, 'Pointing_Up', 0.9);
    for (let t = 0; t <= 600; t += 50) {
      const out = tracker.update({ nowMs: t, hands: [pointingHand], user, itemCount: 5 });
      // No debe disparar atajo porque no hubo palma previa
      const pointEvents = out.events.filter((e) => e.method === 'hand_point');
      expect(pointEvents).toHaveLength(0);
    }

    // Caso B: Open_Palm sostenida primero, luego cambia a Pointing_Up y sostiene 300 ms
    tracker.reset();
    const palmHand = makeHand(0.65, 0.6, 0.65, 0.5, 'Open_Palm', 0.9);
    // Palma durante 600 ms (activa a los 250 ms, índice estable >= 300 ms a los 550 ms)
    for (let t = 0; t <= 600; t += 50) {
      tracker.update({ nowMs: t, hands: [palmHand], user, itemCount: 5 });
    }
    // Transición a Pointing_Up durante 300 ms (de 650 a 950 ms)
    for (let t = 650; t < 950; t += 50) {
      const midOut = tracker.update({
        nowMs: t,
        hands: [pointingHand],
        user,
        itemCount: 5,
      });
      const pointEvents = midOut.events.filter((e) => e.method === 'hand_point');
      expect(pointEvents).toHaveLength(0);
    }
    // A los 300 ms de Pointing_Up (t = 950 ms)
    const fireOut = tracker.update({
      nowMs: 950,
      hands: [pointingHand],
      user,
      itemCount: 5,
    });
    const pointEvents = fireOut.events.filter((e) => e.method === 'hand_point');
    expect(pointEvents).toHaveLength(1);
    expect(pointEvents[0]).toEqual({
      type: 'take',
      index: fireOut.cursor.index,
      method: 'hand_point',
    });
  });

  it('busy o pausa → no hay eventos', () => {
    const user = makeUser();
    const hand = makeHand();

    // Iniciar con busy: true
    for (let t = 0; t <= 2000; t += 50) {
      const out = tracker.update({
        nowMs: t,
        hands: [hand],
        user,
        itemCount: 5,
        busy: true,
      });
      expect(out.events).toHaveLength(0);
      expect(out.cursor.dwellProgress).toBe(0);
    }

    // Iniciar con pausedUntilMs en el futuro
    for (let t = 0; t <= 2000; t += 50) {
      const out = tracker.update({
        nowMs: t,
        hands: [hand],
        user,
        itemCount: 5,
        pausedUntilMs: 5000,
      });
      expect(out.events).toHaveLength(0);
      expect(out.cursor.dwellProgress).toBe(0);
    }
  });

  it('Con dos manos del usuario, se usa la más alta', () => {
    const user = makeUser();
    // Mano baja (y = 0.6) y mano alta (y = 0.25)
    const handLow = makeHand(0.65, 0.6, 0.65, 0.6);
    const handHigh = makeHand(0.35, 0.6, 0.35, 0.25);

    const { activeHand } = selectUserHand([handLow, handHigh], user);
    expect(activeHand).not.toBeNull();
    expect(activeHand?.palmCenter.y).toBe(0.25);

    for (let t = 0; t <= 300; t += 50) {
      tracker.update({
        nowMs: t,
        hands: [handLow, handHigh],
        user,
        itemCount: 5,
      });
    }
    const out = tracker.update({
      nowMs: 350,
      hands: [handLow, handHigh],
      user,
      itemCount: 5,
    });
    expect(out.cursor.y).toBeCloseTo(0.25, 1);
  });
});
