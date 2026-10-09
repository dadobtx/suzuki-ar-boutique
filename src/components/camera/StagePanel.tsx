import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogPanel } from '@/components/catalog';
import { SizingOnboardingPanel } from '@/components/SizingOnboarding';
import { AttractPanel } from '@/components/kiosk';
import { RackPanel } from '@/components/rack';
import { useSelectionUi } from '@/hooks/useSelectionUi';
import { useGarmentStore } from '@/store/garment';
import { useSizingStore } from '@/store/sizing';
import { recomendarTallaGarment, resolverTallaElegida } from '@/lib/sizing';
import type { KioskState } from '@/store/kiosk';
import type { PresenceState } from '@/hooks/usePresence';

interface StagePanelProps {
  kioskState: KioskState;
  hasProfile: boolean;
  presence: PresenceState;
  isLiveActive?: boolean;
}

export function StagePanel({
  kioskState,
  hasProfile,
  presence,
  isLiveActive = false,
}: StagePanelProps) {
  const { t } = useTranslation();
  const { effectiveSelectionUi } = useSelectionUi();
  const isPerchero = effectiveSelectionUi === 'perchero';
  const catalogRef = useRef<HTMLDivElement>(null);
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const catalog = useGarmentStore((s) => s.catalog);
  const activeGarment = catalog.find((g) => g.id === activeGarmentId);

  // Sizing info
  const profile = useSizingStore();
  const chosenSize = activeGarment
    ? resolverTallaElegida(
        profile,
        activeGarment,
        recomendarTallaGarment(profile, activeGarment).recomendada,
      )
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
          <SizingOnboardingPanel />
        </div>
      )}

      {/* 2. AttractPanel */}
      {activeView === 'attract' && (
        <div data-testid="panel-attract" className="w-full h-full bg-surface">
          {isPerchero ? <RackPanel mode="attract" /> : <AttractPanel />}
        </div>
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
              {(() => {
                const baseUrl = import.meta.env.BASE_URL;
                const src = activeGarment.thumbnailUrl || activeGarment.overlayUrl;
                const imageUrl = src ? `${baseUrl}${src.replace(/^\//, '')}` : '';

                return (
                  imageUrl && (
                    <img
                      src={imageUrl}
                      alt={activeGarment.name}
                      className="w-32 h-32 object-contain rounded-lg bg-surface-2 p-2 border border-white/10"
                    />
                  )
                );
              })()}
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
        {isPerchero ? (
          <RackPanel
            mode="interactive"
            active={isCatalogVisible}
            isLiveActive={isLiveActive}
          />
        ) : (
          <CatalogPanel />
        )}
      </div>
    </div>
  );
}
