import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCameraStore } from '@/store/camera';
import { useLayout } from '@/hooks/useLayout';
import { useFps } from '@/hooks/useFps';
import { usePose } from '@/hooks/usePose';
import { usePresence } from '@/hooks/usePresence';
import { useDebugToggle } from '@/hooks/useDebugToggle';
import { HudFrame, NeonButton } from '@/components/hud';

/**
 * Diagnostics page — /#/diag.
 * Shows real-time performance, camera info, build metadata,
 * layout toggle, and JSON report export.
 */
export function DiagPage() {
  const { t } = useTranslation();
  const { layout, source, toggle } = useLayout();
  // DiagPage doesn't own the camera, so no video ref to pass directly,
  // but we can just call the hooks to get the latest info.
  const { fps, latency } = useFps();
  const camera = useCameraStore();

  const pose = usePose(); // No videoRef, just gets current worker state
  const presence = usePresence(pose.landmarks);
  const { showDebug, toggle: toggleDebug } = useDebugToggle();

  const [copied, setCopied] = useState(false);

  const isDeviceInfoHistorical = camera.status !== 'granted' && camera.deviceId !== null;

  const fpsColor =
    fps === null
      ? 'text-fg-muted'
      : fps >= 24
        ? 'text-success'
        : fps >= 18
          ? 'text-accent-yellow'
          : 'text-danger';

  const handleCopy = useCallback(async () => {
    const report = {
      build: {
        sha: __GIT_SHA__,
        date: __BUILD_DATE__,
        version: '0.1.0',
        mode: import.meta.env.MODE,
      },
      performance: { fps, latency },
      layout: { mode: layout, source },
      camera: {
        status: camera.status,
        deviceId: camera.deviceId,
        deviceLabel: camera.deviceLabel,
        settings: camera.settings,
        capabilities: camera.capabilities,
      },
      system: {
        userAgent: navigator.userAgent,
        screen: `${window.screen.width}×${window.screen.height}`,
        dpr: window.devicePixelRatio,
        viewport: `${window.innerWidth}×${window.innerHeight}`,
      },
    };

    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fps, latency, layout, source, camera]);

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-4 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl md:text-4xl text-accent-cyan">
          {t('diag.title')}
        </h1>
        <Link
          to="/"
          className="font-mono text-hud-sm text-fg-muted hover:text-accent-cyan transition-colors"
        >
          ← {t('nav.home')}
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── Performance ── */}
        <HudFrame className="p-4" variant="cyan" id="diag-perf">
          <h2 className="font-display text-xl text-accent-cyan mb-3">
            {t('diag.performance')}
          </h2>
          <div className="flex items-baseline gap-4">
            <div className={`font-mono text-5xl ${fpsColor}`}>
              {fps === null ? '--' : fps}
            </div>
            <div className="font-mono text-hud-sm text-fg-muted">{t('diag.fps')}</div>
          </div>
          <div className="mt-2 font-mono text-hud-sm text-fg-muted">
            {fps === null
              ? t('diag.cameraInactive')
              : `${t('diag.latency')}: ${latency}ms`}
          </div>
        </HudFrame>

        {/* ── Build ── */}
        <HudFrame className="p-4" variant="cyan" id="diag-build">
          <h2 className="font-display text-xl text-accent-cyan mb-3">
            {t('diag.build')}
          </h2>
          <DiagTable
            rows={[
              ['GIT_SHA', __GIT_SHA__],
              ['BUILD_DATE', __BUILD_DATE__],
              [t('diag.mode'), import.meta.env.MODE],
              ['DPR', String(window.devicePixelRatio)],
              ['SCREEN', `${window.screen.width}×${window.screen.height}`],
              ['VIEWPORT', `${window.innerWidth}×${window.innerHeight}`],
            ]}
          />
        </HudFrame>

        {/* ── Camera ── */}
        <HudFrame
          className="p-4 md:col-span-2"
          variant={camera.status === 'granted' ? 'cyan' : 'muted'}
          id="diag-camera"
        >
          <div className="flex items-center gap-3 mb-3">
            <h2 className="font-display text-xl text-accent-cyan">{t('diag.camera')}</h2>
            {isDeviceInfoHistorical && (
              <span className="font-mono text-hud-xs text-fg-muted bg-surface-2 px-2 py-0.5 rounded">
                {t('diag.lastSession')}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: device + settings */}
            <div>
              <h3 className="font-mono text-hud-sm text-accent-yellow mb-2 uppercase">
                {t('diag.settings')}
              </h3>
              <DiagTable
                rows={[
                  ['STATUS', camera.status],
                  [t('diag.deviceId'), camera.deviceId ?? '—'],
                  [t('diag.deviceLabel'), camera.deviceLabel ?? '—'],
                  ...(camera.settings
                    ? Object.entries(camera.settings).map(
                        ([k, v]) => [k, formatValue(v)] as [string, string],
                      )
                    : []),
                ]}
              />
            </div>

            {/* Right: capabilities */}
            <div>
              <h3 className="font-mono text-hud-sm text-accent-yellow mb-2 uppercase">
                {t('diag.capabilities')}
              </h3>
              {camera.capabilities ? (
                <DiagTable
                  rows={Object.entries(camera.capabilities).map(
                    ([k, v]) => [k, formatValue(v)] as [string, string],
                  )}
                />
              ) : (
                <p className="font-mono text-hud-xs text-fg-muted">—</p>
              )}
            </div>
          </div>
        </HudFrame>

        {/* ── Layout ── */}
        <HudFrame className="p-4" variant="cyan" id="diag-layout">
          <h2 className="font-display text-xl text-accent-cyan mb-3">
            {t('diag.layout')}
          </h2>
          <div className="space-y-2">
            <DiagTable
              rows={[
                [t('diag.mode'), layout.toUpperCase()],
                [t('diag.source'), source],
              ]}
            />
            <NeonButton variant="cyan" size="sm" onClick={toggle}>
              {t('diag.toggleLayout')}
            </NeonButton>
          </div>
        </HudFrame>

        {/* ── MediaPipe ── */}
        <HudFrame
          className="p-4"
          variant={pose.backend ? 'cyan' : 'muted'}
          id="diag-mediapipe"
        >
          <h2 className="font-display text-xl text-accent-cyan mb-3">
            {t('diag.mediapipe')}
          </h2>
          <div className="space-y-4">
            <DiagTable
              rows={[
                [t('mediapipe.backend'), pose.backend ?? '—'],
                [t('mediapipe.model'), 'pose_landmarker_full.task'],
                [t('mediapipe.modelVersion'), pose.modelVersion ?? '—'],
                [
                  t('mediapipe.latency'),
                  pose.latency ? `${Math.round(pose.latency)}ms` : '—',
                ],
                ['FPS', pose.fps ? String(pose.fps) : '—'],
              ]}
            />

            <div className="flex items-center justify-between border-t border-surface-2 pt-3 mt-3">
              <span className="font-mono text-hud-sm text-fg-muted">PRESENCE</span>
              <span className="font-mono text-hud-sm text-accent-cyan">
                {t(`presence.${presence}`, presence.toUpperCase())}
              </span>
            </div>

            <div className="pt-2">
              <NeonButton
                variant={showDebug ? 'cyan' : 'muted'}
                size="sm"
                onClick={toggleDebug}
              >
                {t('diag.toggleSkeleton')}
              </NeonButton>
            </div>
          </div>
        </HudFrame>
      </div>

      {/* Copy report */}
      <div className="flex justify-center pt-2">
        <NeonButton variant="yellow" size="md" onClick={handleCopy} id="diag-copy-report">
          {copied ? t('diag.copied') : t('diag.copyReport')}
        </NeonButton>
      </div>
    </div>
  );
}

/** Simple key-value diagnostic table */
function DiagTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="font-mono text-hud-sm space-y-0.5">
      {rows.map(([key, val]) => (
        <div key={key} className="flex justify-between gap-4">
          <span className="text-fg-muted whitespace-nowrap">{key}</span>
          <span className="text-fg text-right break-all">{val}</span>
        </div>
      ))}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}
