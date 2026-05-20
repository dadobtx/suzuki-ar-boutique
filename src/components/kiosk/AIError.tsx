import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Camera, X } from 'lucide-react';
import { useKioskStore } from '@/store/kiosk';
import { usePhotoStore } from '@/store/photo';

/**
 * Shown when FASHN AI fails to generate the try-on photo
 * (typically PoseError, NSFW false positive, or rejected input).
 * Gives the user a clear message and two actions: retake or finalize.
 *
 * Auto-timeout after 30s to prevent the kiosk from getting stuck if
 * the user walks away without acting.
 */
export function AIError() {
  const transition = useKioskStore((s) => s.transition);
  const startCooldown = useKioskStore((s) => s.startCooldown);
  const clearPhoto = usePhotoStore((s) => s.clearPhoto);
  const aiError = usePhotoStore((s) => s.aiGenerationError);

  // Auto-timeout: if user doesn't act in 30s, go back to attract
  useEffect(() => {
    const timer = setTimeout(() => {
      clearPhoto();
      startCooldown();
    }, 30_000);
    return () => clearTimeout(timer);
  }, [clearPhoto, startCooldown]);

  const handleRetry = () => {
    // Clear the previous photo data and send user back to the try-on flow
    // so they can adjust their pose before triggering the countdown again.
    clearPhoto();
    transition('TRYON');
  };

  const handleFinalize = () => {
    clearPhoto();
    startCooldown();
  };

  // Surface the underlying error to the user only if it's a recognizable
  // category we can give actionable advice for. Generic technical errors
  // (network, 500, etc.) stay hidden behind a friendly message.
  const isPoseError = typeof aiError === 'string' && /pose/i.test(aiError);
  const isContentError =
    typeof aiError === 'string' && /(nsfw|content|moderation)/i.test(aiError);

  let subtitle = 'PROBÁ TOMARTE LA FOTO OTRA VEZ';
  let hint =
    'Pará de frente a la cámara, con los brazos a los costados, mostrando todo el torso. Buena iluminación ayuda.';

  if (isPoseError) {
    subtitle = 'NO PUDIMOS DETECTAR TU POSE';
    hint =
      'Pará de frente a la cámara con los brazos abajo. Mostrá la cara y el torso completo dentro del recuadro.';
  } else if (isContentError) {
    subtitle = 'NO PUDIMOS PROCESAR LA FOTO';
    hint =
      'Asegurate de estar bien iluminado/a, con el torso visible y sin objetos delante.';
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
          {subtitle}
        </h1>

        <p className="font-mono text-lg text-fg-muted mb-12 leading-relaxed">{hint}</p>

        <div className="flex flex-col md:flex-row gap-6 w-full md:w-auto">
          <button
            onClick={handleRetry}
            className="flex items-center justify-center gap-4 px-12 py-6 bg-brand-red text-white font-display text-2xl tracking-widest clip-hud hover:brightness-110 transition-all glow-red min-w-[300px]"
            style={{ minHeight: '80px' }}
          >
            <Camera className="w-8 h-8" />
            TOMAR FOTO DE NUEVO
          </button>

          <button
            onClick={handleFinalize}
            className="flex items-center justify-center gap-4 px-12 py-6 bg-surface border border-fg-muted/30 text-fg-muted font-display text-2xl tracking-widest clip-hud hover:text-white hover:border-fg-muted transition-all min-w-[300px]"
            style={{ minHeight: '80px' }}
          >
            <X className="w-8 h-8" />
            FINALIZAR
          </button>
        </div>

        <p className="font-mono text-xs text-fg-muted/50 mt-12 tracking-wider">
          ESTA PANTALLA SE CIERRA AUTOMÁTICAMENTE EN 30 SEGUNDOS
        </p>
      </motion.div>
    </div>
  );
}
