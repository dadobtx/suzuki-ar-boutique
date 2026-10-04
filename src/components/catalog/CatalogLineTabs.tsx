import { useTranslation } from 'react-i18next';
import { useGarmentStore } from '@/store/garment';
import { TerminateButton } from './TerminateButton';

// Líneas presentes en public/catalog.json. Mantener sincronizado con el catálogo:
// una pestaña sin prendas se ve como una sección vacía en el kiosko.
const LINES = [
  { id: 'Todas', labelKey: 'catalog.allLines' },
  { id: 'Team Black', label: 'Team Black' },
  { id: 'Team Blue', label: 'Team Blue' },
  { id: 'GSX-R', label: 'GSX-R' },
  { id: 'Jimny', label: 'Jimny' },
  { id: 'Lifestyle', label: 'Lifestyle' },
];

export function CatalogLineTabs() {
  const { t } = useTranslation();
  const filters = useGarmentStore((s) => s.filters);
  const setFilter = useGarmentStore((s) => s.setFilter);

  return (
    <div className="flex w-full items-center justify-between border-b border-line pr-4">
      <div
        className="flex flex-1 overflow-x-auto snap-x snap-mandatory scrollbar-hide select-none"
        style={{
          maskImage:
            'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)',
        }}
      >
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
      <TerminateButton />
    </div>
  );
}
