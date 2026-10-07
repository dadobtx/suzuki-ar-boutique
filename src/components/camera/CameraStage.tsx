import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCamera } from '@/hooks/useCamera';
import { useLayout } from '@/hooks/useLayout';
import { useDprCanvas } from '@/hooks/useDprCanvas';
import { useFps } from '@/hooks/useFps';
import { usePose } from '@/hooks/usePose';
import { usePresence, type PresenceState } from '@/hooks/usePresence';
import { useGarmentStore } from '@/store/garment';
import { CameraView } from './CameraView';
import { HudCorners } from '@/components/hud';
import { PoseDebug } from '@/components/ar/PoseDebug';
import { GarmentOverlay } from '@/components/ar/GarmentOverlay';
import { useKioskPresenceSync } from '@/hooks/useKioskPresenceSync';
import { useKioskStore } from '@/store/kiosk';
import { Camera as CameraIcon, Sparkles, X as XIcon, AlertCircle } from 'lucide-react';
import {
  PhotoCountdown,
  KioskGuide,
  AttractLoop,
  AwakeningSplash,
  CalibrationGuide,
} from '@/components/kiosk';
import { LiveTryOnManager } from '@/lib/liveTryon';
import { StagePanel } from './StagePanel';
import { SizingControls } from './SizingControls';
import { VariantControls } from './VariantControls';
import { useHandCursor } from '@/hooks/useHandCursor';
import { HandCursor } from '@/components/hand';
import { useSizingStore } from '@/store/sizing';
import { resolveGarmentAssets } from '@/lib/garment-assets';
import { recomendarTallaGarment, resolverTallaElegida } from '@/lib/sizing';
import { isOperatorMode } from '@/lib/debug-mode';
import {
  computeFramingMetrics,
  FramingHysteresis,
  type FramingState,
} from '@/lib/body-framing';
import { usePwaAutoUpdate, usePwaStore } from '@/lib/pwa-update';

const PUBLIC_ASSETS_BASE =
  import.meta.env.VITE_PUBLIC_ASSETS_BASE ||
  'https://dadobtx.github.io/suzuki-ar-boutique/';

const SIDE_TOP = 'top-32'; // 128 px: deja libre la guía (máx. ~115 px de alto)

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
  const detectedPresence = usePresence(pose.landmarks, pose.frameId);
  const [presenceOverride, setPresenceOverride] = useState<PresenceState | null>(
    (typeof window !== 'undefined' &&
      (window as unknown as { __presenceOverride?: PresenceState }).__presenceOverride) ||
      null,
  );
  const presence = presenceOverride || detectedPresence;

  const [landmarksOverride, setLandmarksOverride] = useState<
    typeof pose.landmarks | null
  >(
    (typeof window !== 'undefined' &&
      (window as unknown as { __landmarksOverride?: typeof pose.landmarks })
        .__landmarksOverride) ||
      null,
  );

  const [activeZoneOverride, setActiveZoneOverride] = useState<
    typeof pose.activeZone | null
  >(
    (typeof window !== 'undefined' &&
      (window as unknown as { __activeZoneOverride?: typeof pose.activeZone })
        .__activeZoneOverride) ||
      null,
  );

  useEffect(() => {
    const handleUpdate = () => {
      const override = (
        window as unknown as { __landmarksOverride?: UsePoseResult['landmarks'] }
      ).__landmarksOverride;
      if (override) {
        setLandmarksOverride(override);
      }
    };
    const handleZoneUpdate = () => {
      const override = (
        window as unknown as { __activeZoneOverride?: UsePoseResult['activeZone'] }
      ).__activeZoneOverride;
      if (override) {
        setActiveZoneOverride(override);
      }
    };
    const handlePresenceUpdate = () => {
      const override = (window as unknown as { __presenceOverride?: PresenceState })
        .__presenceOverride;
      if (override) {
        setPresenceOverride(override);
      }
    };
    window.addEventListener('kiosk-landmarks', handleUpdate);
    window.addEventListener('kiosk-active-zone', handleZoneUpdate);
    window.addEventListener('kiosk-presence', handlePresenceUpdate);
    return () => {
      window.removeEventListener('kiosk-landmarks', handleUpdate);
      window.removeEventListener('kiosk-active-zone', handleZoneUpdate);
      window.removeEventListener('kiosk-presence', handlePresenceUpdate);
    };
  }, []);

  const effectiveActiveZone = activeZoneOverride || pose.activeZone;

  const effectiveLandmarks = landmarksOverride || pose.landmarks;

  // Body framing metrics & 1000ms hysteresis
  const framingMetrics = useMemo(
    () => computeFramingMetrics(effectiveLandmarks),
    [effectiveLandmarks],
  );
  const hysteresisRef = useRef<FramingHysteresis>(new FramingHysteresis(1000));
  const [sustainedFraming, setSustainedFraming] = useState<FramingState>('ok');

  useEffect(() => {
    if (presence === 'absent') {
      hysteresisRef.current.reset('ok');
      setSustainedFraming('ok');
      return;
    }
    const updated = hysteresisRef.current.update(
      framingMetrics.framing,
      performance.now(),
    );
    setSustainedFraming(updated);
  }, [framingMetrics.framing, pose.frameId, presence]);

  useEffect(() => {
    if (framingMetrics.framing === sustainedFraming) return;
    const timer = setTimeout(() => {
      const updated = hysteresisRef.current.update(
        framingMetrics.framing,
        performance.now(),
      );
      setSustainedFraming(updated);
    }, 1000);
    return () => clearTimeout(timer);
  }, [framingMetrics.framing, sustainedFraming]);

  // Profile state
  const resetProfile = useSizingStore((s) => s.reset);
  const hasProfile = useSizingStore((s) => s.hasProfile);
  const sessionId = useSizingStore((s) => s.sessionId);
  const sizingProfile = useSizingStore();

  useKioskPresenceSync(presence, hasProfile);
  usePwaAutoUpdate(presence);
  const updatePending = usePwaStore((s) => s.updatePending);

  // Reset sizing profile when user leaves
  useEffect(() => {
    if (presence === 'absent') {
      resetProfile();
    }
  }, [presence, resetProfile]);

  const transition = useKioskStore((s) => s.transition);
  const kioskState = useKioskStore((s) => s.state);

  const isCatalogVisible =
    hasProfile &&
    kioskState !== 'ATTRACT' &&
    kioskState !== 'AWAKENING' &&
    kioskState !== 'CALIBRATING' &&
    kioskState !== 'PHOTO_COUNTDOWN';

  const { handleMirrorPointerMove, handleMirrorPointerLeave } = useHandCursor(
    camera.videoRef,
    pose,
    { active: isCatalogVisible },
  );

  // Phase 4: Garment catalog
  const loadCatalog = useGarmentStore((s) => s.loadCatalog);
  const catalog = useGarmentStore((s) => s.catalog);
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const activeVariantId = useGarmentStore((s) => s.activeVariantId);
  const selectGarment = useGarmentStore((s) => s.selectGarment);
  const clearGarment = useGarmentStore((s) => s.clearGarment);

  // Load catalog on mount
  useEffect(() => {
    if (catalog.length === 0) {
      loadCatalog();
    }
  }, [catalog.length, loadCatalog]);

  // Dev drawer visibility (operator mode only)
  const showDevDrawer = useMemo(() => {
    return isOperatorMode();
  }, []);

  // Active garment SKU
  const activeGarment = catalog.find((g) => g.id === activeGarmentId);
  const activeIndex = activeGarment ? catalog.indexOf(activeGarment) : -1;

  const tallaResuelta = useMemo(() => {
    if (!activeGarment) return null;
    const { recomendada } = recomendarTallaGarment(sizingProfile, activeGarment);
    return resolverTallaElegida(sizingProfile, activeGarment, recomendada);
  }, [sizingProfile, activeGarment]);

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
      const assets = resolveGarmentAssets(activeGarment, activeVariantId);
      const referenceImageUrl = new URL(
        assets.overlayUrl.replace(/^\//, ''),
        PUBLIC_ASSETS_BASE,
      ).href;
      liveManager.sendGarment(referenceImageUrl);
    }
  }, [activeGarment, activeVariantId, isLiveActive, liveManager]);

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
            ? t('live.userLimit', 'Ya usaste tus 3 pruebas en vivo')
            : t('live.dayLimit', 'Prueba en vivo no disponible por hoy');
        setLiveToast(msg);
        setTimeout(() => setLiveToast(null), 3000);
        setIsLiveLoading(false);
        return;
      }

      if (data.status !== 'success') {
        throw new Error(data.error || 'Token error');
      }

      const stream = camera.videoRef.current.srcObject as MediaStream;

      const assets = resolveGarmentAssets(activeGarment, activeVariantId);
      const referenceImageUrl = new URL(
        assets.overlayUrl.replace(/^\//, ''),
        PUBLIC_ASSETS_BASE,
      ).href;

      const manager = new LiveTryOnManager({
        token: data.token,
        maxSeconds: data.max_seconds,
        liveId: data.live_id,
        stream,
        referenceImageUrl,
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
      setLiveToast(
        t('live.error', 'No pudimos iniciar la prueba en vivo. Intenta otra vez.'),
      );
      setTimeout(() => setLiveToast(null), 3000);
    }
  }, [activeGarment, activeVariantId, camera, sessionId, handleStopLiveTryon, t]);

  return (
    <div
      className={
        isPortrait
          ? 'grid grid-rows-[65fr_35fr] h-screen w-full'
          : 'grid grid-cols-[7fr_3fr] h-screen w-full'
      }
    >
      {/* ── Video area (mirror) ── */}
      <div
        data-stage="mirror"
        className="relative overflow-hidden bg-bg min-h-0 min-w-0"
        ref={(el) => {
          overlayContainerRef.current = el;
        }}
        onPointerMove={handleMirrorPointerMove}
        onPointerLeave={handleMirrorPointerLeave}
      >
        <CameraView
          videoRef={camera.videoRef}
          status={camera.status}
          error={camera.error}
          retry={camera.retry}
          objectFit={isPortrait ? 'cover' : 'contain'}
          fog={kioskState === 'ATTRACT' && presence === 'absent'}
        />

        {/* Attract Loop (headline in mirror cell only when absent) */}
        {kioskState === 'ATTRACT' && presence === 'absent' && (
          <AttractLoop approaching={effectiveActiveZone?.approaching} />
        )}

        {/* Awakening & Calibration mirror overlays */}
        {kioskState === 'AWAKENING' && <AwakeningSplash />}
        {kioskState === 'CALIBRATING' && <CalibrationGuide />}

        {/* Garment Overlay (z-index 10) */}
        <GarmentOverlay
          videoRef={camera.videoRef}
          containerRef={overlayContainerRef}
          landmarks={pose.landmarks}
          mask={pose.mask}
          layout={layout}
          active={garmentActiveWithProfile && !isLiveActive && !isLiveLoading}
          presence={presence}
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
              className="absolute bottom-8 right-8 px-8 py-4 min-h-[64px] bg-brand-red hover:bg-brand-red/90 text-white rounded-full font-bold shadow-lg flex items-center gap-2 text-xl"
            >
              <XIcon size={24} /> Salir
            </button>
          </div>
        )}

        {/* Toast Notification (z-index 60) */}
        {liveToast && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-surface border border-line text-fg px-8 py-4 rounded-xl font-bold shadow-lg z-50 transition-opacity text-xl flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-brand-red shrink-0" />
            <span>{liveToast}</span>
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
          landmarks={effectiveLandmarks}
          mask={pose.mask}
          layout={layout}
          activeZone={effectiveActiveZone}
        />

        {/* HUD corners on the video area (z-index 30) */}
        {kioskState !== 'PHOTO_COUNTDOWN' && (
          <div
            className="absolute inset-0 pointer-events-none p-2"
            style={{ zIndex: 30 }}
          >
            <HudCorners variant="cyan" />
          </div>
        )}

        {/* Presence HUD (z-index 30, only in operator mode) */}
        {isOperatorMode() &&
          camera.status === 'granted' &&
          kioskState !== 'PHOTO_COUNTDOWN' && (
            <div
              className="absolute top-4 left-4 pointer-events-none"
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
          <KioskGuide
            presence={presence}
            layout={layout}
            framing={sustainedFraming}
            showLiveButton={showLiveButton}
          />
        )}

        {/* Hand Cursor (z-index 40) */}
        <HandCursor />

        {/* Garment Plaque (left mirror) */}
        {(kioskState === 'TRYON' || kioskState === 'PHOTO_COUNTDOWN') &&
          activeGarment &&
          tallaResuelta && (
            <div
              className={`absolute left-6 ${SIDE_TOP} z-30 pointer-events-none flex items-center bg-surface/85 backdrop-blur-md px-5 py-2.5 border border-line clip-hud max-w-[55%] shadow-lg`}
            >
              <span className="font-display text-[32px] uppercase leading-tight line-clamp-2 text-fg">
                {activeGarment.name} · TALLA {tallaResuelta}
              </span>
            </div>
          )}

        {/* Resolution & framing badge (dev info, z-index 30, only in operator mode) */}
        {isOperatorMode() && kioskState !== 'PHOTO_COUNTDOWN' && (
          <div
            className="absolute bottom-2 left-2 font-mono text-hud-xs text-accent-cyan/60 bg-bg/60 px-2 py-0.5 rounded flex flex-col gap-0.5 pointer-events-none"
            style={{ zIndex: 30 }}
          >
            {camera.status === 'granted' && camera.settings && (
              <>
                <div>
                  {camera.settings.width}×{camera.settings.height} @{' '}
                  {camera.settings.frameRate?.toFixed(0) ?? '?'}fps
                  {fps !== null && ` · ${fps} actual`}
                </div>
                <div>
                  sw: {framingMetrics.sw !== null ? framingMetrics.sw.toFixed(3) : '—'} ·
                  headTop:{' '}
                  {framingMetrics.headTop !== null
                    ? framingMetrics.headTop.toFixed(3)
                    : '—'}{' '}
                  · {sustainedFraming}
                </div>
              </>
            )}
            <div className="flex items-center gap-1.5 text-zinc-300">
              <span>
                {__GIT_SHA__.slice(0, 7)} · {__BUILD_DATE__}
              </span>
              {updatePending && (
                <span className="text-amber-400 font-bold">actualización pendiente</span>
              )}
            </div>
          </div>
        )}

        {/* Degraded camera indicator: 12px amber dot if height < expected (only in operator mode) */}
        {isOperatorMode() &&
          camera.status === 'granted' &&
          kioskState !== 'PHOTO_COUNTDOWN' &&
          camera.settings &&
          camera.settings.height !== undefined &&
          camera.settings.height <
            Number(import.meta.env.VITE_EXPECTED_CAMERA_HEIGHT || 0) && (
            <div
              className="absolute bottom-3 left-3 w-3 h-3 rounded-full bg-amber-500 pointer-events-none"
              style={{ zIndex: 30 }}
              role="status"
              aria-label="Cámara en resolución reducida"
            />
          )}

        {/* Dev Drawer — only with ?dev=1 (z-index 40) */}
        {showDevDrawer && kioskState === 'TRYON' && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-bg/80 backdrop-blur-sm rounded-full border border-accent-cyan/30"
            style={{ zIndex: 40 }}
          >
            <button
              onClick={handlePrev}
              className="font-mono text-xs text-accent-cyan hover:text-white transition-colors px-3 py-2 min-h-[64px] min-w-[64px] flex items-center justify-center"
            >
              ◀ Prev
            </button>
            <span className="font-mono text-xs text-fg-muted min-w-[100px] text-center">
              {activeGarment?.sku ?? 'None'}
            </span>
            <button
              onClick={handleRandom}
              className="font-mono text-xs text-accent-yellow hover:text-white transition-colors px-3 py-2 min-h-[64px] min-w-[64px] flex items-center justify-center"
            >
              Random
            </button>
            <button
              onClick={handleNext}
              className="font-mono text-xs text-accent-cyan hover:text-white transition-colors px-3 py-2 min-h-[64px] min-w-[64px] flex items-center justify-center"
            >
              Next ▶
            </button>
            <button
              onClick={clearGarment}
              className="font-mono text-xs text-brand-red hover:text-white transition-colors px-3 py-2 min-h-[64px] min-w-[64px] flex items-center justify-center"
            >
              ✗ Clear
            </button>
            <span className="font-mono text-[11px] text-zinc-400 border-l border-zinc-700 pl-2">
              {__GIT_SHA__.slice(0, 7)}
              {updatePending && (
                <span className="text-amber-400 ml-1.5 font-bold">
                  actualización pendiente
                </span>
              )}
            </span>
          </div>
        )}

        {/* Shoot Photo & Live Tryon Buttons (z-index 40) */}
        {garmentActiveWithProfile && activeGarment && kioskState === 'TRYON' && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center justify-center gap-8 z-40">
            {showLiveButton && (
              <button
                type="button"
                onClick={handleStartLiveTryon}
                disabled={isLiveLoading || isLiveActive}
                aria-label={t('live.seeLive', 'VERME EN VIVO')}
                className={`w-[160px] h-[160px] rounded-full bg-fg text-bg border-4 border-fg/30 flex flex-col items-center justify-center shadow-2xl transition-transform ${
                  isLiveLoading
                    ? 'opacity-50 cursor-not-allowed'
                    : isLiveActive
                      ? 'cursor-default scale-100'
                      : 'hover:scale-105 active:scale-95'
                }`}
              >
                {isLiveActive ? (
                  <span className="text-6xl font-display">{liveCountdown}</span>
                ) : (
                  <>
                    <Sparkles
                      size={44}
                      className={`text-brand-red ${isLiveLoading ? 'animate-spin' : ''}`}
                    />
                    <span className="font-display tracking-widest text-lg mt-1 uppercase text-center leading-tight max-w-[130px] text-bg">
                      {isLiveLoading
                        ? t('live.connecting', 'CONECTANDO…')
                        : t('live.seeLive', 'VERME EN VIVO')}
                    </span>
                  </>
                )}
              </button>
            )}

            {!isLiveActive && (
              <button
                type="button"
                onClick={() => transition('PHOTO_COUNTDOWN')}
                className={`w-[144px] h-[144px] rounded-full flex flex-col items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-transform ${
                  showLiveButton
                    ? 'bg-surface/90 border-2 border-fg text-fg'
                    : 'bg-fg text-bg border-4 border-fg/30'
                }`}
              >
                <CameraIcon
                  size={showLiveButton ? 48 : 52}
                  className={showLiveButton ? 'text-fg' : 'text-bg'}
                />
                <span
                  className={`font-display tracking-widest text-lg mt-1 uppercase ${
                    showLiveButton ? 'text-fg' : 'text-bg'
                  }`}
                >
                  {t('photo.shoot', 'DISPARAR')}
                </span>
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

        {/* Unified Right Column (z-index 40) */}
        {garmentActiveWithProfile && activeGarment && kioskState === 'TRYON' && (
          <div
            className={`absolute right-4 ${SIDE_TOP} z-40 flex flex-col gap-3 w-[220px]`}
          >
            {/* Sizing Controls */}
            <SizingControls pose={pose} />

            {/* Variant Controls */}
            <VariantControls />
          </div>
        )}
      </div>

      {/* ── Panel area ── */}
      <div
        data-stage="panel"
        className="relative bg-bg min-h-0 min-w-0 overflow-hidden z-40 border-t md:border-t-0 md:border-l border-white/10"
      >
        <StagePanel kioskState={kioskState} hasProfile={hasProfile} presence={presence} />
      </div>
    </div>
  );
}
