import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
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
    <div
      className="flex w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide py-2 px-4 gap-3 select-none"
      style={{
        maskImage:
          'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
      }}
    >
      <button
        type="button"
        onClick={() => setFilter('category', null)}
        className={`
          snap-start shrink-0 px-6 font-mono text-sm border transition-all flex items-center justify-center cursor-pointer
          clip-hud
          ${
            filters.category === null
              ? 'border-2 border-fg text-fg bg-surface-2'
              : 'border-line bg-surface/50 text-fg-muted hover:border-fg-muted hover:text-white'
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
            type="button"
            onClick={() => setFilter('category', cat)}
            className={`
              snap-start shrink-0 px-6 font-mono text-sm border transition-all flex items-center justify-center cursor-pointer
              clip-hud
              ${
                isActive
                  ? 'border-2 border-fg text-fg bg-surface-2'
                  : 'border-line bg-surface/50 text-fg-muted hover:border-fg-muted hover:text-white'
              }
            `}
            style={{ minHeight: '80px', minWidth: '80px' }}
          >
            {t(`catalog.${cat}`, cat)}
          </button>
        );
      })}

      {/* Control único FILTRAR al final de los chips */}
      <button
        type="button"
        onClick={() => {
          // Si hay categoría o filtros activos, los alterna
          if (filters.category !== null) {
            setFilter('category', null);
          }
        }}
        className={`
          snap-start shrink-0 px-6 font-mono text-sm border transition-all flex items-center justify-center gap-2 cursor-pointer
          clip-hud border-line bg-surface-2 text-fg-muted hover:border-fg-muted hover:text-white
        `}
        style={{ minHeight: '80px', minWidth: '80px' }}
      >
        <SlidersHorizontal className="w-5 h-5 text-brand-red" />
        {t('catalog.filter', 'FILTRAR')}
      </button>
    </div>
  );
}
