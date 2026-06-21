import { Plus, Minus } from 'lucide-react';
import { useSizingStore } from '@/store/sizing';
import { useGarmentStore } from '@/store/garment';
import { recomendarTallaGarment } from '@/lib/sizing';
import { useEffect, useState } from 'react';
import type { UsePoseResult } from '@/hooks/usePose';
const BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8787';

export function SizingControls({ pose }: { pose?: UsePoseResult }) {
  const profile = useSizingStore();
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const catalog = useGarmentStore((s) => s.catalog);
  const setTallaElegida = useSizingStore((s) => s.setTallaElegida);

  const [estimatedChest, setEstimatedChest] = useState<number | null>(null);
  const [hasPersisted, setHasPersisted] = useState(false);

  // Reset estimation when session changes (e.g. new user)
  useEffect(() => {
    setEstimatedChest(null);
    setHasPersisted(false);
  }, [profile.sessionId]);

  useEffect(() => {
    if (!pose?.worldLandmarks || hasPersisted) return;

    // 11 = left shoulder, 12 = right shoulder
    const l11 = pose.worldLandmarks[11];
    const l12 = pose.worldLandmarks[12];

    if (
      l11 &&
      l12 &&
      l11.visibility &&
      l12.visibility &&
      l11.visibility > 0.8 &&
      l12.visibility > 0.8
    ) {
      const dx = l11.x - l12.x;
      const dy = l11.y - l12.y;
      const dz = l11.z - l12.z;
      const distanceMeters = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const shoulderWidthCm = distanceMeters * 100;
      // Rough estimation: Chest is ~2.5 to 2.8 times the shoulder to shoulder distance.
      const chestEst = Math.round(shoulderWidthCm * 2.5);

      if (chestEst > 60 && chestEst < 160) {
        setEstimatedChest(chestEst);
        setHasPersisted(true);

        fetch(`${BACKEND_URL}/kiosk/sessions/ar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: profile.sessionId,
            pecho_ar: chestEst,
            ar_confianza: 0.4, // Fixed confidence since it's a rough RGB camera estimation
          }),
        }).catch(() => {
          // swallow error
        });
      }
    }
  }, [pose?.worldLandmarks, hasPersisted, profile.sessionId]);

  if (!profile.hasProfile || !activeGarmentId) return null;

  const garment = catalog.find((g) => g.id === activeGarmentId);
  if (!garment || !garment.sizes || garment.sizes.length === 0) return null;

  const { recomendada } = recomendarTallaGarment(profile, garment);
  const elegida = profile.tallasElegidas[garment.sku] || recomendada;

  const currentIndex = garment.sizes.indexOf(
    elegida as 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'Única',
  );

  const handleNext = () => {
    if (currentIndex >= 0 && currentIndex < garment.sizes.length - 1) {
      setTallaElegida(garment.sku, garment.sizes[currentIndex + 1] as string);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setTallaElegida(garment.sku, garment.sizes[currentIndex - 1] as string);
    }
  };

  return (
    <div className="absolute top-20 right-4 bg-black/60 backdrop-blur-md border border-zinc-700 rounded-2xl p-4 flex flex-col items-center gap-3 z-40 text-white w-[140px] shadow-2xl">
      <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest text-center">
        Tu Talla
      </span>
      <div className="flex items-center justify-between w-full">
        <button
          onClick={handlePrev}
          disabled={currentIndex <= 0}
          className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <Minus size={16} />
        </button>
        <span className="font-display text-3xl font-black text-cyan-400 drop-shadow-md">
          {elegida}
        </span>
        <button
          onClick={handleNext}
          disabled={currentIndex === -1 || currentIndex >= garment.sizes.length - 1}
          className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="text-center w-full mt-1">
        {elegida === recomendada ? (
          <span className="text-[11px] font-bold text-green-400 leading-tight block">
            ✓ Talla recomendada
          </span>
        ) : (
          <button
            onClick={() => setTallaElegida(garment.sku, recomendada)}
            className="text-[11px] text-zinc-400 hover:text-white transition-colors leading-tight cursor-pointer"
          >
            Te recomendamos:{' '}
            <span className="font-bold text-cyan-400">{recomendada}</span>
            <br />
            <span className="text-[9px] underline opacity-70">Tocar para restaurar</span>
          </button>
        )}
      </div>

      {estimatedChest && (
        <div className="mt-2 pt-2 border-t border-zinc-700/50 w-full text-center">
          <span className="text-[9px] text-zinc-500 uppercase tracking-wide block">
            AR INFO
          </span>
          <span className="text-[10px] text-zinc-400 font-mono">
            Pecho aprox: ~{estimatedChest} cm
          </span>
        </div>
      )}
    </div>
  );
}
