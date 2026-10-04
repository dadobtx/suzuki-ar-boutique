import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSizingStore } from '../store/sizing';

export function SizingOnboardingPanel() {
  const { t } = useTranslation();
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
      <div className="max-w-xl w-full flex flex-col gap-6 relative">
        {/* Decoración superior */}
        <div className="w-16 h-1 bg-brand-red mb-1"></div>

        <div>
          <h2 className="text-3xl md:text-4xl font-display tracking-wide mb-3">
            {t('onboarding.questionSize', '¿QUÉ TALLA USAS?')}
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {['XS', 'S', 'M', 'L', 'XL', 'No sé'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTalla(s)}
                className={`h-[64px] min-h-[64px] min-w-[64px] rounded-xl border-2 font-display text-2xl tracking-wider transition-all cursor-pointer flex items-center justify-center select-none
                  ${
                    talla === s
                      ? 'bg-brand-red border-brand-red text-white scale-105 shadow-lg'
                      : 'border-line hover:border-fg-muted text-fg-muted hover:text-white bg-surface-2'
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
                className={`h-[64px] min-h-[64px] min-w-[64px] rounded-xl border-2 font-display text-xl tracking-wider transition-all cursor-pointer flex items-center justify-center select-none
                  ${
                    fit === f.id
                      ? 'bg-surface-2 border-fg text-white scale-105 shadow-md'
                      : 'border-line hover:border-fg-muted text-fg-muted hover:text-white bg-surface-2/60'
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
            className="w-full h-[64px] min-h-[64px] min-w-[64px] rounded-xl bg-brand-red text-white text-2xl font-display tracking-widest uppercase hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:bg-surface-2 disabled:text-fg-muted disabled:cursor-not-allowed border-2 border-transparent disabled:border-line"
          >
            {submitting
              ? t('onboarding.submitting', 'EMPEZANDO…')
              : t('onboarding.start', 'EMPEZAR')}
          </button>
        </div>

        <p className="text-center text-fg-muted text-sm font-mono mt-1">
          {t('onboarding.anonymousNote', 'Es anónimo: no te pedimos nombre ni contacto.')}
        </p>
      </div>
    </div>
  );
}

// Alias for backwards compatibility
export const SizingOnboardingModal = SizingOnboardingPanel;
