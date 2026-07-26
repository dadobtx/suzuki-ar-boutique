import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
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
import { Camera as CameraIcon, RefreshCw, Sparkles, X as XIcon } from 'lucide-react';
import { PhotoCountdown, KioskGuide } from '@/components/kiosk';
import { LiveTryOnManager } from '@/lib/liveTryon';
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

  // Profile state
  const resetProfile = useSizingStore((s) => s.reset);
  const hasProfile = useSizingStore((s) => s.hasProfile);
  const sessionId = useSizingStore((s) => s.sessionId);

  useKioskPresenceSync(presence, hasProfile);

  // Reset sizing profile when user leaves
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

  const isLiveTryOnEnabled = import.meta.env.VITE_LIVE_TRYON === 'on';
  const showLiveButton =
    isLiveTryOnEnabled && activeGarment?.category === 'top' && garmentActiveWithProfile;

  const [liveManager, setLiveManager] = useState<LiveTryOnManager | null>(null);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [liveCountdown, setLiveCountdown] = useState<number | null>(null);
  const [liveToast, setLiveToast] = useState<string | null>(null);
  const [isLiveLoading, setIsLiveLoading] = useState(false);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const sessionStartTimeRef = useRef<number>(0);

  const handleStopLiveTryon = useCallback(() => {
    if (liveManager) {
      liveManager.stop();
    }
    setLiveManager(null);
    setIsLiveActive(false);
    setLiveStream(null);
    setLiveCountdown(null);
    setIsLiveLoading(false);
  }, [liveManager]);

  useEffect(() => {
    if (isLiveActive && presence === 'absent') {
      handleStopLiveTryon();
    }
  }, [presence, isLiveActive, handleStopLiveTryon]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isLiveActive) {
        handleStopLiveTryon();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isLiveActive, handleStopLiveTryon]);

  useEffect(() => {
    return () => {
      if (liveManager) liveManager.stop();
    };
  }, [liveManager]);

  useEffect(() => {
    if (isLiveActive && liveManager && activeGarment) {
      liveManager.sendGarment(activeGarment.sku);
    }
  }, [activeGarment, isLiveActive, liveManager]);

  useEffect(() => {
    if (!isLiveActive || liveCountdown === null || liveCountdown <= 0) return;
    const timer = setTimeout(() => {
      if (liveCountdown - 1 <= 0) {
        handleStopLiveTryon();
      } else {
        setLiveCountdown(liveCountdown - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [isLiveActive, liveCountdown, handleStopLiveTryon]);

  useEffect(() => {
    if (isLiveActive && liveStream && liveVideoRef.current) {
      liveVideoRef.current.srcObject = liveStream;
    }
  }, [isLiveActive, liveStream]);

  const handleStartLiveTryon = useCallback(async () => {
    if (!activeGarment || !camera.videoRef.current?.srcObject || !sessionId) return;
    setIsLiveLoading(true);

    try {
      const BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8787';
      const event =
        new URLSearchParams(window.location.search).get('event') || 'default-event';

      const res = await fetch(`${BACKEND_URL}/live/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          sku: activeGarment.sku,
          event,
        }),
      });

      const data = await res.json();
      if (res.status === 429) {
        const msg =
          data.limit === 'user'
            ? 'Ya usaste tus 3 pruebas en vivo'
            : 'Prueba en vivo no disponible por hoy';
        setLiveToast(msg);
        setTimeout(() => setLiveToast(null), 3000);
        setIsLiveLoading(false);
        return;
      }

      if (data.status !== 'success') {
        throw new Error(data.error || 'Token error');
      }

      const stream = camera.videoRef.current.srcObject as MediaStream;

      const manager = new LiveTryOnManager({
        token: data.token,
        maxSeconds: data.max_seconds,
        liveId: data.live_id,
        stream,
        sku: activeGarment.sku,
        onUpdate: (remoteStream) => {
          sessionStartTimeRef.current = Date.now();
          setLiveStream(remoteStream);
          setIsLiveActive(true);
          setIsLiveLoading(false);
          setLiveCountdown(data.max_seconds);

          fetch(`${BACKEND_URL}/kiosk/interactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionId,
              sku: activeGarment.sku,
              accion: 'live_tryon',
              tabla_origen_id: activeGarment.sku,
            }),
          }).catch(() => {});
        },
        onError: (err) => {
          console.error(err);
          handleStopLiveTryon();
        },
        onClose: () => {
          const elapsedSeconds = Math.floor(
            (Date.now() - sessionStartTimeRef.current) / 1000,
          );
          fetch(`${BACKEND_URL}/live/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              live_id: data.live_id,
              seconds: Math.max(0, Math.min(elapsedSeconds, data.max_seconds)),
            }),
          }).catch(() => {});
        },
      });

      setLiveManager(manager);
      await manager.start();
    } catch (err) {
      console.error(err);
      setIsLiveLoading(false);
      setLiveToast('Error al iniciar prueba en vivo');
      setTimeout(() => setLiveToast(null), 3000);
    }
  }, [activeGarment, camera, sessionId, handleStopLiveTryon]);

  return (
    <div
      className={
        !isActive
          ? 'block h-screen w-full'
          : isPortrait
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
          active={garmentActiveWithProfile && !isLiveActive}
        />

        {/* Live Try-On Video Overlay (z-index 15) */}
        {isLiveActive && (
          <div className="absolute inset-0 z-15 bg-black" style={{ zIndex: 15 }}>
            <video
              ref={liveVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            <button
              onClick={handleStopLiveTryon}
              className="absolute bottom-8 right-8 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full font-bold shadow-lg flex items-center gap-2"
            >
              <XIcon size={20} /> Salir
            </button>
          </div>
        )}

        {/* Toast Notification (z-index 60) */}
        {liveToast && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg z-50 transition-opacity">
            {liveToast}
          </div>
        )}

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

        {/* Shoot Photo & Live Tryon Buttons (z-index 40) */}
        {garmentActiveWithProfile && activeGarment && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center justify-center gap-8 z-40">
            {!isLiveActive && (
              <button
                onClick={() => transition('PHOTO_COUNTDOWN')}
                className="w-[120px] h-[120px] rounded-full bg-brand-red flex flex-col items-center justify-center text-white shadow-[0_0_30px_rgba(230,0,18,0.6)] hover:scale-105 active:scale-95 transition-transform border-4 border-white/20"
              >
                <CameraIcon size={48} />
                <span className="font-display tracking-widest text-sm mt-1 uppercase">
                  {t('photo.shoot', 'DISPARAR')}
                </span>
              </button>
            )}

            {showLiveButton && (
              <button
                onClick={handleStartLiveTryon}
                disabled={isLiveLoading || isLiveActive}
                className={`w-[120px] h-[120px] rounded-full bg-purple-600 flex flex-col items-center justify-center text-white shadow-[0_0_30px_rgba(147,51,234,0.6)] transition-transform border-4 border-white/20 ${
                  isLiveLoading
                    ? 'opacity-50 cursor-not-allowed'
                    : isLiveActive
                      ? 'cursor-default scale-100'
                      : 'hover:scale-105 active:scale-95'
                }`}
              >
                {isLiveActive ? (
                  <span className="text-5xl font-display">{liveCountdown}</span>
                ) : (
                  <>
                    <Sparkles size={40} className={isLiveLoading ? 'animate-spin' : ''} />
                    <span className="font-display tracking-widest text-xs mt-2 uppercase text-center leading-tight">
                      {isLiveLoading ? (
                        'CARGANDO...'
                      ) : (
                        <>
                          VERME
                          <br />
                          EN VIVO
                        </>
                      )}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
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
        {!hasProfile && presence !== 'absent' && <SizingOnboardingModal />}

        {/* Ocultar la cámara durante ATTRACT y el Onboarding Modal (z-index 55) */}
        {(!hasProfile || kioskState === 'ATTRACT') && (
          <div className="absolute inset-0 bg-zinc-950 z-[55]" />
        )}

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

      {/* ── Catalog area ── */}
      {isActive && (
        <div className="relative bg-zinc-950 z-40 border-l border-white/10 overflow-hidden">
          <CatalogPanel />
        </div>
      )}
    </div>
  );
}
