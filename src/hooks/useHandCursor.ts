import { useEffect, useRef, useState, useCallback } from 'react';
import type { RefObject } from 'react';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import type { UsePoseResult } from './usePose';
import { useSelectionUi } from './useSelectionUi';
import { useLayoutStore } from '@/store/layout';
import { useGarmentStore } from '@/store/garment';
import {
  isHandInputEnabled,
  isHandSimEnabled,
  isEffectiveActiveZoneEnabled,
} from '@/lib/hand-input-flag';
import {
  HandCursorTracker,
  type HandFrameInput,
  type DetectedHandInput,
  type HandFrameUser,
  type HandLandmarkPoint,
} from '@/lib/hand-cursor';
import { useHandCursorStore } from '@/store/handCursor';
import { toVisibleCoordinates } from '@/lib/active-zone';

export interface UseHandCursorOptions {
  active: boolean; // isCatalogVisible
  mirrorContainerRef?: RefObject<HTMLElement | null>;
}

let recognizerSingleton: GestureRecognizer | null = null;
let recognizerInitPromise: Promise<GestureRecognizer> | null = null;

async function getGestureRecognizer(): Promise<GestureRecognizer> {
  if (recognizerSingleton) return recognizerSingleton;
  if (recognizerInitPromise) return recognizerInitPromise;

  recognizerInitPromise = (async () => {
    const wasmPath = `${import.meta.env.BASE_URL}mediapipe/wasm`;
    const modelPath = `${import.meta.env.BASE_URL}mediapipe/gesture_recognizer.task`;
    const vision = await FilesetResolver.forVisionTasks(wasmPath);

    try {
      recognizerSingleton = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch (gpuErr) {
      console.warn('[useHandCursor] GPU delegate failed, falling back to CPU:', gpuErr);
      recognizerSingleton = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    }
    return recognizerSingleton;
  })();

  return recognizerInitPromise;
}

export function useHandCursor(
  videoRef: RefObject<HTMLVideoElement | null>,
  pose: UsePoseResult,
  options: UseHandCursorOptions,
) {
  const { effectiveSelectionUi } = useSelectionUi();
  const isPerchero = effectiveSelectionUi === 'perchero';
  const layout = useLayoutStore((s) => s.mode);
  const isPortrait = layout === 'portrait';
  const isHandGloballyEnabled = isHandInputEnabled();
  const isHandSim = isHandSimEnabled();
  const isZonaEnabled = isEffectiveActiveZoneEnabled();

  const isLocked = pose.activeZone != null && pose.activeZone.lockedIndex !== null;
  const lockedCandidate =
    isLocked && pose.activeZone && pose.activeZone.lockedIndex !== null
      ? pose.activeZone.candidates[pose.activeZone.lockedIndex]
      : null;

  // Condiciones estrictas de la sección 2:
  // Interfaz = perchero en portrait, zona activa ON, catálogo visible, persona fijada
  const isHandActive =
    isHandGloballyEnabled &&
    isPerchero &&
    isPortrait &&
    isZonaEnabled &&
    options.active &&
    (isLocked || isHandSim);

  const trackerRef = useRef<HandCursorTracker>(new HandCursorTracker());
  const callbackIdRef = useRef<number>(0);
  const activeLoopRef = useRef<boolean>(false);
  const isRunningInferenceRef = useRef<boolean>(false);

  // Métricas y frecuencia adaptativa
  const combinedLatencyHistoryRef = useRef<Array<{ time: number; latency: number }>>([]);
  const lastInferenceTimeRef = useRef<number>(0);
  const [adaptiveTargetFps, setAdaptiveTargetFps] = useState<number | 'auto'>('auto');
  const belowThresholdSinceRef = useRef<number | null>(null);

  // Simulación con mouse en mirror cell
  const simMouseOverRef = useRef<boolean>(false);
  const simMousePosRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const simKeyIRef = useRef<boolean>(false);

  // Cantidad de prendas en el perchero
  const catalog = useGarmentStore((s) => s.catalog);
  const itemCount = catalog.length;

  // Sincronizar estado enabled en store
  useEffect(() => {
    useHandCursorStore.getState().setEnabled(isHandGloballyEnabled);
  }, [isHandGloballyEnabled]);

  // Listener para la tecla 'I' en modo simulado (?hand_sim=1)
  useEffect(() => {
    if (!isHandSim) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'i' || e.key === 'I') {
        simKeyIRef.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'i' || e.key === 'I') {
        simKeyIRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isHandSim]);

  // Soporte para eventos sintéticos de QA (kiosk-hand-sim-move y kiosk-hand-sim-leave)
  useEffect(() => {
    if (!isHandSim) return;
    const handleSimMove = (e: Event) => {
      const custom = e as CustomEvent<{ x: number; y: number }>;
      simMouseOverRef.current = true;
      if (custom.detail) {
        simMousePosRef.current = { x: custom.detail.x, y: custom.detail.y };
      }
    };
    const handleSimLeave = () => {
      simMouseOverRef.current = false;
      simKeyIRef.current = false;
      trackerRef.current.reset();
      useHandCursorStore.getState().reset();
    };

    window.addEventListener('kiosk-hand-sim-move', handleSimMove);
    window.addEventListener('kiosk-hand-sim-leave', handleSimLeave);
    return () => {
      window.removeEventListener('kiosk-hand-sim-move', handleSimMove);
      window.removeEventListener('kiosk-hand-sim-leave', handleSimLeave);
    };
  }, [isHandSim]);

  // Eventos de puntero en la celda del espejo para simulación
  const handleMirrorPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!isHandSim) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      simMousePosRef.current = { x, y };
      simMouseOverRef.current = true;
    },
    [isHandSim],
  );

  const handleMirrorPointerLeave = useCallback(() => {
    if (!isHandSim) return;
    simMouseOverRef.current = false;
  }, [isHandSim]);

  // Pausa de 2 s ante cualquier toque táctil o clic fuera de la simulación
  useEffect(() => {
    const handleGlobalPointer = (e: PointerEvent) => {
      if (!isHandGloballyEnabled) return;
      // Si estamos en modo simulado y el evento ocurrió dentro del espejo, no pausar
      if (isHandSim) {
        const mirrorEl =
          document.querySelector('[data-stage="mirror"]') ||
          document.getElementById('mirror');
        if (mirrorEl && mirrorEl.contains(e.target as Node)) {
          return;
        }
      }
      useHandCursorStore.getState().pause(2000);
    };

    window.addEventListener('pointerdown', handleGlobalPointer);
    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointer);
    };
  }, [isHandGloballyEnabled, isHandSim]);

  // Loop de inferencia de manos y actualización del cursor
  useEffect(() => {
    if (!isHandActive) {
      activeLoopRef.current = false;
      trackerRef.current.reset();
      useHandCursorStore.getState().reset();
      return;
    }

    const video = videoRef.current;
    if (!video || !('requestVideoFrameCallback' in video)) {
      return;
    }

    let isSubscribed = true;
    activeLoopRef.current = true;

    // Inicializar modelo
    getGestureRecognizer().catch((err) => {
      console.warn('[useHandCursor] Failed to initialize GestureRecognizer:', err);
    });

    const onFrame = (_now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
      if (!activeLoopRef.current || !isSubscribed || !video) {
        return;
      }

      const nowMs = performance.now();

      // Frecuencia adaptativa: verificar espaciado según fps objetivo
      let minSpacingMs = 0;
      if (adaptiveTargetFps === 10) minSpacingMs = 100;
      else if (adaptiveTargetFps === 15) minSpacingMs = 66.7;

      if (minSpacingMs > 0 && nowMs - lastInferenceTimeRef.current < minSpacingMs) {
        callbackIdRef.current = video.requestVideoFrameCallback(onFrame);
        return;
      }

      // Preparar usuario objetivo
      let targetUser: HandFrameUser | null = null;
      if (lockedCandidate) {
        const containerWidth = video.clientWidth || (isPortrait ? 1080 : 1920);
        const containerHeight = video.clientHeight || (isPortrait ? 1920 : 1080);

        const leftWristVis = pose.lockedWrists.left
          ? toVisibleCoordinates(
              pose.lockedWrists.left,
              layout,
              video.videoWidth,
              video.videoHeight,
              containerWidth,
              containerHeight,
            )
          : null;
        const rightWristVis = pose.lockedWrists.right
          ? toVisibleCoordinates(
              pose.lockedWrists.right,
              layout,
              video.videoWidth,
              video.videoHeight,
              containerWidth,
              containerHeight,
            )
          : null;

        targetUser = {
          lockedWrists: { left: leftWristVis, right: rightWristVis },
          sw: lockedCandidate.swWidth ?? lockedCandidate.sw,
          cx: 1 - lockedCandidate.cx, // en coordenadas espejadas de pantalla
        };
      } else if (isHandSim) {
        // Usuario sintético centrado para QA
        targetUser = {
          lockedWrists: {
            left: { x: 0.45, y: 0.6 },
            right: { x: 0.55, y: 0.6 },
          },
          sw: 0.15,
          cx: 0.5,
        };
      }

      // Procesar frame
      const isBusy = useHandCursorStore.getState().isBusy;
      const pausedUntilMs = useHandCursorStore.getState().pausedUntilMs;

      if (isHandSim && simMouseOverRef.current) {
        // Modo simulado QA (?hand_sim=1)
        const mouse = simMousePosRef.current;
        const wristCoord: HandLandmarkPoint = targetUser?.lockedWrists.right ??
          targetUser?.lockedWrists.left ?? { x: 0.55, y: 0.6 };

        const simHands: DetectedHandInput[] = [
          {
            wrist: wristCoord,
            palmCenter: { x: 1 - mouse.x, y: mouse.y }, // espejado
            gesture: simKeyIRef.current ? 'Pointing_Up' : 'Open_Palm',
            score: 0.9,
          },
        ];

        const frameInput: HandFrameInput = {
          nowMs,
          hands: simHands,
          user: targetUser,
          itemCount,
          busy: isBusy,
          pausedUntilMs,
        };

        const output = trackerRef.current.update(frameInput);
        useHandCursorStore.getState().updateFromOutput(output, {
          fps: 60,
          p95: 5,
          adaptiveFps: 'auto',
        });
      } else if (
        !isHandSim &&
        recognizerSingleton &&
        !isRunningInferenceRef.current &&
        video.readyState >= 2
      ) {
        // Inferencia real con MediaPipe GestureRecognizer
        isRunningInferenceRef.current = true;
        const startInfer = performance.now();

        try {
          const result = recognizerSingleton.recognizeForVideo(
            video,
            metadata.presentationTime,
          );
          const gestureLatency = performance.now() - startInfer;
          lastInferenceTimeRef.current = nowMs;

          // Latencia combinada (pose + gesto)
          const combinedLatency = (pose.latency || 25) + gestureLatency;
          combinedLatencyHistoryRef.current.push({
            time: nowMs,
            latency: combinedLatency,
          });
          const cutoff = nowMs - 3000;
          combinedLatencyHistoryRef.current = combinedLatencyHistoryRef.current.filter(
            (c) => c.time >= cutoff,
          );

          // Calcular p95 de latencia combinada
          const sorted = combinedLatencyHistoryRef.current
            .map((c) => c.latency)
            .sort((a, b) => a - b);
          const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
          const combinedP95 = sorted[p95Idx] ?? combinedLatency;

          // Reglas de frecuencia adaptativa:
          // p95 > 80 ms -> 10 fps; p95 > 55 ms -> 15 fps; volver a subir tras 10 s de holgura
          if (combinedP95 > 80) {
            setAdaptiveTargetFps(10);
            belowThresholdSinceRef.current = null;
          } else if (combinedP95 > 55) {
            if (adaptiveTargetFps === 10) {
              if (belowThresholdSinceRef.current === null) {
                belowThresholdSinceRef.current = nowMs;
              } else if (nowMs - belowThresholdSinceRef.current >= 10000) {
                setAdaptiveTargetFps(15);
                belowThresholdSinceRef.current = null;
              }
            } else {
              setAdaptiveTargetFps(15);
              belowThresholdSinceRef.current = null;
            }
          } else {
            if (adaptiveTargetFps !== 'auto') {
              if (belowThresholdSinceRef.current === null) {
                belowThresholdSinceRef.current = nowMs;
              } else if (nowMs - belowThresholdSinceRef.current >= 10000) {
                setAdaptiveTargetFps(adaptiveTargetFps === 10 ? 15 : 'auto');
                belowThresholdSinceRef.current = null;
              }
            }
          }

          // Transformar landmarks detectados a coordenadas visibles
          const containerWidth = video.clientWidth || (isPortrait ? 1080 : 1920);
          const containerHeight = video.clientHeight || (isPortrait ? 1920 : 1080);

          const detectedHands: DetectedHandInput[] = [];
          if (result.landmarks && result.landmarks.length > 0) {
            for (let i = 0; i < result.landmarks.length; i++) {
              const lms = result.landmarks[i];
              if (!lms || lms.length < 10) continue;

              const wristRaw = lms[0];
              const palmCenterRaw = lms[9];
              if (!wristRaw || !palmCenterRaw) continue;

              const wristVis = toVisibleCoordinates(
                wristRaw,
                layout,
                video.videoWidth,
                video.videoHeight,
                containerWidth,
                containerHeight,
              );
              const palmCenterVis = toVisibleCoordinates(
                palmCenterRaw,
                layout,
                video.videoWidth,
                video.videoHeight,
                containerWidth,
                containerHeight,
              );

              const gestureName = result.gestures?.[i]?.[0]?.categoryName ?? 'None';
              const gestureScore = result.gestures?.[i]?.[0]?.score ?? 0;

              detectedHands.push({
                wrist: wristVis,
                palmCenter: palmCenterVis,
                gesture: gestureName,
                score: gestureScore,
              });
            }
          }

          const frameInput: HandFrameInput = {
            nowMs,
            hands: detectedHands,
            user: targetUser,
            itemCount,
            busy: isBusy,
            pausedUntilMs,
          };

          const output = trackerRef.current.update(frameInput);
          const gestureFps = gestureLatency > 0 ? Math.round(1000 / gestureLatency) : 0;

          useHandCursorStore.getState().updateFromOutput(output, {
            fps: gestureFps,
            p95: Math.round(combinedP95),
            adaptiveFps: adaptiveTargetFps,
          });
        } catch (err) {
          console.warn('[useHandCursor] recognizeForVideo error:', err);
        } finally {
          isRunningInferenceRef.current = false;
        }
      } else {
        // Sin manos detectadas o esperando
        const frameInput: HandFrameInput = {
          nowMs,
          hands: [],
          user: targetUser,
          itemCount,
          busy: isBusy,
          pausedUntilMs,
        };
        const output = trackerRef.current.update(frameInput);
        useHandCursorStore.getState().updateFromOutput(output);
      }

      if (activeLoopRef.current && isSubscribed) {
        callbackIdRef.current = video.requestVideoFrameCallback(onFrame);
      }
    };

    callbackIdRef.current = video.requestVideoFrameCallback(onFrame);

    return () => {
      isSubscribed = false;
      activeLoopRef.current = false;
      if (callbackIdRef.current && video) {
        video.cancelVideoFrameCallback(callbackIdRef.current);
      }
    };
  }, [
    isHandActive,
    videoRef,
    pose.activeZone,
    pose.lockedWrists,
    pose.latency,
    layout,
    isPortrait,
    itemCount,
    isHandSim,
    adaptiveTargetFps,
    lockedCandidate,
  ]);

  return {
    isHandActive,
    handleMirrorPointerMove,
    handleMirrorPointerLeave,
  };
}
