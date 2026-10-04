import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogPanel } from '@/components/catalog';
import { SizingOnboardingModal } from '@/components/SizingOnboarding';
import { useGarmentStore } from '@/store/garment';
import { useSizingStore } from '@/store/sizing';
import type { KioskState } from '@/store/kiosk';
import type { PresenceState } from '@/hooks/usePresence';

interface StagePanelProps {
  kioskState: KioskState;
  hasProfile: boolean;
  presence: PresenceState;
}

export function StagePanel({ kioskState, hasProfile, presence }: StagePanelProps) {
  const { t } = useTranslation();
  const catalogRef = useRef<HTMLDivElement>(null);
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const catalog = useGarmentStore((s) => s.catalog);
  const activeGarment = catalog.find((g) => g.id === activeGarmentId);

  // Sizing info
  const tallasElegidas = useSizingStore((s) => s.tallasElegidas);
  const chosenSize = activeGarment
    ? (tallasElegidas[activeGarment.sku] ?? activeGarment.sizes?.[0] ?? 'M')
    : null;

  // Determine which panel state is active according to the strict priority:
  // 1. !hasProfile && presence !== 'absent' -> Onboarding de talla
  // 2. kioskState === 'ATTRACT' -> AttractPanel
  // 3. kioskState === 'AWAKENING' || kioskState === 'CALIBRATING' -> StatusPanel
  // 4. kioskState === 'PHOTO_COUNTDOWN' -> CapturePanel
  // 5. Any other state -> CatalogPanel
  let activeView: 'onboarding' | 'attract' | 'status' | 'capture' | 'catalog' = 'catalog';

  if (!hasProfile && presence !== 'absent') {
    activeView = 'onboarding';
  } else if (kioskState === 'ATTRACT') {
    activeView = 'attract';
  } else if (kioskState === 'AWAKENING' || kioskState === 'CALIBRATING') {
    activeView = 'status';
  } else if (kioskState === 'PHOTO_COUNTDOWN') {
    activeView = 'capture';
  } else {
    activeView = 'catalog';
  }

  const isCatalogVisible = activeView === 'catalog';

  // Apply inert without @ts-ignore
  useEffect(() => {
    if (catalogRef.current) {
      catalogRef.current.inert = !isCatalogVisible;
    }
  }, [isCatalogVisible]);

  return (
    <div className="relative w-full h-full min-h-0 min-w-0 bg-bg overflow-hidden">
      {/* 1. Onboarding de talla */}
      {activeView === 'onboarding' && (
        <div
          data-testid="panel-onboarding"
          className="w-full h-full flex items-center justify-center"
        >
          <SizingOnboardingModal />
        </div>
      )}

      {/* 2. AttractPanel (Fase 1: panel vacío con bg-surface) */}
      {activeView === 'attract' && (
        <div
          data-testid="panel-attract"
          className="w-full h-full bg-surface flex items-center justify-center text-fg-muted"
        />
      )}

      {/* 3. StatusPanel: una línea, «MANTENTE EN EL MARCO» */}
      {activeView === 'status' && (
        <div
          data-testid="panel-status"
          className="w-full h-full bg-surface flex flex-col items-center justify-center p-6 text-center"
        >
          <span className="font-display text-4xl text-white tracking-widest uppercase">
            {t('kiosk.calibration.instruction', 'MANTENTE EN EL MARCO')}
          </span>
        </div>
      )}

      {/* 4. CapturePanel: miniatura de la prenda activa, nombre, talla elegida */}
      {activeView === 'capture' && (
        <div
          data-testid="panel-capture"
          className="w-full h-full bg-surface flex flex-col items-center justify-center p-8 text-center gap-4"
        >
          {activeGarment ? (
            <>
              {(activeGarment.thumbnailUrl || activeGarment.overlayUrl) && (
                <img
                  src={activeGarment.thumbnailUrl || activeGarment.overlayUrl}
                  alt={activeGarment.name}
                  className="w-32 h-32 object-contain rounded-lg bg-surface-2 p-2 border border-white/10"
                />
              )}
              <div className="flex flex-col items-center">
                <span className="font-display text-3xl text-white tracking-wider uppercase">
                  {activeGarment.name}
                </span>
                {chosenSize && (
                  <span className="font-mono text-xl text-brand-red font-bold mt-1">
                    TALLA: {chosenSize}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span className="font-display text-2xl text-fg-muted tracking-wider uppercase">
              PRENDA ACTIVA
            </span>
          )}
        </div>
      )}

      {/* 5. CatalogPanel (Montado siempre para conservar scroll y cache de imágenes) */}
      <div
        ref={catalogRef}
        data-testid="panel-catalog"
        className={`w-full h-full transition-opacity ${
          isCatalogVisible
            ? 'opacity-100'
            : 'invisible pointer-events-none opacity-0 absolute inset-0'
        }`}
        aria-hidden={!isCatalogVisible}
      >
        <CatalogPanel />
      </div>
    </div>
  );
}
