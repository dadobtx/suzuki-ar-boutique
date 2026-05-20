import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useKioskStore } from '@/store/kiosk';
import { usePhotoStore } from '@/store/photo';
import { useGarmentStore } from '@/store/garment';
import { generateTryOnPhoto } from '@/lib/ai-tryon-client';
import { Loader2 } from 'lucide-react';

const PHRASES = [
  'ai.processing.1',
  'ai.processing.2',
  'ai.processing.3',
  'ai.processing.4',
];

export function AIProcessing() {
  const { t } = useTranslation();
  const transition = useKioskStore((s) => s.transition);
  const { currentPhotoClean, setAiData } = usePhotoStore();
  const { catalog, activeGarmentId } = useGarmentStore();

  const [phraseIndex, setPhraseIndex] = useState(0);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % PHRASES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Guard against React 18 StrictMode double-invocation in dev
    // and against any accidental re-runs from dependency changes mid-flight.
    // We deliberately do NOT use an isCancelled flag here because StrictMode's
    // simulated cleanup would set it to true and silently kill the only in-flight
    // fetch, leaving the user stuck on the loading screen.
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const processAI = async () => {
      if (!currentPhotoClean) {
        transition('SHARE_QR_FALLBACK');
        return;
      }

      const activeGarment = catalog.find((g) => g.id === activeGarmentId);
      if (!activeGarment || !activeGarment.overlayUrl) {
        transition('SHARE_QR_FALLBACK');
        return;
      }

      setAiData({ status: 'processing' });

      try {
        const baseUrl = import.meta.env.BASE_URL;
        const fullOverlayUrl = `${baseUrl}${activeGarment.overlayUrl.replace(/^\//, '')}`;

        const result = await generateTryOnPhoto(
          currentPhotoClean,
          fullOverlayUrl,
          `${activeGarment.line} ${activeGarment.name}`,
        );

        if (result.status === 'success' && result.imageUrl) {
          setAiData({
            status: 'success',
            url: result.imageUrl,
            durationMs: result.durationMs,
          });
          transition('SHARE_QR');
        } else {
          // FASHN failure (PoseError, NSFW, model rejection, etc.) — route the
          // user to a retry screen instead of falling back to the local demo
          // composite. The demo confuses users because it's not the photo they
          // were promised; an explicit "retake the photo" message is clearer.
          setAiData({
            status: 'error',
            error: result.error || 'Failed to generate',
          });
          transition('AI_ERROR');
        }
      } catch (err) {
        const error = err as Error;
        setAiData({
          status: 'error',
          error: error.message || 'Unknown error',
        });
        transition('AI_ERROR');
      }
    };

    processAI();
  }, [currentPhotoClean, catalog, activeGarmentId, transition, setAiData]);

  return (
    <div className="absolute inset-0 z-[60] bg-bg/90 backdrop-blur-md flex flex-col items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center"
      >
        <Loader2 className="w-24 h-24 text-accent-cyan animate-spin mb-8" />

        <div className="h-12 relative flex items-center justify-center w-full overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={phraseIndex}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute font-display text-2xl tracking-widest text-white text-center px-4 uppercase"
            >
              {t(PHRASES[phraseIndex] || '', 'GENERANDO LOOK CON IA...')}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-12 w-64 h-2 bg-surface rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-accent-cyan"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 15, ease: 'linear' }}
          />
        </div>
      </motion.div>
    </div>
  );
}
