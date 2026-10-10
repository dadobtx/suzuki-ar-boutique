import { useState, useEffect } from 'react';
import { isDebugMode } from '@/lib/debug-mode';
import { getDebugLogs, type DebugLogEntry } from '@/lib/debug-logger';
import { debugTelemetry } from '@/lib/debug-mediapipe';
import { useCameraStore } from '@/store/camera';
import { useKioskStore } from '@/store/kiosk';
import {
  PRESENCE_ARRIVING_THRESHOLD,
  PRESENCE_LEAVING_THRESHOLD,
  PRESENCE_LANDMARK_INDICES,
} from '@/hooks/usePresence';
import { usePwaStore } from '@/lib/pwa-update';
import { useHandCursorStore } from '@/store/handCursor';
import { isHandInputEnabled } from '@/lib/hand-input-flag';

function HandGesturesTelemetryCard() {
  const cursor = useHandCursorStore.getState().cursor;
  const pausedUntilMs = useHandCursorStore.getState().pausedUntilMs;
  const pauseOrigin = useHandCursorStore.getState().pauseOrigin;
  const detectedHandsCount = useHandCursorStore.getState().detectedHandsCount;
  const userHandsCount = useHandCursorStore.getState().userHandsCount;
  const inferenceFps = useHandCursorStore.getState().inferenceFps;
  const gestureLatencyP95 = useHandCursorStore.getState().gestureLatencyP95;
  const adaptiveTargetFps = useHandCursorStore.getState().adaptiveTargetFps;
  const p95 = useHandCursorStore.getState().p95;

  const rawBlockedReason =
    cursor.stepBlockedReason ?? (cursor.active ? 'ninguno' : 'sin cursor');
  let blockedReason: string = rawBlockedReason;
  if (rawBlockedReason === 'pausado (táctil)' && pausedUntilMs > Date.now()) {
    const remainingSec = Math.max(0, (pausedUntilMs - Date.now()) / 1000).toFixed(1);
    const originText = pauseOrigin ?? 'touch';
    blockedReason = `pausado (táctil: ${originText}, ${remainingSec} s)`;
  }
  const dVal =
    cursor.displacement !== undefined ? cursor.displacement.toFixed(2) : '0.00';
  const offSwVal =
    cursor.anchorOffsetSw !== null && cursor.anchorOffsetSw !== undefined
      ? cursor.anchorOffsetSw.toFixed(2)
      : 'N/A';
  const swVal =
    cursor.swWidth !== null && cursor.swWidth !== undefined
      ? cursor.swWidth.toFixed(2)
      : 'N/A';

  return (
    <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/60">
      <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
        🖐️ Gestos & Mano
      </div>
      <div>
        <span className="text-zinc-400">Paso bloqueado por: </span>
        <span
          className={
            blockedReason === 'ninguno'
              ? 'text-emerald-400 font-bold'
              : 'text-amber-300 font-bold'
          }
        >
          {blockedReason}
        </span>
      </div>
      <div>
        <span className="text-zinc-400">Métricas paso: </span>
        <span className="text-cyan-300 font-mono">
          d: {dVal} · offSw: {offSwVal} · sw: {swVal}
        </span>
      </div>
      <div>
        <span className="text-zinc-400">Cursor: </span>
        <span
          className={
            cursor.active ? 'text-emerald-400 font-bold' : 'text-zinc-500 font-bold'
          }
        >
          {cursor.active ? 'ACTIVO' : 'INACTIVO'}
        </span>
      </div>
      <div>
        <span className="text-zinc-400">Índice: </span>
        <span className="text-zinc-200 font-mono">{cursor.index}</span>
      </div>
      <div>
        <span className="text-zinc-400">Progreso confirmación: </span>
        <span className="text-emerald-300 font-mono font-bold">
          {((cursor.confirmProgress ?? cursor.dwellProgress) * 100).toFixed(0)}%
        </span>
      </div>
      <div>
        <span className="text-zinc-400">Palanca (d / estado): </span>
        <span className="text-cyan-300 font-mono">
          {dVal} (
          {cursor.leverState === 'neutral'
            ? 'neutra'
            : cursor.leverState?.startsWith('fast')
              ? 'rápido'
              : 'lento'}
          )
        </span>
      </div>
      <div>
        <span className="text-zinc-400">Ancla x: </span>
        <span className="text-zinc-200 font-mono">
          {cursor.anchorX !== null && cursor.anchorX !== undefined
            ? cursor.anchorX.toFixed(3)
            : 'N/A'}
        </span>
      </div>
      <div>
        <span className="text-zinc-400">Dueño match: </span>
        <span className="text-emerald-300 font-mono">
          {cursor.ownerReason === 'wrist'
            ? 'por muñeca'
            : cursor.ownerReason === 'continuity'
              ? 'por continuidad'
              : cursor.ownerReason === 'box'
                ? 'por recuadro'
                : 'ninguno'}
        </span>
      </div>
      <div>
        <span className="text-zinc-400">Mano activa: </span>
        <span className="text-amber-300 font-mono">
          {cursor.activeHandSide === 'Left'
            ? 'Izq'
            : cursor.activeHandSide === 'Right'
              ? 'Der'
              : 'Ninguna'}{' '}
          (cambios: {cursor.handSwitchCount ?? 0})
        </span>
      </div>
      <div>
        <span className="text-zinc-400">Gesto: </span>
        <span className="text-zinc-200 font-mono">{cursor.gesture}</span>
      </div>
      <div>
        <span className="text-zinc-400">Lado (pose / clasificador): </span>
        <span className="text-amber-300 font-mono">
          {cursor.poseSide ?? 'None'} / {cursor.classifierSide ?? 'None'}
        </span>
      </div>
      <div>
        <span className="text-zinc-400">Índice: </span>
        <span className="text-cyan-300 font-mono">{cursor.indexSource ?? 'ninguno'}</span>
      </div>
      <div>
        <span className="text-zinc-400">Manos (Total / Usuario): </span>
        <span className="text-zinc-200 font-medium">
          {detectedHandsCount} / {userHandsCount}
        </span>
      </div>
      <div>
        <span className="text-zinc-400">Estado manos: </span>
        <span className="text-amber-300 font-mono text-[11px]">
          {cursor.handsRaisedSummary ?? 'ninguna'}
        </span>
      </div>
      <div>
        <span className="text-zinc-400">FPS Gesto: </span>
        <span className="text-emerald-300 font-bold">{inferenceFps}</span>
      </div>
      <div>
        <span className="text-zinc-400">Latencia gesto p95: </span>
        <span className="text-emerald-300 font-mono">{gestureLatencyP95 ?? 0} ms</span>
      </div>
      <div>
        <span className="text-zinc-400">Frecuencia adaptativa: </span>
        <span className="text-zinc-200 font-medium">
          {adaptiveTargetFps === 'auto'
            ? 'Auto (cada frame)'
            : `${adaptiveTargetFps} fps`}
        </span>
      </div>
      <div>
        <span className="text-zinc-400">p95 Combinado (Pose+Gesto): </span>
        <span className="text-amber-300 font-mono">{p95} ms</span>
      </div>
    </div>
  );
}

function DiagnosticOverlayInner() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [, setTick] = useState(0);

  // Poll state every 500 ms
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => (t + 1) % 1000000);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // 1. Camera store state
  const cam = useCameraStore.getState();
  const phaseDurationSec = ((Date.now() - cam.phaseStartTime) / 1000).toFixed(1);

  // 2. Active video element inspection
  let videoEl: HTMLVideoElement | null = null;
  if (typeof document !== 'undefined') {
    const allVideos = Array.from(document.querySelectorAll('video'));
    videoEl = allVideos.find((v) => v.srcObject !== null) || allVideos[0] || null;
  }

  // 3. MediaPipe & Pose telemetry
  const mp = debugTelemetry.mediapipe;
  const mpDurationSec = ((Date.now() - mp.statusStartTime) / 1000).toFixed(1);

  // 4. Presence telemetry & Kiosk
  const presence = debugTelemetry.presence;
  const kioskState = useKioskStore.getState().state;

  // 5. Captured logs (max 50, newest first)
  const logs = getDebugLogs();
  const updatePending = usePwaStore((s) => s.updatePending);

  const getLogLevelClass = (level: DebugLogEntry['level']) => {
    switch (level) {
      case 'error':
      case 'window.error':
      case 'unhandledrejection':
        return 'text-red-400 font-semibold';
      case 'warn':
        return 'text-amber-300';
      case 'log':
      default:
        return 'text-zinc-400';
    }
  };

  return (
    <div
      data-debug-overlay="true"
      id="debug-overlay"
      className="fixed top-0 left-0 right-0 z-[999999] pointer-events-none p-2 flex flex-col items-start select-none"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      }}
    >
      {/* Header bar with toggle button */}
      <div className="pointer-events-auto flex items-center justify-between gap-3 px-3 py-1 bg-black/85 border border-zinc-700/80 rounded shadow-lg text-[12px] text-white">
        <span className="flex items-center gap-1.5 font-bold tracking-wider text-emerald-400">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          DIAGNOSTIC OVERLAY
        </span>
        <span className="text-zinc-400 text-[11px]">
          {__GIT_SHA__.slice(0, 7)} · {__BUILD_DATE__}
        </span>
        {updatePending && (
          <span className="text-amber-400 font-bold text-[11px] animate-pulse">
            actualización pendiente
          </span>
        )}
        <span className="text-zinc-400 text-[11px]">?debug=1 active</span>
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="ml-2 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-600 text-zinc-200 hover:text-white rounded text-[11px] transition-colors"
        >
          {isCollapsed ? '▼ Mostrar todo' : '▲ Contraer'}
        </button>
      </div>

      {/* Panel Gestos & Mano visible aunque el resto esté contraído (§3.4) */}
      {isCollapsed && isHandInputEnabled() && (
        <div className="pointer-events-none mt-1 max-w-sm w-full bg-black/85 border border-zinc-700/80 rounded shadow-xl overflow-hidden">
          <HandGesturesTelemetryCard />
        </div>
      )}

      {/* Main panel */}
      {!isCollapsed && (
        <div className="pointer-events-none mt-1 w-full max-h-[45vh] bg-black/75 border border-zinc-700/70 rounded-md text-white text-[12px] leading-snug flex flex-col overflow-hidden shadow-2xl">
          {/* Top telemetry grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 p-2 border-b border-zinc-800/80 overflow-y-auto">
            {/* 1. Camera Info */}
            <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/60">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                📷 Camera
              </div>
              <div>
                <span className="text-zinc-400">Phase: </span>
                <span
                  className={
                    cam.phase === 'error'
                      ? 'text-red-400 font-bold'
                      : cam.phase === 'ready'
                        ? 'text-emerald-400 font-bold'
                        : 'text-amber-300 font-bold'
                  }
                >
                  {cam.phase}
                </span>{' '}
                <span className="text-zinc-500">({phaseDurationSec}s)</span>
              </div>
              {cam.phaseError && (
                <div className="text-red-400 text-[11px] truncate">
                  Err: [{cam.phaseError.name}] {cam.phaseError.message}
                </div>
              )}
              <div className="text-zinc-300 truncate">
                <span className="text-zinc-400">Selected ID: </span>
                {cam.deviceId ? `${cam.deviceId.slice(0, 12)}...` : 'none'}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                <div className="text-zinc-500">
                  Devices ({cam.availableDevices.length}):
                </div>
                {cam.availableDevices.length === 0 ? (
                  <div className="italic text-zinc-600">None enumerated</div>
                ) : (
                  cam.availableDevices.map((d) => (
                    <div key={d.deviceId} className="truncate text-zinc-300">
                      • {d.label || 'Camera'} [{d.deviceId.slice(0, 8)}...]
                    </div>
                  ))
                )}
              </div>
              {cam.settings && (
                <div className="text-[11px] text-zinc-400 mt-1 border-t border-zinc-800/60 pt-1">
                  <div>
                    Track: {cam.settings.width ?? '?'}x{cam.settings.height ?? '?'} @{' '}
                    {cam.settings.frameRate ? Math.round(cam.settings.frameRate) : '?'}fps
                  </div>
                  <div>Facing: {cam.settings.facingMode ?? 'unknown'}</div>
                </div>
              )}
            </div>

            {/* 2. Video Element */}
            <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/60">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                🎥 Video Element
              </div>
              {videoEl ? (
                <>
                  <div>
                    <span className="text-zinc-400">readyState: </span>
                    <span
                      className={
                        videoEl.readyState >= 2
                          ? 'text-emerald-400 font-semibold'
                          : 'text-amber-400'
                      }
                    >
                      {videoEl.readyState}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400">Dimensions: </span>
                    <span className="text-zinc-200">
                      {videoEl.videoWidth} × {videoEl.videoHeight}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400">Paused: </span>
                    <span
                      className={videoEl.paused ? 'text-amber-400' : 'text-emerald-400'}
                    >
                      {videoEl.paused ? 'YES' : 'NO'}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    <span className="text-zinc-500">has srcObject: </span>
                    {videoEl.srcObject ? 'YES' : 'NO'}
                  </div>
                </>
              ) : (
                <div className="text-zinc-500 italic">No video element mounted</div>
              )}
            </div>

            {/* 3. MediaPipe & Inferencia */}
            <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/60">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                🤖 MediaPipe
              </div>
              <div>
                <span className="text-zinc-400">Status: </span>
                <span
                  className={
                    mp.status === 'ready'
                      ? 'text-emerald-400 font-bold'
                      : mp.status === 'error'
                        ? 'text-red-400 font-bold'
                        : 'text-amber-300 font-bold'
                  }
                >
                  {mp.status}
                </span>{' '}
                <span className="text-zinc-500">({mpDurationSec}s)</span>
              </div>
              <div>
                <span className="text-zinc-400">Delegate: </span>
                <span className="text-zinc-200 font-medium">{mp.delegate ?? 'N/A'}</span>
              </div>
              <div>
                <span className="text-zinc-400">Config: </span>
                <span className="text-cyan-300 font-mono">
                  {mp.numPoses ?? 1} {mp.numPoses === 1 ? 'pose' : 'poses'} · masks:{' '}
                  {mp.outputMasks !== false ? 'ON' : 'OFF'}
                </span>
              </div>
              <div>
                <span className="text-zinc-400">5s Window: </span>
                <span className="text-emerald-400 font-bold">
                  {mp.fps5s ?? mp.fps} fps
                </span>{' '}
                <span className="text-zinc-500">
                  (avg:{' '}
                  {mp.latencyAvg !== undefined
                    ? `${mp.latencyAvg.toFixed(1)}ms`
                    : `${mp.latency.toFixed(1)}ms`}{' '}
                  · p95:{' '}
                  {mp.latencyP95 !== undefined ? `${mp.latencyP95.toFixed(1)}ms` : 'N/A'})
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Last Latency: </span>
                <span className="text-zinc-200 font-mono">
                  {mp.latency.toFixed(1)}ms
                </span>{' '}
                <span className="text-zinc-500">({mp.fps} fps inst)</span>
              </div>
              <div>
                <span className="text-zinc-400">JS Heap: </span>
                <span className="text-zinc-200 font-mono">
                  {mp.heapUsedMB !== null && mp.heapUsedMB !== undefined
                    ? `${mp.heapUsedMB} MB`
                    : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Landmarks: </span>
                <span className="text-zinc-200 font-medium">{mp.landmarksCount}</span>
              </div>
              {mp.error && (
                <div className="text-red-400 text-[11px] truncate">Err: {mp.error}</div>
              )}
            </div>

            {/* 3.5 Hand Gestures Telemetry */}
            {isHandInputEnabled() && <HandGesturesTelemetryCard />}

            {/* 4. Presence Inputs & State */}
            <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/60">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                👤 Presence & Kiosk
              </div>
              <div>
                <span className="text-zinc-400">State: </span>
                <span
                  className={
                    presence.state === 'present'
                      ? 'text-emerald-400 font-bold'
                      : presence.state === 'arriving'
                        ? 'text-blue-400 font-bold'
                        : presence.state === 'leaving'
                          ? 'text-amber-400 font-bold'
                          : 'text-zinc-400'
                  }
                >
                  {presence.state}
                </span>
                <span className="text-zinc-500 text-[11px] ml-1.5">[{kioskState}]</span>
              </div>
              <div className="mt-0.5">
                <span className="text-zinc-400">Visibility: </span>
                <span className="text-zinc-200 font-mono">
                  {presence.rawVisibility.toFixed(3)}
                </span>{' '}
                <span className="text-zinc-500">
                  (avg: {presence.rollingAvg.toFixed(3)})
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Torso dist: </span>
                <span className="text-zinc-200">
                  {presence.torsoDistance !== null
                    ? presence.torsoDistance.toFixed(3)
                    : 'N/A'}
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 border-t border-zinc-800/60 pt-0.5">
                Umbrales: Arriving &gt; {PRESENCE_ARRIVING_THRESHOLD} | Leaving &lt;{' '}
                {PRESENCE_LEAVING_THRESHOLD} (pts: {PRESENCE_LANDMARK_INDICES.join(',')})
              </div>
            </div>
          </div>

          {/* Bottom Console Logs (scrollable, interactive) */}
          <div className="flex flex-col flex-1 min-h-0 bg-black/60">
            <div className="px-2 py-1 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
              <span className="font-semibold text-zinc-300">
                Console & Errors ({logs.length}/50)
              </span>
              <span className="text-zinc-500">Más recientes arriba</span>
            </div>
            <div className="pointer-events-auto p-2 overflow-y-auto max-h-[20vh] space-y-1 font-mono text-[11px]">
              {logs.length === 0 ? (
                <div className="text-zinc-600 italic">
                  No warnings, errors or logs captured yet.
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-1.5 leading-tight break-all"
                  >
                    <span className="text-zinc-500 shrink-0">[{log.timestamp}]</span>
                    <span
                      className={`shrink-0 uppercase font-bold text-[10px] ${getLogLevelClass(log.level)}`}
                    >
                      [{log.level}]
                    </span>
                    <span className={getLogLevelClass(log.level)}>{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Diagnostic overlay wrapper.
 * Stricly returns null if URL param ?debug=1 is not present (in search or hash).
 * Hooks and interval only run inside DiagnosticOverlayInner when debug mode is active.
 */
export function DiagnosticOverlay() {
  if (!isDebugMode()) {
    return null;
  }
  return <DiagnosticOverlayInner />;
}
