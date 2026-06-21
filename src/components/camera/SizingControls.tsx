import { Plus, Minus } from 'lucide-react';
import { useSizingStore } from '@/store/sizing';
import { useGarmentStore } from '@/store/garment';
import { recomendarTallaGarment } from '@/lib/sizing';

export function SizingControls() {
  const profile = useSizingStore();
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const catalog = useGarmentStore((s) => s.catalog);
  const setTallaElegida = useSizingStore((s) => s.setTallaElegida);

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
          className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 transition-colors"
        >
          <Minus size={16} />
        </button>
        <span className="font-display text-3xl font-black text-cyan-400">{elegida}</span>
        <button
          onClick={handleNext}
          disabled={currentIndex === -1 || currentIndex >= garment.sizes.length - 1}
          className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>
      {elegida !== recomendada && (
        <span className="text-[10px] text-yellow-400 text-center leading-tight">
          Sugerida: {recomendada}
        </span>
      )}
    </div>
  );
}
