import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useKioskStore } from '@/store/kiosk';
import { useGarmentStore } from '@/store/garment';
import { usePhotoStore } from '@/store/photo';
import { composePhoto } from '@/lib/photo-composer';
import { generateWishlistCode } from '@/lib/wishlist-code';

interface PhotoCountdownProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement>;
}

export function PhotoCountdown({ videoRef, overlayCanvasRef }: PhotoCountdownProps) {
  const { t } = useTranslation();
  const transition = useKioskStore((s) => s.transition);
  const [countdown, setCountdown] = useState(3);
  const [flash, setFlash] = useState(false);

  const catalog = useGarmentStore((s) => s.catalog);
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const setPhoto = usePhotoStore((s) => s.setPhoto);

  useEffect(() => {
    const playBeep = () => {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof window.AudioContext })
            .webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, ctx.currentTime);
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          osc.start();
          gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);
          osc.stop(ctx.currentTime + 0.1);
        }
      } catch {
        // Ignore audio errors
      }
    };

    // Beep immediately for the initial "3" display.
    playBeep();

    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c > 1) {
          // Defer the beep to AFTER React flushes the state update so it never
          // fires while the previous number's exit animation is still running.
          // Without this deferral the 3→2 transition produced a double-tone
          // because the new AudioContext was created synchronously inside the
          // setState callback, overlapping with the still-playing exit animation.
          setTimeout(playBeep, 0);
          return c - 1;
        }

        clearInterval(interval);
        setFlash(true);

        const shootPhoto = async () => {
          try {
            const activeGarment = catalog.find((g) => g.id === activeGarmentId);
            if (!videoRef.current || !overlayCanvasRef.current || !activeGarment) {
              throw new Error('Missing elements for photo composer');
            }

            const wishlistCode = generateWishlistCode();
            const result = await composePhoto({
              videoEl: videoRef.current,
              overlayCanvas: overlayCanvasRef.current,
              garment: activeGarment,
              wishlistCode,
            });

            setPhoto(
              result.photoComposed,
              result.photoClean,
              wishlistCode,
              activeGarment.sku,
            );

            setTimeout(() => {
              transition('AI_PROCESSING');
            }, 300);
          } catch (err) {
            console.error('Failed to take photo', err);
            transition('TRYON');
          }
        };

        shootPhoto();
        return 0;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [transition, catalog, activeGarmentId, videoRef, overlayCanvasRef, setPhoto]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
      <AnimatePresence>
        {countdown > 0 && (
          <motion.div
            key={countdown}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute flex flex-col items-center"
          >
            <div
              className="font-mono text-white glow-cyan"
              style={{ fontSize: '480px', lineHeight: 1 }}
            >
              {countdown}
            </div>
            <div className="font-display text-4xl tracking-widest text-white mt-8 bg-black/50 px-8 py-2 rounded">
              {t('photo.countdown.message', 'MANTENTE QUIETO')}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {flash && (
        <div
          className="absolute inset-0 bg-white z-[60]"
          style={{ animation: 'flash 0.3s ease-out forwards' }}
        />
      )}
    </div>
  );
}
