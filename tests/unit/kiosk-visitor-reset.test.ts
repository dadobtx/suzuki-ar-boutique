// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useKioskStore, clearVisitorState, restartSession } from '@/store/kiosk';
import { useGarmentStore } from '@/store/garment';
import { useSizingStore } from '@/store/sizing';
import { usePhotoStore } from '@/store/photo';
import { useAnalyticsStore } from '@/store/analytics';
import type { SessionOutcome } from '@/lib/analytics-events';

describe('Limpieza de estado al terminar visita (kiosk visitor reset)', () => {
  beforeEach(() => {
    // Reset stores
    usePhotoStore.getState().clearPhoto();
    useGarmentStore.setState({
      activeGarmentId: null,
      activeVariantId: null,
      wishlist: [],
      filters: {
        line: 'Todas',
        category: null,
        sizes: [],
        colors: [],
      },
    });
    useSizingStore.getState().reset();
    useAnalyticsStore.setState({
      events: [],
      currentSessionId: null,
      sessionStartTime: null,
    });
    useKioskStore.setState({
      state: 'ATTRACT',
      stateStartTime: Date.now(),
    });
  });

  it('clearVisitorState() limpia fotos, prenda, filtros, tallaje sin transicionar de estado', () => {
    useGarmentStore.setState({
      activeGarmentId: '990F0-JYFJ1',
      wishlist: ['990F0-JYFJ1'],
    });
    useSizingStore.setState({
      hasProfile: true,
      tallaHabitual: 'M',
      preferenciaFit: 'regular',
      tallasElegidas: { '990F0-JYFJ1': 'M' },
    });
    usePhotoStore.setState({
      currentPhotoComposed: 'data:image/png;base64,composed',
    });
    useKioskStore.setState({ state: 'TRYON', stateStartTime: Date.now() });

    clearVisitorState();

    expect(useGarmentStore.getState().activeGarmentId).toBeNull();
    expect(useGarmentStore.getState().wishlist).toEqual([]);
    expect(useSizingStore.getState().hasProfile).toBe(false);
    expect(usePhotoStore.getState().currentPhotoComposed).toBeNull();
    // No modifica el estado de la máquina
    expect(useKioskStore.getState().state).toBe('TRYON');
  });

  it('TRYON con prenda, wishlist y perfil → reset() → ATTRACT, activeGarmentId null, wishlist vacía, sizing sin perfil, foto limpia', () => {
    // Set up visitor in TRYON with full state
    useGarmentStore.setState({
      activeGarmentId: '990F0-JYFJ1',
      wishlist: ['990F0-JYFJ1', '990F0-BKTM1'],
      filters: {
        line: 'Team',
        category: 'chaquetas',
        sizes: ['L'],
        colors: ['#000'],
      },
    });
    useSizingStore.setState({
      hasProfile: true,
      tallaHabitual: 'L',
      preferenciaFit: 'oversize',
      tallasElegidas: { '990F0-JYFJ1': 'L' },
    });
    usePhotoStore.setState({
      currentPhotoComposed: 'data:image/png;base64,abc',
      currentPhotoClean: 'data:image/png;base64,xyz',
    });
    useKioskStore.setState({ state: 'TRYON', stateStartTime: Date.now() });

    // Call reset()
    useKioskStore.getState().reset();

    // Verify all visitor state is cleaned
    expect(useKioskStore.getState().state).toBe('ATTRACT');
    expect(useGarmentStore.getState().activeGarmentId).toBeNull();
    expect(useGarmentStore.getState().wishlist).toEqual([]);
    expect(useGarmentStore.getState().filters).toEqual({
      line: 'Todas',
      category: null,
      sizes: [],
      colors: [],
    });
    expect(useSizingStore.getState().hasProfile).toBe(false);
    expect(useSizingStore.getState().tallaHabitual).toBeNull();
    expect(useSizingStore.getState().tallasElegidas).toEqual({});
    expect(usePhotoStore.getState().currentPhotoComposed).toBeNull();
    expect(usePhotoStore.getState().currentPhotoClean).toBeNull();
  });

  it('transition("ATTRACT") desde COOLDOWN hace la misma limpieza', () => {
    // Visitor leaves, presence triggers COOLDOWN
    useGarmentStore.setState({
      activeGarmentId: '990F0-BKQJ5',
      wishlist: ['990F0-BKQJ5'],
    });
    useSizingStore.setState({
      hasProfile: true,
      tallaHabitual: 'M',
      preferenciaFit: 'regular',
      tallasElegidas: { '990F0-BKQJ5': 'M' },
    });
    usePhotoStore.setState({
      currentPhotoComposed: 'data:image/png;base64,captured',
    });
    useKioskStore.setState({ state: 'COOLDOWN', stateStartTime: Date.now() });

    // Cooldown countdown expires -> transition('ATTRACT')
    useKioskStore.getState().transition('ATTRACT');

    expect(useKioskStore.getState().state).toBe('ATTRACT');
    expect(useGarmentStore.getState().activeGarmentId).toBeNull();
    expect(useGarmentStore.getState().wishlist).toEqual([]);
    expect(useSizingStore.getState().hasProfile).toBe(false);
    expect(usePhotoStore.getState().currentPhotoComposed).toBeNull();
  });

  it('restartSession() sigue dejando exactamente el mismo estado que hoy', () => {
    useGarmentStore.setState({
      activeGarmentId: '990F0-BKTM1',
      wishlist: ['990F0-BKTM1'],
    });
    useSizingStore.setState({
      hasProfile: true,
      tallaHabitual: 'S',
      preferenciaFit: 'slim',
      tallasElegidas: { '990F0-BKTM1': 'S' },
    });
    usePhotoStore.setState({
      currentPhotoComposed: 'data:image/png;base64,captured',
    });
    useKioskStore.setState({ state: 'TRYON', stateStartTime: Date.now() });

    restartSession();

    expect(useKioskStore.getState().state).toBe('ATTRACT');
    expect(useGarmentStore.getState().activeGarmentId).toBeNull();
    expect(useGarmentStore.getState().wishlist).toEqual([]);
    expect(useSizingStore.getState().hasProfile).toBe(false);
    expect(usePhotoStore.getState().currentPhotoComposed).toBeNull();
  });

  it('endSession recibe el outcome correcto antes de limpiar (photo_taken si hubo foto)', () => {
    const sessionId = useAnalyticsStore.getState().startSession();
    expect(sessionId).toBeTruthy();

    useGarmentStore.setState({ activeGarmentId: '990F0-JYFJ1' });
    usePhotoStore.setState({ currentPhotoComposed: 'data:image/png;base64,pic' });
    useKioskStore.setState({ state: 'SHARE_QR', stateStartTime: Date.now() });

    // Track photo generated in session
    useAnalyticsStore.getState().track({
      type: 'photo_generated',
      sessionId,
      garmentId: '990F0-JYFJ1',
    });

    // Transition to ATTRACT
    useKioskStore.getState().transition('ATTRACT');

    // The session ended event must be recorded with outcome 'photo_taken'
    const endedEvents = useAnalyticsStore.getState().query({
      type: 'session_ended',
      sessionId,
    });
    expect(endedEvents).toHaveLength(1);
    const sessionEnded = endedEvents[0] as {
      type: 'session_ended';
      outcome: SessionOutcome;
    };
    expect(sessionEnded.outcome).toBe('photo_taken');

    // And visitor state is clean
    expect(useKioskStore.getState().state).toBe('ATTRACT');
    expect(useGarmentStore.getState().activeGarmentId).toBeNull();
    expect(usePhotoStore.getState().currentPhotoComposed).toBeNull();
  });
});
