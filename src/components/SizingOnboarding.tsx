import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSizingStore } from '../store/sizing';
import { useLayout } from '@/hooks/useLayout';

export function SizingOnboardingPanel() {
  const { t } = useTranslation();
  const { layout } = useLayout();
  const isPortrait = layout === 'portrait';
  const { hasProfile, setProfile } = useSizingStore();
  const [talla, setTalla] = useState<string | null>(null);
  const [fit, setFit] = useState<'ajustado' | 'regular' | 'holgado'>('regular');
  const [submitting, setSubmitting] = useState(false);

  if (hasProfile) return null;

  const handleSubmit = async () => {
    if (!talla) return;
    setSubmitting(true);
    await setProfile(talla, fit);
    setSubmitting(false);
  };

  return (
    <div className="w-full h-full flex flex-col justify-center items-center p-6 md:p-8 bg-surface text-fg relative overflow-y-auto">
      <div
        className={`w-full flex flex-col relative ${isPortrait ? 'max-w-4xl gap-8' : 'max-w-xl gap-6'}`}
      >
        {/* Decoración superior */}
        <div className="w-16 h-1 bg-brand-red mb-1"></div>

        <div>
          <h2 className="text-3xl md:text-4xl font-display tracking-wide mb-3">
            {t('onboarding.questionSize', '¿QUÉ TALLA USAS?')}
          </h2>
          <div
            className={
              isPortrait ? 'flex flex-row gap-3 w-full' : 'grid grid-cols-3 gap-3'
            }
          >
            {['XS', 'S', 'M', 'L', 'XL', 'No sé'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTalla(s)}
                className={`${
                  isPortrait
                    ? 'h-[96px] min-h-[96px] flex-1 min-w-0 text-3xl'
                    : 'h-[64px] min-h-[64px] min-w-[64px] text-2xl'
                } rounded-xl font-display tracking-wider transition-all cursor-pointer flex items-center justify-center select-none ${
                  talla === s
                    ? 'bg-surface-2 border-2 border-fg text-fg'
                    : 'bg-surface border border-line text-fg-muted hover:border-fg-muted hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-2xl md:text-3xl font-display tracking-wide mb-3">
            {t('onboarding.questionFit', '¿CÓMO TE GUSTA QUE TE QUEDE?')}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'ajustado', label: t('sizing.fit.tight', 'Ajustado') },
              { id: 'regular', label: t('sizing.fit.regular', 'Regular') },
              { id: 'holgado', label: t('sizing.fit.loose', 'Holgado') },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFit(f.id as 'ajustado' | 'regular' | 'holgado')}
                className={`${
                  isPortrait
                    ? 'h-[96px] min-h-[96px] text-2xl'
                    : 'h-[64px] min-h-[64px] text-xl'
                } min-w-[64px] rounded-xl font-display tracking-wider transition-all cursor-pointer flex items-center justify-center select-none ${
                  fit === f.id
                    ? 'bg-surface-2 border-2 border-fg text-fg'
                    : 'bg-surface border border-line text-fg-muted hover:border-fg-muted hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!talla || submitting}
            className={`w-full ${
              isPortrait
                ? 'h-[112px] min-h-[112px] text-3xl'
                : 'h-[64px] min-h-[64px] text-2xl'
            } min-w-[64px] rounded-xl font-display tracking-widest uppercase transition-all cursor-pointer ${
              !talla || submitting
                ? 'bg-surface-2 text-fg-muted border border-line cursor-not-allowed'
                : 'bg-fg text-bg hover:brightness-95 active:scale-95'
            }`}
          >
            {submitting
              ? t('onboarding.submitting', 'EMPEZANDO…')
              : t('onboarding.start', 'EMPEZAR')}
          </button>
        </div>

        <p className="text-center text-fg-muted text-sm font-sans mt-1">
          {t('onboarding.anonymousNote', 'Es anónimo: no te pedimos nombre ni contacto.')}
        </p>
      </div>
    </div>
  );
}

// Alias for backwards compatibility
export const SizingOnboardingModal = SizingOnboardingPanel;
