import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { LiveTryOnManager } from '@/lib/liveTryon';
import { useLiveTryonStore } from '@/store/liveTryon';
import { resolveGarmentAssets } from '@/lib/garment-assets';
import type { Garment } from '@/types/garment';
import type { PresenceState } from '@/hooks/usePresence';
import type { KioskState } from '@/store/kiosk';

const PUBLIC_ASSETS_BASE =
  import.meta.env.VITE_ASSETS_BASE_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

export const LIVE_COOLDOWN_MS = 4000;
export const CONCURRENT_RETRY_DELAY_MS = 5000;

export interface UseLiveTryOnProps {
  activeGarment: Garment | null;
  activeVariantId?: string | null;
  cameraStream: MediaStream | null;
  sessionId: string | null;
  presence: PresenceState;
  kioskState: KioskState;
  garmentActiveWithProfile: boolean;
}

export interface UseLiveTryOnResult {
  isLiveActive: boolean;
  isLiveLoading: boolean;
  isLiveAvailable: boolean;
  liveStream: MediaStream | null;
  liveCountdown: number | null;
  liveToast: string | null;
  liveVideoRef: RefObject<HTMLVideoElement>;
  handleStartLiveTryon: () => Promise<void>;
  handleStopLiveTryon: () => void;
}

export function useLiveTryon({
  activeGarment,
  activeVariantId,
  cameraStream,
  sessionId,
  presence,
  kioskState,
  garmentActiveWithProfile,
}: UseLiveTryOnProps): UseLiveTryOnResult {
  const { t } = useTranslation();

  const isLiveTryOnEnabled = import.meta.env.VITE_LIVE_TRYON === 'on';
  const showLiveButton =
    isLiveTryOnEnabled && activeGarment?.category === 'top' && garmentActiveWithProfile;

  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isLiveLoading, setIsLiveLoading] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [liveCountdown, setLiveCountdown] = useState<number | null>(null);
  const [liveToast, setLiveToast] = useState<string | null>(null);
  const [cooldownRemainingSec, setCooldownRemainingSec] = useState<number>(0);

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const managerRef = useRef<LiveTryOnManager | null>(null);
  const liveStartingRef = useRef<boolean>(false);
  const lastStopMsRef = useRef<number>(0);
  const sessionStartTimeRef = useRef<number>(0);
  const hadVideoRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const lastErrorRef = useRef<string | null>(null);

  // Sincronizar telemetría para DiagnosticOverlay
  const syncTelemetry = useCallback(() => {
    const elapsed = Date.now() - lastStopMsRef.current;
    const remainingMs = Math.max(0, LIVE_COOLDOWN_MS - elapsed);
    const remainingSec = Math.ceil(remainingMs / 1000);

    setCooldownRemainingSec(remainingSec);
    useLiveTryonStore.setState({
      managerState: managerRef.current?.getState() ?? 'idle',
      connectionKey: managerRef.current?.getConnectionKey() ?? null,
      activeCount: LiveTryOnManager.activeCount(),
      cooldownRemainingSec: remainingSec,
      lastError: lastErrorRef.current,
    });
  }, []);

  // Tick de enfriamiento y telemetría
  useEffect(() => {
    syncTelemetry();
    const timer = setInterval(() => {
      syncTelemetry();
    }, 250);
    return () => clearInterval(timer);
  }, [syncTelemetry]);

  // Detener la sesión de manera segura
  const stopInternal = useCallback(
    (isRetryPending = false) => {
      if (managerRef.current) {
        managerRef.current.stop();
        managerRef.current = null;
      }

      setIsLiveActive(false);
      setLiveStream(null);
      setLiveCountdown(null);
      liveStartingRef.current = false;
      lastStopMsRef.current = Date.now();

      if (!isRetryPending) {
        setIsLiveLoading(false);
        retryCountRef.current = 0;
      }
      syncTelemetry();
    },
    [syncTelemetry],
  );

  const handleStopLiveTryon = useCallback(() => {
    stopInternal(false);
  }, [stopInternal]);

  // Limpieza ante fallo
  const cleanupAfterFailure = useCallback(
    (toastKey: 'live.busy' | 'live.error') => {
      stopInternal(false);
      const defaultMsg =
        toastKey === 'live.busy'
          ? 'La prueba en vivo está ocupada. Intenta en unos segundos.'
          : 'No pudimos iniciar la prueba en vivo. Intenta otra vez.';
      setLiveToast(t(toastKey, defaultMsg));
      setTimeout(() => {
        if (isMountedRef.current) {
          setLiveToast(null);
        }
      }, 3000);
    },
    [stopInternal, t],
  );

  // Iniciar sesión
  const startSession = useCallback(async () => {
    if (!activeGarment || !cameraStream || !sessionId) {
      liveStartingRef.current = false;
      setIsLiveLoading(false);
      return;
    }

    setIsLiveLoading(true);
    hadVideoRef.current = false;
    lastErrorRef.current = null;
    syncTelemetry();

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
        liveStartingRef.current = false;
        lastStopMsRef.current = Date.now();
        syncTelemetry();
        return;
      }

      if (data.status !== 'success') {
        throw new Error(data.error || 'Token error');
      }

      const assets = resolveGarmentAssets(activeGarment, activeVariantId);
      const referenceImageUrl = new URL(
        (assets.overlayUrl || '').replace(/^\//, ''),
        PUBLIC_ASSETS_BASE,
      ).href;

      const manager = new LiveTryOnManager({
        token: data.token,
        maxSeconds: data.max_seconds,
        liveId: data.live_id,
        stream: cameraStream,
        referenceImageUrl,
        onUpdate: (remoteStream) => {
          if (!isMountedRef.current) return;
          hadVideoRef.current = true;
          sessionStartTimeRef.current = Date.now();
          setLiveStream(remoteStream);
          setIsLiveActive(true);
          setIsLiveLoading(false);
          liveStartingRef.current = false;
          retryCountRef.current = 0;
          setLiveCountdown(data.max_seconds);
          syncTelemetry();

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
        onError: async (err) => {
          console.error('[live] onError handler:', err);
          lastErrorRef.current = err.message;
          syncTelemetry();

          const isConcurrentError = err.message
            .toLowerCase()
            .includes('concurrent session limit');

          if (isConcurrentError && retryCountRef.current === 0) {
            retryCountRef.current = 1;
            // Detener la sesión fallida (onClose envía failed: true)
            stopInternal(true);
            setIsLiveLoading(true);

            // Esperar 5 s antes de reintentar una sola vez con token nuevo
            await new Promise((resolve) =>
              setTimeout(resolve, CONCURRENT_RETRY_DELAY_MS),
            );

            if (
              isMountedRef.current &&
              kioskState === 'TRYON' &&
              Boolean(activeGarment)
            ) {
              liveStartingRef.current = true;
              void startSession();
            } else {
              cleanupAfterFailure('live.busy');
            }
          } else if (isConcurrentError && retryCountRef.current > 0) {
            cleanupAfterFailure('live.busy');
          } else {
            cleanupAfterFailure('live.error');
          }
        },
        onClose: () => {
          const elapsedSeconds = Math.floor(
            (Date.now() - sessionStartTimeRef.current) / 1000,
          );
          const hadVideo = hadVideoRef.current;
          fetch(`${BACKEND_URL}/live/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              live_id: data.live_id,
              seconds: hadVideo
                ? Math.max(0, Math.min(elapsedSeconds, data.max_seconds))
                : 0,
              failed: !hadVideo,
            }),
          }).catch(() => {});
        },
      });

      managerRef.current = manager;
      syncTelemetry();
      await manager.start();
    } catch (err) {
      console.error('[live] startSession error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      lastErrorRef.current = errMsg;
      syncTelemetry();

      const isConcurrentError = errMsg.toLowerCase().includes('concurrent session limit');
      if (isConcurrentError && retryCountRef.current === 0) {
        retryCountRef.current = 1;
        stopInternal(true);
        setIsLiveLoading(true);

        await new Promise((resolve) => setTimeout(resolve, CONCURRENT_RETRY_DELAY_MS));

        if (isMountedRef.current && kioskState === 'TRYON' && Boolean(activeGarment)) {
          liveStartingRef.current = true;
          void startSession();
        } else {
          cleanupAfterFailure('live.busy');
        }
      } else if (isConcurrentError && retryCountRef.current > 0) {
        cleanupAfterFailure('live.busy');
      } else {
        cleanupAfterFailure('live.error');
      }
    }
  }, [
    activeGarment,
    activeVariantId,
    cameraStream,
    cleanupAfterFailure,
    kioskState,
    sessionId,
    stopInternal,
    syncTelemetry,
    t,
  ]);

  const handleStartLiveTryon = useCallback(async () => {
    // Candado liveStartingRef y condiciones de enfriamiento/disponibilidad
    if (liveStartingRef.current || isLiveLoading || isLiveActive) {
      return;
    }
    const timeSinceStop = Date.now() - lastStopMsRef.current;
    if (timeSinceStop < LIVE_COOLDOWN_MS) {
      return;
    }

    liveStartingRef.current = true;
    retryCountRef.current = 0;
    await startSession();
  }, [isLiveActive, isLiveLoading, startSession]);

  // Ausencia del usuario
  useEffect(() => {
    if (isLiveActive && presence === 'absent') {
      handleStopLiveTryon();
    }
  }, [presence, isLiveActive, handleStopLiveTryon]);

  // Cambio de visibilidad del documento
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isLiveActive) {
        handleStopLiveTryon();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isLiveActive, handleStopLiveTryon]);

  // Desmontaje real del componente (limpieza con [])
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (managerRef.current) {
        managerRef.current.stop();
        managerRef.current = null;
      }
    };
  }, []);

  // Reenviar prenda solo si el manager está 'active'
  useEffect(() => {
    if (isLiveActive && managerRef.current && activeGarment) {
      if (managerRef.current.getState() === 'active') {
        const assets = resolveGarmentAssets(activeGarment, activeVariantId);
        const referenceImageUrl = new URL(
          (assets.overlayUrl || '').replace(/^\//, ''),
          PUBLIC_ASSETS_BASE,
        ).href;
        managerRef.current.sendGarment(referenceImageUrl);
      }
    }
  }, [activeGarment, activeVariantId, isLiveActive]);

  // Cuenta regresiva de sesión en vivo
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

  // Asignar stream remoto al elemento de video
  useEffect(() => {
    if (isLiveActive && liveStream && liveVideoRef.current) {
      liveVideoRef.current.srcObject = liveStream;
    }
  }, [isLiveActive, liveStream]);

  // Disponibilidad de Live (incluyendo enfriamiento de 4 s)
  const isCooldownActive = cooldownRemainingSec > 0;
  const isLiveAvailable =
    showLiveButton &&
    !isLiveLoading &&
    !isLiveActive &&
    !isCooldownActive &&
    kioskState === 'TRYON' &&
    Boolean(activeGarment);

  return {
    isLiveActive,
    isLiveLoading,
    isLiveAvailable,
    liveStream,
    liveCountdown,
    liveToast,
    liveVideoRef,
    handleStartLiveTryon,
    handleStopLiveTryon,
  };
}
