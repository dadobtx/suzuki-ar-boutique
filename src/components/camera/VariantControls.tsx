import { useTranslation } from 'react-i18next';
import { useGarmentStore } from '@/store/garment';

export function VariantControls() {
  const { t } = useTranslation();
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const activeVariantId = useGarmentStore((s) => s.activeVariantId);
  const selectVariant = useGarmentStore((s) => s.selectVariant);
  const catalog = useGarmentStore((s) => s.catalog);

  if (!activeGarmentId) return null;

  const garment = catalog.find((g) => g.id === activeGarmentId);
  if (!garment || !garment.variants || garment.variants.length <= 1) {
    return null;
  }

  const defaultVariant = garment.variants[0];
  if (!defaultVariant) return null;

  const effectiveVariantId = activeVariantId ?? defaultVariant.id;

  return (
    <div className="absolute top-20 right-44 bg-black/60 backdrop-blur-md border border-zinc-700 rounded-2xl p-4 flex flex-col items-center gap-3 z-40 text-white shadow-2xl">
      <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest text-center">
        {t('variant.title', 'Cara')}
      </span>
      <div className="flex items-center gap-2">
        {garment.variants.map((v) => {
          const isSelected = effectiveVariantId === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => selectVariant(v.id)}
              className={`min-w-[72px] min-h-[72px] p-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-zinc-800 border-2 border-brand-red shadow-[0_0_12px_rgba(230,0,18,0.4)]'
                  : 'bg-zinc-900/80 border border-zinc-700 hover:bg-zinc-800/80 text-zinc-400'
              }`}
            >
              <span
                className="w-6 h-6 rounded-full border border-white/30 shadow-inner flex-shrink-0"
                style={{ backgroundColor: v.color }}
              />
              <span
                className={`text-xs font-bold leading-none ${
                  isSelected ? 'text-white' : 'text-zinc-400'
                }`}
              >
                {v.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
