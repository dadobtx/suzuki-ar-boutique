import { create } from 'zustand';

const BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8787';

interface SizingState {
  hasProfile: boolean;
  sessionId: string | null;
  tallaHabitual: string | null;
  preferenciaFit: 'ajustado' | 'regular' | 'holgado';
  arConfianza: number;
  tallasElegidas: Record<string, string>;
  setProfile: (
    talla: string | null,
    fit: 'ajustado' | 'regular' | 'holgado',
  ) => Promise<void>;
  setTallaElegida: (sku: string, talla: string) => void;
  recordInteraction: (
    sku: string,
    accion: 'probo' | 'favorito',
    tallaRecomendada: string,
    tallaElegida: string,
    tablaOrigenId: string,
  ) => void;
  reset: () => void;
}

export const useSizingStore = create<SizingState>((set, get) => ({
  hasProfile: false,
  sessionId: null,
  tallaHabitual: null,
  preferenciaFit: 'regular',
  arConfianza: 0,
  tallasElegidas: {},

  setProfile: async (talla, fit) => {
    const params = new URLSearchParams(window.location.search);
    const kiosk_id = params.get('kiosk_id') || 'default-kiosk';
    const event = params.get('event') || 'default-event';

    let sessionId = null;

    try {
      const res = await fetch(`${BACKEND_URL}/kiosk/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ubicacion_evento: event,
          dispositivo_id: kiosk_id,
          talla_habitual: talla === 'No sé' ? null : talla,
          preferencia_fit: fit,
          ar_confianza: 0,
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        sessionId = data.session_id;
      }
    } catch {
      console.warn('Could not create anonymous session in backend, using local fallback');
      sessionId = 'fallback-' + Date.now();
    }

    set({
      hasProfile: true,
      sessionId,
      tallaHabitual: talla === 'No sé' ? null : talla,
      preferenciaFit: fit,
      arConfianza: 0,
    });
  },

  setTallaElegida: (sku, talla) =>
    set((s) => ({
      tallasElegidas: { ...s.tallasElegidas, [sku]: talla },
    })),

  recordInteraction: async (
    sku,
    accion,
    tallaRecomendada,
    tallaElegida,
    tablaOrigenId,
  ) => {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      fetch(`${BACKEND_URL}/kiosk/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          sku,
          accion,
          talla_recomendada: tallaRecomendada,
          talla_elegida: tallaElegida,
          tabla_origen_id: tablaOrigenId,
        }),
      }).catch(() => {
        // tragar errores
      });
    } catch {
      // tragar errores
    }
  },

  reset: () =>
    set({
      hasProfile: false,
      sessionId: null,
      tallaHabitual: null,
      preferenciaFit: 'regular',
      arConfianza: 0,
      tallasElegidas: {},
    }),
}));
