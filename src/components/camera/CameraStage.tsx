import { useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCamera } from '@/hooks/useCamera';
import { useLayout } from '@/hooks/useLayout';
import { useDprCanvas } from '@/hooks/useDprCanvas';
import { useFps } from '@/hooks/useFps';
import { usePose } from '@/hooks/usePose';
import { usePresence } from '@/hooks/usePresence';
import { useGarmentStore } from '@/store/garment';
import { CameraView } from './CameraView';
import { HudCorners } from '@/components/hud';
import { PoseDebug } from '@/components/ar/PoseDebug';
import { GarmentOverlay } from '@/components/ar/GarmentOverlay';
import { CatalogPanel } from '@/components/catalog';
import { useKioskPresenceSync } from '@/hooks/useKioskPresenceSync';
import { useKioskStore } from '@/store/kiosk';
import { Camera as CameraIcon, RefreshCw } from 'lucide-react';
import { PhotoCountdown, KioskGuide } from '@/components/kiosk';
import { SizingOnboardingModal } from '@/components/SizingOnboarding';
import { SizingControls } from './SizingControls';
import { useSizingStore } from '@/store/sizing';

/**
 * Camera stage: video + garment overlay + pose debug + catalog placeholder.
 *
 * Layout modes:
 *   landscape: grid-cols [70% video | 30% catalog]
 *   portrait:  grid-rows [65% video center-cropped | 35% catalog]
 */
export function CameraStage({ isActive = true }: { isActive?: boolean }) {
  const { t } = useTranslation();
  const { layout } = useLayout();
  const camera = useCamera();

  // Canvas overlay refs (for PoseDebug skeleton)
  const overlayContainerRef = useRef<HTMLElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hook up DPR-aware canvas (for skeleton debug)
  useDprCanvas(overlayCanvasRef, overlayContainerRef);

  // Measure real video FPS via requestVideoFrameCallback
  const { fps } = useFps(camera.videoRef);

  // Phase 3: Pose & Presence
  const pose = usePose(camera.videoRef);
  const presence = usePresence(pose.landmarks);
  useKioskPresenceSync(presence);

  // Reset sizing profile when user leaves
  const resetProfile = useSizingStore((s) => s.reset);
  const hasProfile = useSizingStore((s) => s.hasProfile);
  useEffect(() => {
    if (presence === 'absent') {
      resetProfile();
    }
  }, [presence, resetProfile]);

  const transition = useKioskStore((s) => s.transition);
  const kioskState = useKioskStore((s) => s.state);

  // Phase 4: Garment catalog
  const loadCatalog = useGarmentStore((s) => s.loadCatalog);
  const catalog = useGarmentStore((s) => s.catalog);
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const selectGarment = useGarmentStore((s) => s.selectGarment);
  const clearGarment = useGarmentStore((s) => s.clearGarment);

  // Load catalog on mount
  useEffect(() => {
    if (catalog.length === 0) {
      loadCatalog();
    }
  }, [catalog.length, loadCatalog]);

  // Dev drawer visibility
  const showDevDrawer = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('dev') === '1';
  }, []);

  // Active garment SKU
  const activeGarment = catalog.find((g) => g.id === activeGarmentId);
  const activeIndex = activeGarment ? catalog.indexOf(activeGarment) : -1;

  const handlePrev = () => {
    if (catalog.length === 0) return;
    const idx = activeIndex <= 0 ? catalog.length - 1 : activeIndex - 1;
    const garment = catalog[idx];
    if (garment) selectGarment(garment.id);
  };

  const handleNext = () => {
    if (catalog.length === 0) return;
    const idx = activeIndex >= catalog.length - 1 ? 0 : activeIndex + 1;
    const garment = catalog[idx];
    if (garment) selectGarment(garment.id);
  };

  const handleRandom = () => {
    if (catalog.length === 0) return;
    const idx = Math.floor(Math.random() * catalog.length);
    const garment = catalog[idx];
    if (garment) selectGarment(garment.id);
  };

  const isPortrait = layout === 'portrait';
  const garmentActive = isActive && camera.status === 'granted' && presence === 'present';

  // Presence Badge Color
  const presenceColors: Record<string, string> = {
    absent: 'text-brand-red bg-brand-red/10',
    arriving: 'text-accent-yellow bg-accent-yellow/10 animate-pulse',
    present: 'text-accent-green bg-accent-green/10',
    leaving: 'text-accent-yellow bg-accent-yellow/10 animate-pulse',
  };
  const badgeColor = presenceColors[presence] || 'text-fg-muted bg-surface/50';

  // Only allow garment interaction if they have a profile
  const garmentActiveWithProfile = garmentActive && hasProfile;

  return (
    <div
      className={
        isPortrait
          ? 'grid grid-rows-[65fr_35fr] h-screen w-full'
          : 'grid grid-cols-[7fr_3fr] h-screen w-full'
      }
    >
      {/* ── Video area ── */}
      <div
        className="relative overflow-hidden bg-bg"
        ref={(el) => {
          overlayContainerRef.current = el;
        }}
      >
        <CameraView
          videoRef={camera.videoRef}
          status={camera.status}
          error={camera.error}
          retry={camera.retry}
          objectFit={isPortrait ? 'cover' : 'contain'}
        />

        {/* Garment Overlay (z-index 10) */}
        <GarmentOverlay
          videoRef={camera.videoRef}
          containerRef={overlayContainerRef}
          landmarks={pose.landmarks}
          mask={pose.mask}
          layout={layout}
          active={garmentActiveWithProfile}
        />

        {/* Skeleton debug overlay canvas (z-index 20) */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 20 }}
          aria-hidden="true"
        />

        {/* Pose Debug Drawer (z-index 20, draws on skeleton canvas) */}
        <PoseDebug
          canvasRef={overlayCanvasRef}
          videoRef={camera.videoRef}
          landmarks={pose.landmarks}
          mask={pose.mask}
          layout={layout}
        />

        {/* HUD corners on the video area (z-index 30) */}
        <div className="absolute inset-0 pointer-events-none p-2" style={{ zIndex: 30 }}>
          <HudCorners variant="cyan" />
        </div>

        {/* Presence HUD (z-index 30) */}
        {camera.status === 'granted' && (
          <div
            className="absolute top-4 right-4 pointer-events-none"
            style={{ zIndex: 30 }}
          >
            <div
              className={`font-mono text-xs px-3 py-1.5 rounded-full border border-current ${badgeColor}`}
            >
              PRESENCE: {t(`presence.${presence}`, presence.toUpperCase())}
            </div>
          </div>
        )}

        {/* Context-aware user guidance banner (z-index 35) */}
        {camera.status === 'granted' && (
          <KioskGuide presence={presence} layout={layout} />
        )}

        {/* Resolution badge (dev info, z-index 30) */}
        {camera.status === 'granted' && camera.settings && (
          <div
            className="absolute bottom-2 left-2 font-mono text-hud-xs text-accent-cyan/60 bg-bg/60 px-2 py-0.5 rounded"
            style={{ zIndex: 30 }}
          >
            {camera.settings.width}×{camera.settings.height} @{' '}
            {camera.settings.frameRate?.toFixed(0) ?? '?'}fps
            {fps !== null && ` · ${fps} actual`}
          </div>
        )}

        {/* Dev Drawer — only with ?dev=1 (z-index 40) */}
        {showDevDrawer && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-bg/80 backdrop-blur-sm rounded-full border border-accent-cyan/30"
            style={{ zIndex: 40 }}
          >
            <button
              onClick={handlePrev}
              className="font-mono text-xs text-accent-cyan hover:text-white transition-colors px-2 py-1"
            >
              ◀ Prev
            </button>
            <span className="font-mono text-xs text-fg-muted min-w-[100px] text-center">
              {activeGarment?.sku ?? 'None'}
            </span>
            <button
              onClick={handleRandom}
              className="font-mono text-xs text-accent-yellow hover:text-white transition-colors px-2 py-1"
            >
              Random
            </button>
            <button
              onClick={handleNext}
              className="font-mono text-xs text-accent-cyan hover:text-white transition-colors px-2 py-1"
            >
              Next ▶
            </button>
            <button
              onClick={clearGarment}
              className="font-mono text-xs text-brand-red hover:text-white transition-colors px-2 py-1"
            >
              ✗ Clear
            </button>
          </div>
        )}

        {/* Shoot Photo Button (z-index 40) */}
        {garmentActiveWithProfile && (
          <button
            onClick={() => transition('PHOTO_COUNTDOWN')}
            className="absolute bottom-12 left-1/2 -translate-x-1/2 w-[120px] h-[120px] rounded-full bg-brand-red flex flex-col items-center justify-center text-white shadow-[0_0_30px_rgba(230,0,18,0.6)] hover:scale-105 active:scale-95 transition-transform z-40 border-4 border-white/20"
          >
            <CameraIcon size={48} />
            <span className="font-display tracking-widest text-sm mt-1 uppercase">
              {t('photo.shoot', 'DISPARAR')}
            </span>
          </button>
        )}

        {/* Photo Countdown Overlay (z-index 50) */}
        {kioskState === 'PHOTO_COUNTDOWN' && (
          <PhotoCountdown
            videoRef={camera.videoRef}
            overlayCanvasRef={overlayCanvasRef}
          />
        )}

        {/* Sizing Controls HUD (z-index 40) */}
        {garmentActiveWithProfile && <SizingControls pose={pose} />}

        {/* Sizing Onboarding Modal (z-index 60) */}
        {!hasProfile && <SizingOnboardingModal />}

        {/* Manual Reset Button (z-index 40) */}
        {kioskState === 'TRYON' && hasProfile && (
          <button
            onClick={() => resetProfile()}
            className="absolute top-4 left-4 flex items-center gap-2 px-4 py-2 bg-black/50 backdrop-blur rounded-full text-white hover:bg-black/80 transition-colors z-40 border border-zinc-700"
          >
            <RefreshCw size={16} />
            <span className="font-bold text-sm">Nuevo usuario</span>
          </button>
        )}
      </div>

      {/* ── Catalog Panel ── */}
      <div className="bg-surface flex items-center justify-center overflow-hidden">
        {isActive && <CatalogPanel />}
      </div>
    </div>
  );
}
