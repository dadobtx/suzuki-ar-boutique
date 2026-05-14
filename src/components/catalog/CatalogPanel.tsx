import { useMemo } from 'react';
import { useLayout } from '@/hooks/useLayout';
import { useGarmentStore } from '@/store/garment';
import { CatalogLineTabs } from './CatalogLineTabs';
import { CatalogCategoryChips } from './CatalogCategoryChips';
import { CatalogCard } from './CatalogCard';
import { filterGarments } from '@/lib/garment-filter';

export function CatalogPanel() {
  const { layout } = useLayout();
  const catalog = useGarmentStore((s) => s.catalog);
  const filters = useGarmentStore((s) => s.filters);

  const filteredCatalog = useMemo(() => {
    return filterGarments(catalog, filters);
  }, [catalog, filters]);

  const isPortrait = layout === 'portrait';

  return (
    <div className="bg-surface flex flex-col w-full h-full overflow-hidden border-t md:border-t-0 md:border-l border-surface-hover shadow-2xl relative">
      {/* Header / Tabs - Fixed */}
      <div className="flex flex-col bg-surface z-10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
        <CatalogLineTabs />
        <CatalogCategoryChips />
      </div>

      {/* Content Area */}
      <div
        className={`
        flex-1 overflow-auto scrollbar-hide p-6
        ${isPortrait ? 'flex flex-row gap-6 snap-x snap-mandatory' : 'grid grid-cols-2 gap-6 content-start'}
      `}
      >
        {filteredCatalog.map((garment) => (
          <div
            key={garment.id}
            className={isPortrait ? 'snap-center shrink-0 w-[300px]' : ''}
          >
            <CatalogCard garment={garment} />
          </div>
        ))}

        {filteredCatalog.length === 0 && (
          <div
            className={`flex flex-col items-center justify-center text-fg-muted h-full w-full ${isPortrait ? 'min-w-[300px]' : 'col-span-2 min-h-[300px]'}`}
          >
            <span className="font-display text-2xl tracking-widest uppercase">
              Sin resultados
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
