import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGarmentStore } from '@/store/garment';

export function CatalogCategoryChips() {
  const { t } = useTranslation();
  const catalog = useGarmentStore((s) => s.catalog);
  const filters = useGarmentStore((s) => s.filters);
  const setFilter = useGarmentStore((s) => s.setFilter);

  const availableCategories = useMemo(() => {
    let items = catalog;
    if (filters.line !== 'Todas') {
      items = items.filter((g) => g.line === filters.line);
    }
    const cats = new Set(items.map((g) => g.category));
    return Array.from(cats).sort();
  }, [catalog, filters.line]);

  if (availableCategories.length <= 1) return null;

  return (
    <div className="flex w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide py-2 px-4 gap-3">
      <button
        onClick={() => setFilter('category', null)}
        className={`
          snap-start shrink-0 px-6 font-mono text-sm border transition-all flex items-center justify-center
          clip-hud
          ${
            filters.category === null
              ? 'bg-brand-red/20 border-brand-red text-white glow-red'
              : 'border-surface bg-surface/50 text-fg-muted hover:border-surface-hover hover:text-white'
          }
        `}
        style={{ minHeight: '80px', minWidth: '80px' }}
      >
        {t('catalog.all')}
      </button>

      {availableCategories.map((cat) => {
        const isActive = filters.category === cat;
        return (
          <button
            key={cat}
            onClick={() => setFilter('category', cat)}
            className={`
              snap-start shrink-0 px-6 font-mono text-sm border transition-all flex items-center justify-center
              clip-hud
              ${
                isActive
                  ? 'bg-brand-red/20 border-brand-red text-white glow-red'
                  : 'border-surface bg-surface/50 text-fg-muted hover:border-surface-hover hover:text-white'
              }
            `}
            style={{ minHeight: '80px', minWidth: '80px' }}
          >
            {t(`catalog.${cat}`, cat)}
          </button>
        );
      })}
    </div>
  );
}
