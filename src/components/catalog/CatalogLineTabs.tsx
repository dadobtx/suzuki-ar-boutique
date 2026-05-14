import { useTranslation } from 'react-i18next';
import { useGarmentStore } from '@/store/garment';

const LINES = [
  { id: 'Todas', labelKey: 'catalog.allLines' },
  { id: 'GSX-R', label: 'GSX-R' },
  { id: 'Ecstar', label: 'Ecstar' },
  { id: 'Hayabusa', label: 'Hayabusa' },
  { id: 'Swift Sport', label: 'Swift Sport' },
  { id: 'Jimny', label: 'Jimny' },
  { id: 'Marine', label: 'Marine' },
  { id: 'Lifestyle', label: 'Lifestyle' },
];

export function CatalogLineTabs() {
  const { t } = useTranslation();
  const filters = useGarmentStore((s) => s.filters);
  const setFilter = useGarmentStore((s) => s.setFilter);

  return (
    <div className="flex w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide border-b border-surface/50">
      <div className="flex px-4 min-w-max">
        {LINES.map((line) => {
          const isActive = filters.line === line.id;
          return (
            <button
              key={line.id}
              onClick={() => {
                setFilter('line', line.id);
                setFilter('category', null); // Reset category when line changes
              }}
              className={`
                snap-start shrink-0 relative px-6 font-display text-2xl transition-all flex items-center justify-center
                ${isActive ? 'text-white' : 'text-fg-muted hover:text-white/80'}
              `}
              style={{ minHeight: '80px', minWidth: '80px' }}
            >
              {line.labelKey ? t(line.labelKey) : line.label}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-brand-red glow-red" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
