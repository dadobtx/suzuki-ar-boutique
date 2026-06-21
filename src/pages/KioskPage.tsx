import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Heart, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { recomendarTalla } from '../lib/sizing';
import type { Prenda, TablaTallas, FilaTabla, SesionKiosko } from '../lib/sizing';

const BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8787';

type KioskStep = 'attraction' | 'questionnaire' | 'tryon' | 'outro';

export function KioskPage() {
  const [searchParams] = useSearchParams();
  const kiosk_id = searchParams.get('kiosk_id') || 'default-kiosk';
  const event = searchParams.get('event') || 'default-event';

  const [step, setStep] = useState<KioskStep>('attraction');
  const [sesion, setSesion] = useState<SesionKiosko | null>(null);

  const [catalog, setCatalog] = useState<{ prendas: Prenda[]; tablas: TablaTallas[] }>({
    prendas: [],
    tablas: [],
  });
  const [currentPrendaIdx, setCurrentPrendaIdx] = useState(0);

  // Questionnaire state
  const [tallaHabitual, setTallaHabitual] = useState<string | null>(null);
  const [preferenciaFit, setPreferenciaFit] = useState<
    'ajustado' | 'regular' | 'holgado'
  >('regular');
  // Mock AR scanning state for demo (tablet RGB: el AR es solo apoyo)
  const [isScanning, setIsScanning] = useState(false);
  const [arConfianza, setArConfianza] = useState(0);

  // TryOn state
  const [tallaElegida, setTallaElegida] = useState<string | null>(null);
  const [recomendacion, setRecomendacion] = useState<string>('M');

  useEffect(() => {
    // Fetch catalog
    fetch(`${BACKEND_URL}/kiosk/catalog`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'success') {
          const rawTablas = (data.tablas ?? []) as Array<
            Omit<TablaTallas, 'filas'> & { filas: string | FilaTabla[] }
          >;
          const tablas: TablaTallas[] = rawTablas.map((t) => ({
            ...t,
            filas: typeof t.filas === 'string' ? JSON.parse(t.filas) : t.filas,
          }));
          const rawPrendas = (data.prendas ?? []) as Array<
            Omit<Prenda, 'tallas_disponibles'> & { tallas_disponibles: string | string[] }
          >;
          const prendas: Prenda[] = rawPrendas.map((p) => ({
            ...p,
            tallas_disponibles:
              typeof p.tallas_disponibles === 'string'
                ? JSON.parse(p.tallas_disponibles)
                : p.tallas_disponibles,
          }));
          setCatalog({ prendas, tablas });
        }
      })
      .catch((err) => console.error('Error fetching catalog', err));
  }, []);

  const updateRecommendation = (
    idx: number,
    currentSession: SesionKiosko | null = sesion,
  ) => {
    if (!currentSession || !catalog.prendas[idx]) return;
    const prenda = catalog.prendas[idx];
    const tabla = catalog.tablas.find((t) => t.tabla_id === prenda.tabla_origen_id);
    if (!tabla) return;

    const rec = recomendarTalla(currentSession, prenda, tabla);
    setRecomendacion(rec);
    setTallaElegida(rec);
  };

  const startSession = async () => {
    const baseSession = {
      talla_habitual: tallaHabitual === 'No sé' ? null : tallaHabitual,
      preferencia_fit: preferenciaFit,
      ar_confianza: arConfianza,
    };
    try {
      const res = await fetch(`${BACKEND_URL}/kiosk/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ubicacion_evento: event,
          dispositivo_id: kiosk_id,
          ...baseSession,
          pecho_ar: null, // Simulated
          cintura_ar: null, // Simulated
          altura_ar: null, // Simulated
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        const nueva: SesionKiosko = { session_id: data.session_id, ...baseSession };
        setSesion(nueva);
        setStep('tryon');
        updateRecommendation(0, nueva);
        return;
      }
      throw new Error('session not created');
    } catch (err) {
      console.error(err);
      // Fallback local session for offline/demo
      const fakeSession: SesionKiosko = {
        session_id: 'fake-' + Date.now(),
        ...baseSession,
      };
      setSesion(fakeSession);
      setStep('tryon');
      updateRecommendation(0, fakeSession);
    }
  };

  const logInteraction = async (accion: 'probo' | 'favorito') => {
    if (!sesion || !catalog.prendas[currentPrendaIdx]) return;
    const prenda = catalog.prendas[currentPrendaIdx];
    try {
      await fetch(`${BACKEND_URL}/kiosk/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sesion.session_id,
          sku: prenda.sku,
          accion,
          talla_recomendada: recomendacion,
          talla_elegida: tallaElegida,
          tabla_origen_id: prenda.tabla_origen_id,
        }),
      });
    } catch (err) {
      console.error('Interaction logging failed', err);
    }
  };

  const resetKiosk = () => {
    setStep('attraction');
    setSesion(null);
    setCurrentPrendaIdx(0);
    setTallaHabitual(null);
    setPreferenciaFit('regular');
    setIsScanning(false);
    setArConfianza(0);
  };

  const nextPrenda = () => {
    logInteraction('probo');
    if (currentPrendaIdx < catalog.prendas.length - 1) {
      const nextIdx = currentPrendaIdx + 1;
      setCurrentPrendaIdx(nextIdx);
      updateRecommendation(nextIdx);
    } else {
      setStep('outro');
      setTimeout(() => resetKiosk(), 5000);
    }
  };

  const prevPrenda = () => {
    if (currentPrendaIdx > 0) {
      const prevIdx = currentPrendaIdx - 1;
      setCurrentPrendaIdx(prevIdx);
      updateRecommendation(prevIdx);
    }
  };

  const handleFavorite = () => {
    logInteraction('favorito');
  };

  const simulateArScan = () => {
    setIsScanning(true);
    setArConfianza(0);
    // Simulación: tablet RGB produce confianza baja; el AR es solo apoyo.
    setTimeout(() => {
      setIsScanning(false);
      setArConfianza(0.4);
    }, 2000);
  };

  if (step === 'attraction') {
    return (
      <div
        className="h-screen w-screen flex flex-col items-center justify-center bg-black text-white cursor-pointer"
        onClick={() => setStep('questionnaire')}
      >
        <h1 className="text-6xl font-bold mb-4 animate-pulse">Suzuki Boutique</h1>
        <p className="text-2xl text-gray-300">Toca para descubrir tu talla ideal</p>
      </div>
    );
  }

  if (step === 'questionnaire') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-900 text-white p-8">
        <h2 className="text-4xl font-bold mb-12 text-center">Ayúdanos a recomendarte</h2>

        <div className="w-full max-w-2xl space-y-10">
          {/* Habitual Size */}
          <div>
            <h3 className="text-2xl mb-4 text-center">¿Qué talla usas normalmente?</h3>
            <div className="flex justify-center gap-4 flex-wrap">
              {['XS', 'S', 'M', 'L', 'XL', 'No sé'].map((size) => (
                <button
                  key={size}
                  onClick={() => setTallaHabitual(size)}
                  className={`px-6 py-4 text-xl rounded-lg border-2 transition-all ${tallaHabitual === size ? 'bg-white text-black border-white' : 'border-zinc-700 hover:border-zinc-500'}`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Fit Preference */}
          <div>
            <h3 className="text-2xl mb-4 text-center">¿Cómo prefieres que te quede?</h3>
            <div className="flex justify-center gap-4 flex-wrap">
              {[
                { id: 'ajustado', label: 'Ajustado' },
                { id: 'regular', label: 'Regular' },
                { id: 'holgado', label: 'Holgado' },
              ].map((fit) => (
                <button
                  key={fit.id}
                  onClick={() =>
                    setPreferenciaFit(fit.id as 'ajustado' | 'regular' | 'holgado')
                  }
                  className={`px-6 py-4 text-xl rounded-lg border-2 transition-all ${preferenciaFit === fit.id ? 'bg-white text-black border-white' : 'border-zinc-700 hover:border-zinc-500'}`}
                >
                  {fit.label}
                </button>
              ))}
            </div>
          </div>

          {/* AR Scan (simulado, solo apoyo) */}
          <div className="text-center">
            <button
              onClick={simulateArScan}
              disabled={isScanning}
              className="px-6 py-3 text-lg rounded-lg border-2 border-zinc-700 hover:border-zinc-500 disabled:opacity-50"
            >
              {isScanning
                ? 'Escaneando…'
                : arConfianza > 0
                  ? 'Escaneo completado ✓'
                  : 'Escaneo AR (opcional)'}
            </button>
          </div>

          {/* Start */}
          <div className="text-center pt-2">
            <button
              onClick={startSession}
              disabled={!tallaHabitual}
              className="px-12 py-5 text-2xl font-bold rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Comenzar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'tryon') {
    const prenda = catalog.prendas[currentPrendaIdx];
    if (!prenda) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-zinc-900 text-white">
          <p className="text-2xl">Cargando catálogo…</p>
        </div>
      );
    }
    const tallasDisponibles = Array.isArray(prenda.tallas_disponibles)
      ? prenda.tallas_disponibles
      : [];
    return (
      <div className="h-screen w-screen flex flex-col bg-zinc-900 text-white">
        {/* Header */}
        <div className="flex items-center justify-between p-6">
          <span className="text-lg text-zinc-400">
            {currentPrendaIdx + 1} / {catalog.prendas.length}
          </span>
          <button onClick={resetKiosk} className="p-2 rounded-full hover:bg-zinc-800">
            <X size={28} />
          </button>
        </div>

        {/* Garment */}
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <h2 className="text-4xl font-bold mb-2 text-center">{prenda.nombre}</h2>
          <p className="text-xl text-zinc-400 mb-8 capitalize">{prenda.tipo}</p>

          <div className="bg-zinc-800 rounded-2xl px-10 py-6 mb-8 text-center">
            <p className="text-lg text-zinc-400 mb-1">Tu talla ideal</p>
            <p className="text-5xl font-bold text-red-500">{recomendacion}</p>
            <p className="text-sm text-zinc-500 mt-2">aproximado · ajústalo si quieres</p>
          </div>

          {/* Size adjust */}
          <div className="flex items-center gap-3 flex-wrap justify-center mb-6">
            {tallasDisponibles.map((t) => (
              <button
                key={t}
                onClick={() => setTallaElegida(t)}
                className={`px-6 py-3 text-xl rounded-lg border-2 transition-all ${tallaElegida === t ? 'bg-white text-black border-white' : 'border-zinc-700 hover:border-zinc-500'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between p-8">
          <button
            onClick={prevPrenda}
            disabled={currentPrendaIdx === 0}
            className="p-4 rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30"
          >
            <ChevronLeft size={32} />
          </button>

          <button
            onClick={handleFavorite}
            className="flex items-center gap-2 px-8 py-4 text-xl rounded-xl bg-red-600 hover:bg-red-700 transition-all"
          >
            <Heart size={24} /> Me gusta
          </button>

          <button
            onClick={nextPrenda}
            className="p-4 rounded-full bg-zinc-800 hover:bg-zinc-700"
          >
            <ChevronRight size={32} />
          </button>
        </div>
      </div>
    );
  }

  if (step === 'outro') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-black text-white p-8">
        <h1 className="text-5xl font-bold mb-4">¡Gracias!</h1>
        <p className="text-2xl text-zinc-300 text-center max-w-xl">
          Tus preferencias nos ayudan a traer las prendas Suzuki que más te gustan.
        </p>
      </div>
    );
  }

  return null;
}
