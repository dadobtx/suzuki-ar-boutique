import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { HudFrame, NeonButton, Ticker } from '../components/hud';

export function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 gap-8">
      {/* Header */}
      <header className="text-center">
        <h1 className="font-display text-6xl md:text-8xl text-brand-red tracking-wider">
          {t('app.title')}
        </h1>
        <p className="font-mono text-hud-sm text-accent-cyan mt-2 uppercase tracking-widest">
          {t('app.subtitle')}
        </p>
      </header>

      {/* Ticker */}
      <Ticker
        items={[
          'GSX-R',
          'HAYABUSA',
          'ECSTAR MOTOGP',
          'SWIFT SPORT',
          'JIMNY',
          'MARINE',
          'LIFESTYLE',
        ]}
        className="w-full max-w-2xl"
      />

      {/* Main content placeholder */}
      <HudFrame className="w-full max-w-4xl p-8" id="main-frame">
        <div className="text-center space-y-6">
          <div className="font-mono text-hud-sm text-fg-muted uppercase tracking-wider">
            {t('tryon.ready')}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <NeonButton variant="cyan" size="lg">
              {t('tryon.ready')}
            </NeonButton>
            <NeonButton variant="red" size="lg">
              {t('tryon.turboMode')}
            </NeonButton>
            <NeonButton variant="yellow" size="md">
              {t('catalog.title')}
            </NeonButton>
          </div>

          {/* Dev nav */}
          <div className="pt-4 border-t border-surface-2">
            <Link
              to="/diag"
              className="font-mono text-hud-xs text-fg-muted hover:text-accent-cyan transition-colors"
            >
              /#/diag →
            </Link>
          </div>
        </div>
      </HudFrame>

      {/* Footer telemetry */}
      <footer className="font-mono text-hud-xs text-fg-muted/50 text-center space-y-1">
        <div>
          BUILD {__GIT_SHA__.slice(0, 7)} · {__BUILD_DATE__.split('T')[0]}
        </div>
        <div>SUZUKI AR BOUTIQUE v0.1.0</div>
      </footer>
    </div>
  );
}
