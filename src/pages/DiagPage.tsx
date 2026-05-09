import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAppStore } from '../store/app';
import { HudFrame, NeonButton } from '../components/hud';

/**
 * Diagnostics page — accessible at /#/diag.
 * Shows FPS, camera capabilities, MediaPipe info, build metadata,
 * and layout toggle. Full implementation in F2/F3.
 */
export function DiagPage() {
  const { t } = useTranslation();
  const { layout, toggleLayout } = useAppStore();
  const [copied, setCopied] = useState(false);

  const report = {
    build: {
      sha: __GIT_SHA__,
      date: __BUILD_DATE__,
      version: '0.1.0',
    },
    layout,
    camera: 'Not initialized (F2)',
    mediapipe: 'Not loaded (F3)',
    fps: 'N/A',
    userAgent: navigator.userAgent,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      dpr: window.devicePixelRatio,
    },
  };

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [report]);

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl text-accent-cyan">{t('diag.title')}</h1>
        <Link
          to="/"
          className="font-mono text-hud-sm text-fg-muted hover:text-accent-cyan transition-colors"
        >
          ← {t('nav.home')}
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Build info */}
        <HudFrame className="p-4" variant="cyan" id="diag-build">
          <h2 className="font-display text-xl text-accent-cyan mb-3">
            {t('diag.build')}
          </h2>
          <div className="font-mono text-hud-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-fg-muted">GIT_SHA</span>
              <span className="text-fg">{__GIT_SHA__}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">BUILD_DATE</span>
              <span className="text-fg">{__BUILD_DATE__}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">DPR</span>
              <span className="text-fg">{window.devicePixelRatio}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">SCREEN</span>
              <span className="text-fg">
                {window.screen.width}×{window.screen.height}
              </span>
            </div>
          </div>
        </HudFrame>

        {/* FPS placeholder */}
        <HudFrame className="p-4" variant="muted" id="diag-fps">
          <h2 className="font-display text-xl text-accent-yellow mb-3">
            {t('diag.fps')}
          </h2>
          <div className="font-mono text-4xl text-center text-fg-muted py-6">--</div>
          <div className="font-mono text-hud-xs text-fg-muted text-center">
            Disponible en F3
          </div>
        </HudFrame>

        {/* Camera placeholder */}
        <HudFrame className="p-4" variant="muted" id="diag-camera">
          <h2 className="font-display text-xl text-accent-cyan mb-3">
            {t('diag.camera')}
          </h2>
          <div className="font-mono text-hud-sm text-fg-muted">
            Inicialización de cámara en F2
          </div>
        </HudFrame>

        {/* Layout toggle */}
        <HudFrame className="p-4" variant="cyan" id="diag-layout">
          <h2 className="font-display text-xl text-accent-cyan mb-3">
            {t('diag.layout')}
          </h2>
          <div className="flex items-center justify-between">
            <span className="font-mono text-hud-sm text-fg">{layout.toUpperCase()}</span>
            <NeonButton variant="cyan" size="sm" onClick={toggleLayout}>
              {t('diag.toggleLayout')}
            </NeonButton>
          </div>
        </HudFrame>
      </div>

      {/* Copy report */}
      <div className="flex justify-center">
        <NeonButton variant="yellow" size="md" onClick={handleCopy} id="diag-copy-report">
          {copied ? t('diag.copied') : t('diag.copyReport')}
        </NeonButton>
      </div>
    </div>
  );
}
