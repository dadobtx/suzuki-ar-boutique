import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { LiveTryOnManager } from '@/lib/liveTryon';
import { useLiveTryonStore } from '@/store/liveTryon';
import { resolveGarmentAssets } from '@/lib/garment-assets';
import { getKioskKey } from '@/lib/kioskKey';
import type { LiveErrorReason } from '@/lib/live/types';
import type { Garment } from '@/types/garment';
import type { PresenceState } from '@/hooks/usePresence';
import type { KioskState } from '@/store/kiosk';

const PUBLIC_ASSETS_BASE =
  import.meta.env.VITE_PUBLIC_ASSETS_BASE ||
  'https://dadobtx.github.io/suzuki-ar-boutique/';

export const LIVE_COOLDOWN_MS = 4000;
export const LIVE_BUSY_COOLDOWN_MS = 30000;
export const CONCURRENT_RETRY_DELAY_MS = 10000;
export const LIVE_CONNECT_TIMEOUT_MS = 30000;

export interface UseLiveTryOnProps {
  activeGarment: Garment | null;
  activeVariantId?: string | null;
  cameraStream?: MediaStream | null;
  getCameraStream?: () => MediaStream | null;
  sessionId: string | null;
  presence: PresenceState;
  kioskState: KioskState;
  garmentActiveWithProfile: boolean;
}

export interface UseLiveTryOnResult {
  isLiveActive: boolean;
  isLiveLoading: boolean;
  isLiveAvailable: boolean;
  isLiveCoolingDown: boolean;
  isQuotaExhausted: boolean;
  isBusyCooldown: boolean;
  showLiveButton: boolean;
  showPlanB: boolean;
  dismissPlanB: () => void;
  firstFrameRendered: boolean;
  liveStream: MediaStream | null;
  liveCountdown: number | null;
  liveToast: string | null;
  liveVideoRef: RefObject<HTMLVideoElement>;
  handleStartLiveTryon: () => Promise<void>;
  handleStopLiveTryon: () => void;
  notifyFirstFrame: () => void;
}

export function useLiveTryon({
  activeGarment,
  activeVariantId,
  cameraStream,
  getCameraStream,
  sessionId,
  presence,
  kioskState,
  garmentActiveWithProfile,
}: UseLiveTryOnProps): UseLiveTryOnResult {
  const { t } = useTranslation();

  const isLiveTryOnEnabled = import.meta.env.VITE_LIVE_TRYON === 'on';
  const kioskKey = getKioskKey();
  const showLiveButton =
    isLiveTryOnEnabled &&
    Boolean(kioskKey) &&
    activeGarment?.category === 'top' &&
    garmentActiveWithProfile;

  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isLiveLoading, setIsLiveLoading] = useState(false);
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [liveCountdown, setLiveCountdown] = useState<number | null>(null);
  const [liveToast, setLiveToast] = useState<string | null>(null);
  const [cooldownRemainingSec, setCooldownRemainingSec] = useState<number>(0);
  const [busyRemainingSec, setBusyRemainingSec] = useState<number>(0);
  const [isQuotaExhausted, setIsQuotaExhausted] = useState<boolean>(false);
  const [showPlanB, setShowPlanB] = useState<boolean>(false);

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const managerRef = useRef<LiveTryOnManager | null>(null);
  const liveStartingRef = useRef<boolean>(false);
  const lastStopMsRef = useRef<number>(0);
  const busyCooldownUntilRef = useRef<number>(0);
  const sessionStartTimeRef = useRef<number>(0);
  const hadVideoRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const lastErrorRef = useRef<string | null>(null);
  const lastErrorReasonRef = useRef<LiveErrorReason | null>(null);
  const firstFrameRenderedRef = useRef<boolean>(false);
  const liveTriggerTimeRef = useRef<number>(0);
  const connectStartTimeRef = useRef<number>(0);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxSecondsRef = useRef<number>(30);
  const connectingGarmentIdRef = useRef<string | null>(null);
  const failedRef = useRef<boolean>(false);
  const activeLiveIdRef = useRef<number | null>(null);
  const generationSecondsRef = useRef<number>(0);

  const dismissPlanB = useCallback(() => {
    setShowPlanB(false);
  }, []);

  // Consultar cuota de Decart (/live/quota)
  const checkQuota = useCallback(async () => {
    if (!showLiveButton) return;
    try {
      const BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8787';
      const res = await fetch(`${BACKEND_URL}/live/quota`);
      if (!res.ok) {
        setIsQuotaExhausted(false);
        return;
      }
      const data = await res.json();
      if (data && !data.unknown && typeof data.remaining === 'number') {
        setIsQuotaExhausted(data.remaining === 0);
      } else {
        setIsQuotaExhausted(false);
      }
    } catch {
      setIsQuotaExhausted(false);
    }
  }, [showLiveButton]);

  // Sondeo de cuota cuando el botón está visible
  useEffect(() => {
    if (!showLiveButton) return;
    void checkQuota();
    const timer = setInterval(() => {
      void checkQuota();
    }, 5000);
    return () => clearInterval(timer);
  }, [showLiveButton, checkQuota]);

  // Sincronizar telemetría para DiagnosticOverlay
  const syncTelemetry = useCallback(() => {
    const elapsed = Date.now() - lastStopMsRef.current;
    const remainingMs = Math.max(0, LIVE_COOLDOWN_MS - elapsed);
    const remainingSec = Math.ceil(remainingMs / 1000);

    const busyElapsed = Math.max(0, busyCooldownUntilRef.current - Date.now());
    const busySec = Math.ceil(busyElapsed / 1000);

    setCooldownRemainingSec(remainingSec);
    setBusyRemainingSec(busySec);

    const isCoolingDown = remainingSec > 0 || busySec > 0;

    useLiveTryonStore.setState({
      managerState: managerRef.current?.getState() ?? 'idle',
      connectionKey: managerRef.current?.getConnectionKey() ?? null,
      activeCount: LiveTryOnManager.activeCount(),
      cooldownRemainingSec: remainingSec,
      lastError: lastErrorRef.current,
      isLiveActive,
      isLiveLoading,
      isLiveAvailable:
        showLiveButton &&
        !isLiveLoading &&
        !isLiveActive &&
        !isCoolingDown &&
        !isQuotaExhausted &&
        kioskState === 'TRYON' &&
        Boolean(activeGarment),
      firstFrameRendered,
      failed: failedRef.current,
    });
  }, [
    activeGarment,
    firstFrameRendered,
    isLiveActive,
    isLiveLoading,
    isQuotaExhausted,
    kioskState,
    showLiveButton,
  ]);

  // Tick de enfriamiento y telemetría
  useEffect(() => {
    syncTelemetry();
    const timer = setInterval(() => {
      syncTelemetry();
    }, 250);
    return () => clearInterval(timer);
  }, [syncTelemetry]);

  // Notificar primer cuadro renderizado
  const notifyFirstFrame = useCallback(() => {
    if (firstFrameRenderedRef.current) return;
    firstFrameRenderedRef.current = true;
    setFirstFrameRendered(true);
    hadVideoRef.current = true;

    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    connectStartTimeRef.current = 0;

    const elapsed = Math.max(
      0,
      Math.round(performance.now() - liveTriggerTimeRef.current),
    );
    console.log(`[live] t+${elapsed}ms primer cuadro renderizado`);

    sessionStartTimeRef.current = Date.now();
    if (maxSecondsRef.current > 0) {
      setLiveCountdown(maxSecondsRef.current);
    }
    syncTelemetry();
  }, [syncTelemetry]);

  // Enviar beacon de cierre estricto ante unmount o visibilitychange
  const sendTeardownBeacon = useCallback(() => {
    const liveId = activeLiveIdRef.current;
    if (!liveId) return;

    const hadVideo = hadVideoRef.current;
    const failed = !hadVideo || failedRef.current;
    const reason = lastErrorReasonRef.current || (failed ? 'interrupted' : undefined);
    const seconds = hadVideo ? generationSecondsRef.current : 0;
    const BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8787';

    try {
      const payload = JSON.stringify({
        live_id: liveId,
        seconds,
        failed,
        reason,
      });

      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(
          `${BACKEND_URL}/live/complete`,
          new Blob([payload], { type: 'text/plain;charset=UTF-8' }),
        );
      } else {
        fetch(`${BACKEND_URL}/live/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('[live] error sending teardown beacon:', err);
    }
    activeLiveIdRef.current = null;
  }, []);

  // Detener la sesión de manera segura
  const stopInternal = useCallback(
    (isRetryPending = false, failed = false) => {
      if (!isRetryPending) {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        connectStartTimeRef.current = 0;
      }

      if (managerRef.current) {
        managerRef.current.stop();
        managerRef.current = null;
      }

      failedRef.current = failed;
      setIsLiveActive(false);
      setLiveStream(null);
      setLiveCountdown(null);
      setFirstFrameRendered(false);
      firstFrameRenderedRef.current = false;
      connectingGarmentIdRef.current = null;
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
    stopInternal(false, false);
  }, [stopInternal]);

  // Limpieza ante fallo
  const cleanupAfterFailure = useCallback(
    (
      toastKey: 'live.busy' | 'live.error' | 'live.connectTimeout' | 'live.kioskKey',
      reason?: LiveErrorReason,
    ) => {
      if (reason) {
        lastErrorReasonRef.current = reason;
      }
      stopInternal(false, true);
      setShowPlanB(true);

      const defaultMsg =
        toastKey === 'live.busy'
          ? 'La prueba en vivo está ocupada, intenta en un momento'
          : toastKey === 'live.kioskKey'
            ? 'Clave de kiosko no autorizada'
            : toastKey === 'live.connectTimeout'
              ? 'No pudimos conectar con Lucy. Intenta de nuevo en unos segundos.'
              : 'No pudimos iniciar la prueba en vivo. Intenta otra vez.';

      setLiveToast(t(toastKey, defaultMsg));
      setTimeout(() => {
        if (isMountedRef.current) {
          setLiveToast(null);
        }
      }, 4000);
    },
    [stopInternal, t],
  );

  // Iniciar sesión
  const startSession = useCallback(async () => {
    if (!activeGarment || !sessionId) {
      liveStartingRef.current = false;
      setIsLiveLoading(false);
      return;
    }

    const currentKioskKey = getKioskKey();
    if (!currentKioskKey) {
      liveStartingRef.current = false;
      cleanupAfterFailure('live.kioskKey', 'kiosk_key');
      return;
    }

    const stream = getCameraStream ? getCameraStream() : (cameraStream ?? null);
    if (!stream) {
      liveStartingRef.current = false;
      cleanupAfterFailure('live.error', 'token_error');
      return;
    }

    setIsLiveLoading(true);
    hadVideoRef.current = false;
    lastErrorRef.current = null;
    lastErrorReasonRef.current = null;
    failedRef.current = false;
    generationSecondsRef.current = 0;
    connectingGarmentIdRef.current = activeGarment.id;

    if (connectStartTimeRef.current === 0) {
      connectStartTimeRef.current = Date.now();
    }

    // Timeout sin video: 30 segundos
    if (!connectTimeoutRef.current) {
      const elapsed = Date.now() - connectStartTimeRef.current;
      const remainingTimeout = Math.max(0, LIVE_CONNECT_TIMEOUT_MS - elapsed);
      connectTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current && !firstFrameRenderedRef.current) {
          console.warn('[live] Connection timeout after 30s without video');
          lastErrorReasonRef.current = 'no_video_timeout';
          cleanupAfterFailure('live.connectTimeout', 'no_video_timeout');
        }
      }, remainingTimeout);
    }

    const elapsedToken = Math.max(
      0,
      Math.round(performance.now() - liveTriggerTimeRef.current),
    );
    console.log(`[live] t+${elapsedToken}ms token requested`);
    syncTelemetry();

    const BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:8787';

    try {
      const event =
        new URLSearchParams(window.location.search).get('event') || 'default-event';

      const res = await fetch(`${BACKEND_URL}/live/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Key': currentKioskKey,
        },
        body: JSON.stringify({
          session_id: sessionId,
          sku: activeGarment.sku,
          event,
        }),
      });

      const data = await res.json();

      // Manejo 403 kiosk_key
      if (res.status === 403) {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        lastErrorReasonRef.current = 'kiosk_key';
        cleanupAfterFailure('live.kioskKey', 'kiosk_key');
        return;
      }

      // Manejo 429
      if (res.status === 429) {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }

        if (data.reason === 'busy') {
          // Candado busy: deshabilitar 30 s sin reintento
          lastErrorReasonRef.current = 'busy';
          busyCooldownUntilRef.current = Date.now() + LIVE_BUSY_COOLDOWN_MS;
          cleanupAfterFailure('live.busy', 'busy');
          return;
        }

        const msg =
          data.limit === 'user'
            ? t('live.userLimit', 'Ya usaste tus 3 pruebas en vivo')
            : t('live.dayLimit', 'Prueba en vivo no disponible por hoy');
        setLiveToast(msg);
        setTimeout(() => setLiveToast(null), 3000);
        setIsLiveLoading(false);
        liveStartingRef.current = false;
        lastStopMsRef.current = Date.now();
        setShowPlanB(true);
        syncTelemetry();
        return;
      }

      if (data.status !== 'success') {
        throw new Error(data.error || 'Token error');
      }

      const token = data.apiKey || data.token;
      const liveId = data.live_session_id || data.live_id;
      activeLiveIdRef.current = liveId;

      const assets = resolveGarmentAssets(activeGarment, activeVariantId);
      const referenceImageUrl = new URL(
        (assets.overlayUrl || '').replace(/^\//, ''),
        PUBLIC_ASSETS_BASE,
      ).href;

      maxSecondsRef.current = data.max_seconds;
      const manager = new LiveTryOnManager({
        token,
        maxSeconds: data.max_seconds,
        liveId,
        stream,
        referenceImageUrl,
        triggerTime: liveTriggerTimeRef.current,
        onUpdate: (remoteStream) => {
          if (!isMountedRef.current) return;
          setLiveStream(remoteStream);
          setIsLiveActive(true);
          setIsLiveLoading(false);
          liveStartingRef.current = false;
          retryCountRef.current = 0;
          setShowPlanB(false);
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
        onError: async (err, reason) => {
          console.error('[live] onError handler:', err, 'reason:', reason);
          lastErrorRef.current = err.message;
          const classifiedReason =
            reason ||
            (err.message.toLowerCase().includes('concurrent session limit')
              ? 'limit'
              : 'token_error');
          lastErrorReasonRef.current = classifiedReason;
          syncTelemetry();

          // busy o limit: NO reintentar. Botón deshabilitado 30 s.
          if (classifiedReason === 'busy' || classifiedReason === 'limit') {
            busyCooldownUntilRef.current = Date.now() + LIVE_BUSY_COOLDOWN_MS;
            cleanupAfterFailure('live.busy', classifiedReason);
            return;
          }

          // Errores transitorios (ws_error, webrtc_error, token_error): 1 reintento tras >= 10 s
          if (retryCountRef.current === 0) {
            retryCountRef.current = 1;
            stopInternal(true);
            setIsLiveLoading(true);

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
              cleanupAfterFailure('live.error', classifiedReason);
            }
          } else {
            cleanupAfterFailure('live.error', classifiedReason);
          }
        },
        onClose: (finalSeconds?: number) => {
          const elapsedSeconds = Math.floor(
            (Date.now() - sessionStartTimeRef.current) / 1000,
          );
          const secondsUsed =
            typeof finalSeconds === 'number' && finalSeconds > 0
              ? finalSeconds
              : elapsedSeconds;
          generationSecondsRef.current = Math.max(
            0,
            Math.min(secondsUsed, data.max_seconds),
          );

          const hadVideo = hadVideoRef.current;
          const isFailed = !hadVideo || failedRef.current;
          const reason =
            lastErrorReasonRef.current || (isFailed ? 'token_error' : undefined);

          fetch(`${BACKEND_URL}/live/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              live_id: liveId,
              seconds: hadVideo ? generationSecondsRef.current : 0,
              failed: isFailed,
              reason,
            }),
          })
            .catch(() => {})
            .finally(() => {
              activeLiveIdRef.current = null;
            });
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

      const isConcurrent =
        errMsg.toLowerCase().includes('concurrent session limit') ||
        errMsg.toLowerCase().includes('limit');
      const isBusy = errMsg.toLowerCase().includes('busy');

      if (isConcurrent || isBusy) {
        const classified = isBusy ? 'busy' : 'limit';
        lastErrorReasonRef.current = classified;
        busyCooldownUntilRef.current = Date.now() + LIVE_BUSY_COOLDOWN_MS;
        cleanupAfterFailure('live.busy', classified);
        return;
      }

      if (retryCountRef.current === 0) {
        retryCountRef.current = 1;
        stopInternal(true);
        setIsLiveLoading(true);

        await new Promise((resolve) => setTimeout(resolve, CONCURRENT_RETRY_DELAY_MS));

        if (isMountedRef.current && kioskState === 'TRYON' && Boolean(activeGarment)) {
          liveStartingRef.current = true;
          void startSession();
        } else {
          cleanupAfterFailure('live.error', 'token_error');
        }
      } else {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        connectStartTimeRef.current = 0;
        cleanupAfterFailure('live.error', 'token_error');
      }
    }
  }, [
    activeGarment,
    activeVariantId,
    cameraStream,
    cleanupAfterFailure,
    getCameraStream,
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
    if (Date.now() < busyCooldownUntilRef.current) {
      return;
    }
    if (isQuotaExhausted) {
      return;
    }

    liveTriggerTimeRef.current = performance.now();
    connectStartTimeRef.current = Date.now();
    console.log('[live] t+0ms click/gesture trigger');
    failedRef.current = false;
    setShowPlanB(false);

    liveStartingRef.current = true;
    retryCountRef.current = 0;
    await startSession();
  }, [isLiveActive, isLiveLoading, isQuotaExhausted, startSession]);

  // Cancelar la conexión en curso si la prenda activa cambia durante la carga
  useEffect(() => {
    if (
      isLiveLoading &&
      connectingGarmentIdRef.current &&
      activeGarment?.id &&
      activeGarment.id !== connectingGarmentIdRef.current
    ) {
      console.log('[live] Garment changed during liveLoading - canceling connection');
      stopInternal(false, true);
    }
  }, [activeGarment?.id, isLiveLoading, stopInternal]);

  // Ocultar Plan B al cambiar de prenda
  useEffect(() => {
    setShowPlanB(false);
  }, [activeGarment?.id]);

  // Ausencia del usuario
  useEffect(() => {
    if (isLiveActive && presence === 'absent') {
      handleStopLiveTryon();
    }
  }, [presence, isLiveActive, handleStopLiveTryon]);

  // Cambio de visibilidad del documento: desconexión y beacon
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && (isLiveActive || isLiveLoading)) {
        handleStopLiveTryon();
        sendTeardownBeacon();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isLiveActive, isLiveLoading, handleStopLiveTryon, sendTeardownBeacon]);

  // Desmontaje real del componente: desconexión estricta y beacon
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      if (managerRef.current) {
        managerRef.current.stop();
        managerRef.current = null;
      }
      sendTeardownBeacon();
    };
  }, [sendTeardownBeacon]);

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

  // Asignar stream remoto al elemento de video y detectar primer cuadro
  useEffect(() => {
    const video = liveVideoRef.current;
    if (isLiveActive && liveStream && video) {
      video.srcObject = liveStream;
    }
  }, [isLiveActive, liveStream]);

  // Escuchar cuando el video efectivamente reproduce su primer cuadro
  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video || !isLiveActive || firstFrameRendered) return;

    let callbackId: number | null = null;
    if ('requestVideoFrameCallback' in video) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callbackId = (video as any).requestVideoFrameCallback(() => {
        notifyFirstFrame();
      });
    }

    const onPlay = () => notifyFirstFrame();
    video.addEventListener('playing', onPlay);
    video.addEventListener('loadeddata', onPlay);

    return () => {
      if (callbackId !== null && 'cancelVideoFrameCallback' in video) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (video as any).cancelVideoFrameCallback(callbackId);
      }
      video.removeEventListener('playing', onPlay);
      video.removeEventListener('loadeddata', onPlay);
    };
  }, [isLiveActive, firstFrameRendered, notifyFirstFrame]);

  // Cuenta regresiva de sesión en vivo
  useEffect(() => {
    if (
      !isLiveActive ||
      !firstFrameRendered ||
      liveCountdown === null ||
      liveCountdown <= 0
    )
      return;
    const timer = setTimeout(() => {
      if (liveCountdown - 1 <= 0) {
        handleStopLiveTryon();
      } else {
        setLiveCountdown(liveCountdown - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [isLiveActive, firstFrameRendered, liveCountdown, handleStopLiveTryon]);

  // Disponibilidad de Live (incluyendo enfriamientos normal y busy, y cuota)
  const isCooldownActive = cooldownRemainingSec > 0;
  const isBusyActive = busyRemainingSec > 0;
  const isLiveCoolingDown = isCooldownActive || isBusyActive;
  const isLiveAvailable =
    showLiveButton &&
    !isLiveLoading &&
    !isLiveActive &&
    !isLiveCoolingDown &&
    !isQuotaExhausted &&
    kioskState === 'TRYON' &&
    Boolean(activeGarment);

  return {
    isLiveActive,
    isLiveLoading,
    isLiveAvailable,
    isLiveCoolingDown,
    isQuotaExhausted,
    isBusyCooldown: isBusyActive,
    showLiveButton,
    showPlanB,
    dismissPlanB,
    firstFrameRendered,
    liveStream,
    liveCountdown,
    liveToast,
    liveVideoRef,
    handleStartLiveTryon,
    handleStopLiveTryon,
    notifyFirstFrame,
  };
}
