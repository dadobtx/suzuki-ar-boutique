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
    <div className="w-full bg-surface/85 backdrop-blur-md border border-line clip-hud p-4 flex flex-col items-center gap-3 text-fg shadow-2xl">
      <span className="text-xs font-bold text-fg-muted uppercase tracking-widest text-center">
        {t('variant.title', 'COLOR')}
      </span>
      <div className="flex items-center gap-2 w-full">
        {garment.variants.map((v) => {
          const isSelected = effectiveVariantId === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => selectVariant(v.id)}
              aria-label={`Color ${v.label}`}
              aria-pressed={isSelected}
              className={`flex-1 min-w-[88px] min-h-[88px] p-2 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-surface-2 border-2 border-fg text-fg'
                  : 'bg-surface/80 border border-line hover:bg-surface-2 text-fg-muted'
              }`}
            >
              <span
                className="w-10 h-10 rounded-full border border-white/30 shadow-inner flex-shrink-0"
                style={{ backgroundColor: v.color }}
              />
              <span
                className={`text-base font-bold leading-none ${
                  isSelected ? 'text-fg' : 'text-fg-muted'
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
