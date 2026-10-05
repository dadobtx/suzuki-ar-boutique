import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Camera, RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useKioskStore } from '@/store/kiosk';
import { usePhotoStore } from '@/store/photo';
import { categorizeError } from '@/lib/analytics-events';

/**
 * Shown when FASHN AI fails to generate the try-on photo.
 * Uses categorizeError() for accurate handling:
 * - pose: NO VEMOS BIEN TU POSE / Párate de frente... / TOMAR LA FOTO DE NUEVO (clearPhoto + TRYON)
 * - content: NO PUDIMOS PROCESAR LA FOTO / Busca buena luz... / TOMAR LA FOTO DE NUEVO (clearPhoto + TRYON)
 * - network, timeout, other: SE NOS CAYÓ LA CONEXIÓN / No fue tu foto... / INTENTAR DE NUEVO (keeps photo, resets aiData, transition AI_PROCESSING)
 * Secondary button: TERMINAR (startCooldown)
 */
export function AIError() {
  const { t } = useTranslation();
  const transition = useKioskStore((s) => s.transition);
  const startCooldown = useKioskStore((s) => s.startCooldown);
  const clearPhoto = usePhotoStore((s) => s.clearPhoto);
  const setAiData = usePhotoStore((s) => s.setAiData);
  const aiError = usePhotoStore((s) => s.aiGenerationError);

  // Auto-timeout: if user doesn't act in 30s, go back to attract
  useEffect(() => {
    const timer = setTimeout(() => {
      clearPhoto();
      startCooldown();
    }, 30_000);
    return () => clearTimeout(timer);
  }, [clearPhoto, startCooldown]);

  const category = categorizeError(aiError || undefined);
  const isPose = category === 'pose';
  const isContent = category === 'content';
  const isNetworkOrOther = !isPose && !isContent;

  const handleRetake = () => {
    clearPhoto();
    transition('TRYON');
  };

  const handleRetrySamePhoto = () => {
    // Reset AI state to idle before re-submitting so AIProcessing triggers cleanly
    setAiData({ status: 'idle', error: undefined });
    transition('AI_PROCESSING');
  };

  const handleFinalize = () => {
    clearPhoto();
    startCooldown();
  };

  let titleKey = 'ai.error.networkTitle';
  let titleDef = 'SE NOS CAYÓ LA CONEXIÓN';
  let hintKey = 'ai.error.networkHint';
  let hintDef = 'No fue tu foto. Inténtalo otra vez en unos segundos.';

  if (isPose) {
    titleKey = 'ai.error.poseTitle';
    titleDef = 'NO VEMOS BIEN TU POSE';
    hintKey = 'ai.error.poseHint';
    hintDef =
      'Párate de frente, con los brazos abajo y el torso completo dentro del marco.';
  } else if (isContent) {
    titleKey = 'ai.error.contentTitle';
    titleDef = 'NO PUDIMOS PROCESAR LA FOTO';
    hintKey = 'ai.error.contentHint';
    hintDef = 'Busca buena luz, deja el torso visible y que no haya nada delante.';
  }

  return (
    <div className="absolute inset-0 z-[60] bg-bg/95 backdrop-blur-md flex flex-col items-center justify-center p-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-col items-center max-w-2xl text-center"
      >
        <motion.div
          initial={{ rotate: -10 }}
          animate={{ rotate: [-10, 10, -8, 8, 0] }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="mb-8"
        >
          <AlertTriangle className="w-24 h-24 text-brand-red" strokeWidth={1.5} />
        </motion.div>

        <h1 className="font-display text-5xl tracking-widest text-white mb-4 uppercase">
          {t(titleKey, titleDef)}
        </h1>

        <p className="font-mono text-lg text-fg-muted mb-12 leading-relaxed">
          {t(hintKey, hintDef)}
        </p>

        <div className="flex flex-col md:flex-row gap-6 w-full md:w-auto">
          {isNetworkOrOther ? (
            <button
              type="button"
              onClick={handleRetrySamePhoto}
              className="flex items-center justify-center gap-4 px-12 py-6 bg-fg text-bg font-display text-2xl tracking-widest clip-hud hover:brightness-95 active:scale-95 transition-all min-w-[300px] min-h-[64px]"
            >
              <RefreshCw className="w-8 h-8" />
              {t('ai.error.retryButton', 'INTENTAR DE NUEVO')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRetake}
              className="flex items-center justify-center gap-4 px-12 py-6 bg-fg text-bg font-display text-2xl tracking-widest clip-hud hover:brightness-95 active:scale-95 transition-all min-w-[300px] min-h-[64px]"
            >
              <Camera className="w-8 h-8" />
              {t('ai.error.retakeButton', 'TOMAR LA FOTO DE NUEVO')}
            </button>
          )}

          <button
            type="button"
            onClick={handleFinalize}
            className="flex items-center justify-center gap-4 px-12 py-6 bg-surface border border-fg-muted/30 text-fg-muted font-display text-2xl tracking-widest clip-hud hover:text-white hover:border-fg-muted transition-all min-w-[300px] min-h-[64px]"
          >
            <X className="w-8 h-8" />
            {t('ai.error.finishButton', 'TERMINAR')}
          </button>
        </div>

        <p className="font-mono text-xs text-fg-muted/50 mt-12 tracking-wider">
          {t(
            'ai.error.autoCloseHint',
            'ESTA PANTALLA SE CIERRA AUTOMÁTICAMENTE EN 30 SEGUNDOS',
          )}
        </p>
      </motion.div>
    </div>
  );
}
