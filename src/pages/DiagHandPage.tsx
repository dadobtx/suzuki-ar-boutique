import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FilesetResolver,
  GestureRecognizer,
  PoseLandmarker,
} from '@mediapipe/tasks-vision';
import { useCamera } from '@/hooks/useCamera';
import {
  p95,
  average,
  calculateDetectionRate,
  calculateMatchRate,
  calculatePalmWidth,
  filterSlidingWindow,
  calculateFpsFromTimestamps,
  getDominantGesture,
  recordsToCsv,
  type DiagHandRecord,
  type HandFrameSample,
} from '@/lib/diag-hand-stats';

const LOCAL_STORAGE_KEY = 'suzuki-diag-mano';

export function DiagHandPage() {
  // ── Cámara ──
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>(undefined);
  const {
    videoRef,
    status: _status,
    availableDevices,
    settings,
    retry,
  } = useCamera(selectedCameraId);

  // ── Canvas de dibujo ──
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Configuración de inferencia ──
  const [minDetectionConf, setMinDetectionConf] = useState(0.5);
  const [minPresenceConf, setMinPresenceConf] = useState(0.5);
  const [minTrackingConf, setMinTrackingConf] = useState(0.5);
  const [numHands, setNumHands] = useState<1 | 2>(2);
  const [delegate, setDelegate] = useState<'GPU' | 'CPU'>('GPU');
  const [fpsTarget, setFpsTarget] = useState<'max' | '15' | '10'>('max');
  const [runPoseConcurrently, setRunPoseConcurrently] = useState(false);

  // ── Estado de inicialización MediaPipe ──
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);

  // ── Ventana móvil y métricas (5 s) ──
  const samplesRef = useRef<HandFrameSample[]>([]);
  const videoTimestampsRef = useRef<number[]>([]);
  const [metrics, setMetrics] = useState({
    videoFps: 0,
    gestureFps: 0,
    poseFps: null as number | null,
    gestureAvgMs: 0,
    gestureP95Ms: 0,
    poseAvgMs: null as number | null,
    poseP95Ms: null as number | null,
    detectionRate: 0,
    dominantGesture: null as string | null,
    dominantScore: 0,
    avgPalmWidthPx: 0,
    wristVisibilityAvg: null as number | null,
    wristAboveShoulder: null as boolean | null,
  });

  // ── Grabación de pruebas (10 s) ──
  const [testDistance, setTestDistance] = useState(2.0);
  const [testGesture, setTestGesture] = useState<
    'Palma abierta' | 'Puño' | 'Índice arriba' | 'Mano bajada'
  >('Palma abierta');
  const [recordingState, setRecordingState] = useState<
    'idle' | 'countdown' | 'recording'
  >('idle');
  const [countdownNum, setCountdownNum] = useState(3);
  const [recordSecondsLeft, setRecordSecondsLeft] = useState(10);
  const recordingSamplesRef = useRef<HandFrameSample[]>([]);

  // ── Registros en localStorage ──
  const [records, setRecords] = useState<DiagHandRecord[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [copiedCsv, setCopiedCsv] = useState(false);

  // Sincronizar registros con localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Ignorar errores de quota en localStorage
    }
  }, [records]);

  // ── Inicializar Recognizer y PoseLandmarker ──
  useEffect(() => {
    let cancelled = false;
    setModelLoading(true);
    setModelError(null);

    async function initModels() {
      try {
        const wasmPath = `${import.meta.env.BASE_URL}mediapipe/wasm`;
        const resolver = await FilesetResolver.forVisionTasks(wasmPath);
        if (cancelled) return;

        // 1. Gesture Recognizer
        const gesturePath = `${import.meta.env.BASE_URL}mediapipe/gesture_recognizer.task`;
        const recognizer = await GestureRecognizer.createFromOptions(resolver, {
          baseOptions: {
            modelAssetPath: gesturePath,
            delegate,
          },
          runningMode: 'VIDEO',
          numHands,
          minHandDetectionConfidence: minDetectionConf,
          minHandPresenceConfidence: minPresenceConf,
          minTrackingConfidence: minTrackingConf,
        });
        if (cancelled) {
          recognizer.close();
          return;
        }
        recognizerRef.current?.close();
        recognizerRef.current = recognizer;

        // 2. Pose Landmarker (si está activo)
        if (runPoseConcurrently) {
          const posePath = `${import.meta.env.BASE_URL}mediapipe/pose_landmarker_full.task`;
          const poseLm = await PoseLandmarker.createFromOptions(resolver, {
            baseOptions: {
              modelAssetPath: posePath,
              delegate,
            },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
          if (cancelled) {
            poseLm.close();
            return;
          }
          poseLandmarkerRef.current?.close();
          poseLandmarkerRef.current = poseLm;
        } else {
          poseLandmarkerRef.current?.close();
          poseLandmarkerRef.current = null;
        }

        setModelLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('[DiagHandPage] Error al inicializar MediaPipe:', err);
          setModelError(err instanceof Error ? err.message : String(err));
          setModelLoading(false);
        }
      }
    }

    initModels();

    return () => {
      cancelled = true;
      recognizerRef.current?.close();
      recognizerRef.current = null;
      poseLandmarkerRef.current?.close();
      poseLandmarkerRef.current = null;
    };
  }, [
    minDetectionConf,
    minPresenceConf,
    minTrackingConf,
    numHands,
    delegate,
    runPoseConcurrently,
  ]);

  // ── Bucle de Inferencia y Renderizado ──
  useEffect(() => {
    let animationFrameId: number;
    let lastGestureTime = 0;
    let lastVideoFrameTime = 0;

    const intervalMs =
      fpsTarget === '15' ? 1000 / 15 : fpsTarget === '10' ? 1000 / 10 : 0;

    function processLoop(now: number) {
      animationFrameId = requestAnimationFrame(processLoop);

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const recognizer = recognizerRef.current;

      if (!video || video.readyState < 2 || !canvas) {
        return;
      }

      // Medir FPS de video
      if (video.currentTime !== lastVideoFrameTime) {
        lastVideoFrameTime = video.currentTime;
        videoTimestampsRef.current.push(now);
      }

      // Ajustar resolución del canvas al video real
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!recognizer || modelLoading) {
        return;
      }

      // Comprobar throttle de FPS de inferencia
      if (intervalMs > 0 && now - lastGestureTime < intervalMs) {
        return;
      }
      lastGestureTime = now;

      // ── Inferencia de Gesto ──
      const t0 = performance.now();
      let gestureResult;
      try {
        gestureResult = recognizer.recognizeForVideo(video, now);
      } catch (err) {
        console.warn('[DiagHandPage] recognizeForVideo error:', err);
        return;
      }
      const gestureLatencyMs = performance.now() - t0;

      // ── Inferencia de Pose concurrente (si está activa) ──
      let poseLatencyMs: number | undefined = undefined;
      let wristVisibilityAvg: number | undefined = undefined;
      let wristAboveShoulder: boolean | undefined = undefined;

      const poseLm = poseLandmarkerRef.current;
      if (poseLm && runPoseConcurrently) {
        const tp0 = performance.now();
        try {
          const poseRes = poseLm.detectForVideo(video, now);
          poseLatencyMs = performance.now() - tp0;

          if (poseRes.landmarks && poseRes.landmarks[0]) {
            const lms = poseRes.landmarks[0];
            const leftWrist = lms[15];
            const rightWrist = lms[16];
            const leftShoulder = lms[11];
            const rightShoulder = lms[12];

            if (leftWrist && rightWrist) {
              wristVisibilityAvg =
                ((leftWrist.visibility ?? 1) + (rightWrist.visibility ?? 1)) / 2;
            }
            if (leftWrist && leftShoulder && rightWrist && rightShoulder) {
              wristAboveShoulder =
                leftWrist.y < leftShoulder.y || rightWrist.y < rightShoulder.y;
            }
          }
        } catch {
          // Ignorar error de pose
        }
      }

      // ── Procesar y Dibujar Resultados de Manos ──
      const numDetectedHands = gestureResult.landmarks
        ? gestureResult.landmarks.length
        : 0;
      const hasHand = numDetectedHands > 0;

      let primaryPalmWidthPx: number | null = null;
      let primaryGesture: string | null = null;
      let primaryScore: number | null = null;

      if (hasHand) {
        gestureResult.landmarks.forEach((handLandmarks, i) => {
          const handednessCategory = gestureResult.handednesses?.[i]?.[0];
          const gestureCategory = gestureResult.gestures?.[i]?.[0];

          const handLabel =
            handednessCategory?.displayName ||
            handednessCategory?.categoryName ||
            `Mano ${i + 1}`;
          const topGesture = gestureCategory?.categoryName || 'None';
          const topScore = gestureCategory?.score || 0;

          if (i === 0) {
            primaryGesture = topGesture;
            primaryScore = topScore;
          }

          // Ancho de palma (landmark 5 -> 17)
          const lm5 = handLandmarks[5];
          const lm17 = handLandmarks[17];
          let palmWidthPx = 0;
          if (lm5 && lm17) {
            palmWidthPx = calculatePalmWidth(lm5, lm17, canvas.width, canvas.height);
            if (i === 0) primaryPalmWidthPx = palmWidthPx;
          }

          // 1. Dibujar conexiones (espejadas en X: screenX = (1 - x) * width)
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#00F0FF';
          ctx.lineCap = 'round';

          GestureRecognizer.HAND_CONNECTIONS.forEach((conn) => {
            const p1 = handLandmarks[conn.start];
            const p2 = handLandmarks[conn.end];
            if (p1 && p2) {
              ctx.beginPath();
              ctx.moveTo((1 - p1.x) * canvas.width, p1.y * canvas.height);
              ctx.lineTo((1 - p2.x) * canvas.width, p2.y * canvas.height);
              ctx.stroke();
            }
          });

          // 2. Dibujar línea específica de palma (5 -> 17 en amarillo neón)
          if (lm5 && lm17) {
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#FFE600';
            ctx.beginPath();
            ctx.moveTo((1 - lm5.x) * canvas.width, lm5.y * canvas.height);
            ctx.lineTo((1 - lm17.x) * canvas.width, lm17.y * canvas.height);
            ctx.stroke();
          }

          // 3. Dibujar puntos de landmarks
          handLandmarks.forEach((lm) => {
            const sx = (1 - lm.x) * canvas.width;
            const sy = lm.y * canvas.height;
            ctx.beginPath();
            ctx.arc(sx, sy, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#E31837';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          });

          // 4. Bounding box de la mano y etiqueta
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          handLandmarks.forEach((lm) => {
            const sx = (1 - lm.x) * canvas.width;
            const sy = lm.y * canvas.height;
            if (sx < minX) minX = sx;
            if (sx > maxX) maxX = sx;
            if (sy < minY) minY = sy;
            if (sy > maxY) maxY = sy;
          });

          const pad = 14;
          const boxX = Math.max(0, minX - pad);
          const boxY = Math.max(0, minY - pad);
          const boxW = Math.min(canvas.width - boxX, maxX - minX + pad * 2);
          const boxH = Math.min(canvas.height - boxY, maxY - minY + pad * 2);

          ctx.lineWidth = 2;
          ctx.strokeStyle = '#00F0FF';
          ctx.strokeRect(boxX, boxY, boxW, boxH);

          // Etiqueta superior
          const labelText = `${handLabel}: ${topGesture} (${(topScore * 100).toFixed(0)}%) · Palma ${palmWidthPx.toFixed(0)}px`;
          ctx.font = 'bold 15px "JetBrains Mono", monospace';
          const textMetrics = ctx.measureText(labelText);
          const labelW = textMetrics.width + 16;
          const labelH = 26;
          const labelY = Math.max(0, boxY - labelH - 4);

          ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
          ctx.fillRect(boxX, labelY, labelW, labelH);
          ctx.strokeStyle = '#00F0FF';
          ctx.strokeRect(boxX, labelY, labelW, labelH);

          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(labelText, boxX + 8, labelY + 18);
        });
      }

      // ── Registrar Muestra en Buffers ──
      const sample: HandFrameSample = {
        timestamp: now,
        hasHand,
        palmWidthPx: primaryPalmWidthPx,
        gesture: primaryGesture,
        gestureScore: primaryScore,
        gestureLatencyMs,
        poseActive: runPoseConcurrently,
        poseLatencyMs,
        wristAboveShoulder,
        wristVisibilityAvg,
      };

      samplesRef.current.push(sample);

      // Si estamos grabando los 10 s, añadir a la muestra de prueba
      if (recordingSamplesRef.current !== null) {
        recordingSamplesRef.current.push(sample);
      }
    }

    animationFrameId = requestAnimationFrame(processLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [videoRef, fpsTarget, modelLoading, runPoseConcurrently]);

  // ── Actualizar Métricas en Vivo de Ventana Móvil (cada 250 ms) ──
  useEffect(() => {
    const timer = setInterval(() => {
      const now = performance.now();
      // Filtrar a últimos 5000 ms
      samplesRef.current = filterSlidingWindow(samplesRef.current, now, 5000);
      videoTimestampsRef.current = filterSlidingWindow(
        videoTimestampsRef.current.map((t) => ({ timestamp: t })),
        now,
        5000,
      ).map((o) => o.timestamp);

      const samples = samplesRef.current;
      const vTimestamps = videoTimestampsRef.current;

      const videoFps = calculateFpsFromTimestamps(vTimestamps, 5000);
      const gestureFps = calculateFpsFromTimestamps(
        samples.map((s) => s.timestamp),
        5000,
      );

      const poseSamples = samples.filter(
        (s) => s.poseActive && s.poseLatencyMs !== undefined,
      );
      const poseFps =
        poseSamples.length > 0
          ? calculateFpsFromTimestamps(
              poseSamples.map((s) => s.timestamp),
              5000,
            )
          : null;

      const gestureLatencies = samples.map((s) => s.gestureLatencyMs);
      const gestureAvgMs = average(gestureLatencies);
      const gestureP95Ms = p95(gestureLatencies);

      const poseLatencies = poseSamples.map((s) => s.poseLatencyMs!);
      const poseAvgMs = poseSamples.length > 0 ? average(poseLatencies) : null;
      const poseP95Ms = poseSamples.length > 0 ? p95(poseLatencies) : null;

      const detectionRate = calculateDetectionRate(samples);
      const dominant = getDominantGesture(samples);

      const palms = samples
        .map((s) => s.palmWidthPx)
        .filter((w): w is number => w !== null && w > 0);
      const avgPalmWidthPx = average(palms);

      const wristVis = poseSamples
        .map((s) => s.wristVisibilityAvg)
        .filter((v): v is number => v !== undefined);
      const wristVisibilityAvg = wristVis.length > 0 ? average(wristVis) : null;

      const aboveList = poseSamples
        .map((s) => s.wristAboveShoulder)
        .filter((a): a is boolean => a !== undefined);
      const wristAboveShoulder =
        aboveList.length > 0 ? aboveList[aboveList.length - 1] : null;

      setMetrics({
        videoFps,
        gestureFps,
        poseFps,
        gestureAvgMs,
        gestureP95Ms,
        poseAvgMs,
        poseP95Ms,
        detectionRate,
        dominantGesture: dominant ? dominant.gesture : null,
        dominantScore: dominant ? dominant.avgScore : 0,
        avgPalmWidthPx,
        wristVisibilityAvg,
        wristAboveShoulder: wristAboveShoulder ?? null,
      });
    }, 250);

    return () => clearInterval(timer);
  }, []);

  // ── Controlador de Grabación de 10 s ──
  const startRecording = useCallback(() => {
    if (recordingState !== 'idle') return;

    setRecordingState('countdown');
    setCountdownNum(3);

    let count = 3;
    const countTimer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdownNum(count);
      } else {
        clearInterval(countTimer);
        // Iniciar grabación de 10s
        setRecordingState('recording');
        setRecordSecondsLeft(10);
        recordingSamplesRef.current = [];

        let secs = 10;
        const recTimer = setInterval(() => {
          secs -= 1;
          if (secs > 0) {
            setRecordSecondsLeft(secs);
          } else {
            clearInterval(recTimer);
            // Finalizar grabación y compilar registro
            const recorded = recordingSamplesRef.current;
            recordingSamplesRef.current = [];
            setRecordingState('idle');

            const camLabel =
              availableDevices.find((d) => d.deviceId === selectedCameraId)?.label ||
              settings?.deviceId ||
              'Cámara';
            const resStr = settings
              ? `${settings.width || '?'}×${settings.height || '?'}`
              : 'Desconocida';

            const detRate = calculateDetectionRate(recorded);
            const matchR = calculateMatchRate(recorded, testGesture);
            const validScores = recorded
              .map((r) => r.gestureScore)
              .filter((s): s is number => s !== null);
            const avgSc = average(validScores);

            const palms = recorded
              .map((r) => r.palmWidthPx)
              .filter((p): p is number => p !== null && p > 0);
            const avgPalm = average(palms);

            const gTimestamps = recorded.map((r) => r.timestamp);
            const gFps = calculateFpsFromTimestamps(gTimestamps, 10000);

            const pSamples = recorded.filter(
              (r) => r.poseActive && r.poseLatencyMs !== undefined,
            );
            const pFps =
              pSamples.length > 0
                ? calculateFpsFromTimestamps(
                    pSamples.map((r) => r.timestamp),
                    10000,
                  )
                : null;

            const gLats = recorded.map((r) => r.gestureLatencyMs);
            const gP95 = p95(gLats);

            const pLats = pSamples.map((r) => r.poseLatencyMs!);
            const pP95 = pSamples.length > 0 ? p95(pLats) : null;

            const threshStr = `det:${minDetectionConf}, pres:${minPresenceConf}, trk:${minTrackingConf}`;

            const newRecord: DiagHandRecord = {
              id: `rec-${Date.now()}`,
              timestamp: Date.now(),
              camera: camLabel,
              resolution: resStr,
              distance: testDistance,
              requestedGesture: testGesture,
              detectionRate: detRate,
              matchRate: matchR,
              avgScore: avgSc,
              avgPalmWidthPx: avgPalm,
              gestureFps: gFps,
              poseFps: pFps,
              gestureLatencyP95: gP95,
              poseLatencyP95: pP95,
              delegate,
              thresholds: threshStr,
            };

            setRecords((prev) => [newRecord, ...prev]);
          }
        }, 1000);
      }
    }, 1000);
  }, [
    recordingState,
    availableDevices,
    selectedCameraId,
    settings,
    testGesture,
    testDistance,
    minDetectionConf,
    minPresenceConf,
    minTrackingConf,
    delegate,
  ]);

  // ── Copiar y Descargar CSV ──
  const handleCopyCsv = useCallback(() => {
    const csv = recordsToCsv(records);
    navigator.clipboard.writeText(csv).then(() => {
      setCopiedCsv(true);
      setTimeout(() => setCopiedCsv(false), 2000);
    });
  }, [records]);

  const handleDownloadCsv = useCallback(() => {
    const csv = recordsToCsv(records);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `suzuki-diag-mano-${dateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [records]);

  const handleClearRecords = useCallback(() => {
    if (window.confirm('¿Seguro que deseas borrar todos los registros de prueba?')) {
      setRecords([]);
      try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch {
        // Ignorar
      }
    }
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-fg select-none font-sans">
      {/* ── Columna Principal: Video Espejado + Canvas Overlay ── */}
      <main className="relative flex-1 h-full bg-black flex flex-col items-center justify-center overflow-hidden">
        {/* Banner de Instrucción visible */}
        <div className="absolute top-4 left-6 right-6 z-20 pointer-events-none flex justify-center">
          <div className="bg-surface/90 border border-line text-white px-6 py-2.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-red animate-pulse" />
            <span className="font-semibold text-sm sm:text-base tracking-wide">
              Párate en la marca del piso. Elige distancia y gesto, pulsa Grabar 10 s y
              mantén el gesto con la mano a la altura del pecho.
            </span>
          </div>
        </div>

        {/* Video y Canvas de Detección */}
        <div className="relative w-full h-full flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
            style={{ transform: 'scaleX(-1)' }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />

          {/* Overlay de Carga o Error de Modelos */}
          {modelLoading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3 text-cyan-400">
                <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-sm tracking-widest uppercase">
                  Cargando modelos MediaPipe ({delegate})...
                </span>
              </div>
            </div>
          )}

          {modelError && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10 p-6 text-center">
              <div className="bg-surface border border-brand-red p-6 rounded-lg max-w-md">
                <span className="text-brand-red font-bold block mb-2">
                  Error MediaPipe
                </span>
                <span className="text-sm text-fg-muted font-mono">{modelError}</span>
              </div>
            </div>
          )}

          {/* Overlay de Cuenta Regresiva de Grabación */}
          {recordingState === 'countdown' && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-30 pointer-events-none">
              <div className="flex flex-col items-center animate-bounce">
                <span className="font-display text-9xl text-brand-red drop-shadow-2xl">
                  {countdownNum}
                </span>
                <span className="font-mono text-xl tracking-widest uppercase text-white mt-4">
                  Prepárate...
                </span>
              </div>
            </div>
          )}

          {/* Indicador de Grabación Activa */}
          {recordingState === 'recording' && (
            <div className="absolute top-20 left-6 z-20 bg-brand-red/90 text-white font-mono px-5 py-2.5 rounded-lg shadow-xl flex items-center gap-3 border border-white/30 animate-pulse">
              <span className="w-3 h-3 rounded-full bg-white animate-ping" />
              <span className="font-bold text-lg">
                GRABANDO: {recordSecondsLeft}s restantes
              </span>
            </div>
          )}

          {/* HUD de Métricas en Vivo Superior-Izquierdo */}
          <div className="absolute bottom-6 left-6 z-20 bg-surface/85 backdrop-blur-md border border-line p-4 rounded-lg font-mono text-xs text-white max-w-sm pointer-events-none space-y-1.5 shadow-2xl">
            <div className="flex justify-between gap-6 border-b border-line pb-1 text-cyan-400 font-bold">
              <span>MÉTRICAS (5s)</span>
              <span>
                {settings?.width ? `${settings.width}×${settings.height}` : 'Cámara'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">FPS Video / Gesto:</span>
              <span className="font-bold">
                {metrics.videoFps.toFixed(1)} / {metrics.gestureFps.toFixed(1)}
              </span>
            </div>
            {metrics.poseFps !== null && (
              <div className="flex justify-between">
                <span className="text-fg-muted">FPS Pose:</span>
                <span className="font-bold text-amber-400">
                  {metrics.poseFps.toFixed(1)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-fg-muted">Gesto Latencia (avg/p95):</span>
              <span className="font-bold">
                {metrics.gestureAvgMs.toFixed(1)} ms / {metrics.gestureP95Ms.toFixed(1)}{' '}
                ms
              </span>
            </div>
            {metrics.poseAvgMs !== null && (
              <div className="flex justify-between">
                <span className="text-fg-muted">Pose Latencia (avg/p95):</span>
                <span className="font-bold text-amber-400">
                  {metrics.poseAvgMs.toFixed(1)} ms / {metrics.poseP95Ms?.toFixed(1)} ms
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-fg-muted">Tasa Detección Mano:</span>
              <span
                className={`font-bold ${metrics.detectionRate >= 80 ? 'text-green-400' : 'text-amber-400'}`}
              >
                {metrics.detectionRate.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">Gesto dominante:</span>
              <span className="font-bold text-cyan-300">
                {metrics.dominantGesture
                  ? `${metrics.dominantGesture} (${(metrics.dominantScore * 100).toFixed(0)}%)`
                  : 'Ninguno'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">Ancho de palma prom.:</span>
              <span className="font-bold text-yellow-300">
                {metrics.avgPalmWidthPx > 0
                  ? `${metrics.avgPalmWidthPx.toFixed(1)} px`
                  : '0 px'}
              </span>
            </div>
            {metrics.wristVisibilityAvg !== null && (
              <div className="flex justify-between border-t border-line/60 pt-1">
                <span className="text-fg-muted">Muñecas (vis / arriba):</span>
                <span className="font-bold text-purple-300">
                  {(metrics.wristVisibilityAvg * 100).toFixed(0)}% ·{' '}
                  {metrics.wristAboveShoulder ? 'ARRIBA' : 'ABAJO'}
                </span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Panel Lateral: Controles y Registro Técnico ── */}
      <aside className="w-[480px] h-full bg-surface border-l border-line flex flex-col z-20 shadow-2xl">
        <header className="p-4 border-b border-line flex items-center justify-between bg-surface-2/40">
          <div>
            <h1 className="font-display text-2xl tracking-wide text-white uppercase leading-none">
              Diagnóstico Gestos
            </h1>
            <span className="text-xs font-mono text-fg-muted">
              Evaluación de alcance y latencia
            </span>
          </div>
          <span className="px-2 py-0.5 text-[10px] font-mono uppercase rounded bg-brand-red text-white font-bold">
            Fase 2 Prep
          </span>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
          {/* 1. Selector de Cámara */}
          <section className="space-y-2 bg-surface-2/30 p-3.5 rounded-lg border border-line">
            <label className="block text-xs font-mono font-bold uppercase tracking-wider text-fg-muted">
              Cámara Activa
            </label>
            <select
              value={selectedCameraId ?? settings?.deviceId ?? ''}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="w-full bg-surface border border-line rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
            >
              {availableDevices.map((dev) => (
                <option key={dev.deviceId} value={dev.deviceId}>
                  {dev.label}
                </option>
              ))}
            </select>
            <div className="flex justify-between items-center text-xs font-mono text-fg-muted pt-1">
              <span>
                Resolución: {settings?.width ?? '?'}×{settings?.height ?? '?'}
              </span>
              <span>{settings?.frameRate ? `${settings.frameRate} fps` : ''}</span>
              <button
                type="button"
                onClick={retry}
                className="text-cyan-400 underline hover:text-cyan-300"
              >
                Reiniciar
              </button>
            </div>
          </section>

          {/* 2. Parámetros del Reconocedor */}
          <section className="space-y-3 bg-surface-2/30 p-3.5 rounded-lg border border-line">
            <span className="block text-xs font-mono font-bold uppercase tracking-wider text-fg-muted">
              Parámetros de Inferencia
            </span>

            {/* Slider minHandDetectionConfidence */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span>Detección Mínima:</span>
                <span className="font-bold text-cyan-400">
                  {minDetectionConf.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.3"
                max="0.9"
                step="0.05"
                value={minDetectionConf}
                onChange={(e) => setMinDetectionConf(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Slider minHandPresenceConfidence */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span>Presencia Mínima:</span>
                <span className="font-bold text-cyan-400">
                  {minPresenceConf.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.3"
                max="0.9"
                step="0.05"
                value={minPresenceConf}
                onChange={(e) => setMinPresenceConf(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Slider minTrackingConfidence */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span>Tracking Mínimo:</span>
                <span className="font-bold text-cyan-400">
                  {minTrackingConf.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.3"
                max="0.9"
                step="0.05"
                value={minTrackingConf}
                onChange={(e) => setMinTrackingConf(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Fila: numHands y delegate */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-mono text-fg-muted mb-1">
                  Manos a detectar
                </label>
                <div className="flex rounded border border-line overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setNumHands(1)}
                    className={`flex-1 py-1 text-xs font-mono font-bold ${numHands === 1 ? 'bg-cyan-600 text-white' : 'bg-surface text-fg-muted'}`}
                  >
                    1 Mano
                  </button>
                  <button
                    type="button"
                    onClick={() => setNumHands(2)}
                    className={`flex-1 py-1 text-xs font-mono font-bold ${numHands === 2 ? 'bg-cyan-600 text-white' : 'bg-surface text-fg-muted'}`}
                  >
                    2 Manos
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-fg-muted mb-1">
                  Delegate
                </label>
                <div className="flex rounded border border-line overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDelegate('GPU')}
                    className={`flex-1 py-1 text-xs font-mono font-bold ${delegate === 'GPU' ? 'bg-cyan-600 text-white' : 'bg-surface text-fg-muted'}`}
                  >
                    GPU
                  </button>
                  <button
                    type="button"
                    onClick={() => setDelegate('CPU')}
                    className={`flex-1 py-1 text-xs font-mono font-bold ${delegate === 'CPU' ? 'bg-cyan-600 text-white' : 'bg-surface text-fg-muted'}`}
                  >
                    CPU
                  </button>
                </div>
              </div>
            </div>

            {/* Frecuencia de inferencia */}
            <div>
              <label className="block text-[11px] font-mono text-fg-muted mb-1">
                Frecuencia inferencia gesto
              </label>
              <div className="flex rounded border border-line overflow-hidden">
                {(['max', '15', '10'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFpsTarget(mode)}
                    className={`flex-1 py-1 text-xs font-mono ${fpsTarget === mode ? 'bg-cyan-600 text-white font-bold' : 'bg-surface text-fg-muted'}`}
                  >
                    {mode === 'max' ? 'Cada Frame' : `${mode} FPS`}
                  </button>
                ))}
              </div>
            </div>

            {/* Interruptor Pose simultáneo */}
            <div className="pt-2 border-t border-line/60 flex items-center justify-between">
              <label
                htmlFor="pose-toggle"
                className="text-xs font-mono text-white cursor-pointer"
              >
                Correr PoseLandmarker al mismo tiempo
              </label>
              <input
                id="pose-toggle"
                type="checkbox"
                checked={runPoseConcurrently}
                onChange={(e) => setRunPoseConcurrently(e.target.checked)}
                className="w-4 h-4 accent-amber-400 cursor-pointer"
              />
            </div>
          </section>

          {/* 3. Panel de Grabación de Prueba */}
          <section className="space-y-3 bg-surface-2/30 p-3.5 rounded-lg border border-line">
            <span className="block text-xs font-mono font-bold uppercase tracking-wider text-fg-muted">
              Prueba Controlada (10 s)
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-fg-muted mb-1">
                  Distancia (m)
                </label>
                <input
                  type="number"
                  min="0.5"
                  max="5.0"
                  step="0.25"
                  value={testDistance}
                  onChange={(e) => setTestDistance(parseFloat(e.target.value) || 0)}
                  className="w-full bg-surface border border-line rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-brand-red"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-fg-muted mb-1">
                  Gesto a evaluar
                </label>
                <select
                  value={testGesture}
                  onChange={(e) =>
                    setTestGesture(
                      e.target.value as
                        | 'Palma abierta'
                        | 'Puño'
                        | 'Índice arriba'
                        | 'Mano bajada',
                    )
                  }
                  className="w-full bg-surface border border-line rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-brand-red"
                >
                  <option value="Palma abierta">Palma abierta</option>
                  <option value="Puño">Puño</option>
                  <option value="Índice arriba">Índice arriba</option>
                  <option value="Mano bajada">Mano bajada</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              disabled={recordingState !== 'idle' || modelLoading}
              onClick={startRecording}
              className={`w-full py-2.5 rounded font-mono font-bold uppercase tracking-wider text-sm transition-all shadow-md ${
                recordingState === 'idle' && !modelLoading
                  ? 'bg-brand-red hover:bg-brand-red/90 text-white cursor-pointer active:scale-98'
                  : 'bg-surface-2 text-fg-muted cursor-not-allowed opacity-60'
              }`}
            >
              {recordingState === 'countdown'
                ? `Iniciando en ${countdownNum}...`
                : recordingState === 'recording'
                  ? `Muestreando (${recordSecondsLeft}s)...`
                  : 'Grabar 10 s'}
            </button>
          </section>

          {/* 4. Tabla de Registros y Exportación */}
          <section className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                Resultados Guardados ({records.length})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyCsv}
                  disabled={records.length === 0}
                  className="px-2.5 py-1 rounded bg-surface border border-line text-xs font-mono text-cyan-400 hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  {copiedCsv ? '¡Copiado!' : 'Copiar CSV'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  disabled={records.length === 0}
                  className="px-2.5 py-1 rounded bg-surface border border-line text-xs font-mono text-cyan-400 hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  Descargar
                </button>
                <button
                  type="button"
                  onClick={handleClearRecords}
                  disabled={records.length === 0}
                  className="px-2 py-1 rounded bg-surface border border-line text-xs font-mono text-brand-red hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  Borrar
                </button>
              </div>
            </div>

            {records.length === 0 ? (
              <div className="text-center py-6 text-xs font-mono text-fg-muted border border-dashed border-line rounded">
                Sin registros guardados. Pulsa "Grabar 10 s" para iniciar una prueba.
              </div>
            ) : (
              <div className="border border-line rounded-lg overflow-x-auto max-h-56 bg-surface-2/20">
                <table className="w-full text-left font-mono text-[11px] whitespace-nowrap">
                  <thead className="bg-surface-2/80 text-fg-muted uppercase sticky top-0 border-b border-line">
                    <tr>
                      <th className="p-2">Dist</th>
                      <th className="p-2">Gesto</th>
                      <th className="p-2">Det %</th>
                      <th className="p-2">Match %</th>
                      <th className="p-2">Palma</th>
                      <th className="p-2">FPS G</th>
                      <th className="p-2">P95 G</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/40">
                    {records.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-2/40">
                        <td className="p-2 text-white font-bold">{r.distance}m</td>
                        <td className="p-2 text-cyan-300">{r.requestedGesture}</td>
                        <td className="p-2">{r.detectionRate.toFixed(1)}%</td>
                        <td className="p-2 text-green-400">{r.matchRate.toFixed(1)}%</td>
                        <td className="p-2 text-yellow-300">
                          {r.avgPalmWidthPx.toFixed(0)}px
                        </td>
                        <td className="p-2">{r.gestureFps.toFixed(1)}</td>
                        <td className="p-2">{r.gestureLatencyP95.toFixed(1)}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

export default DiagHandPage;
