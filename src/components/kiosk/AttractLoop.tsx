import { useTranslation } from 'react-i18next';
import { useKioskStore } from '@/store/kiosk';

export function AttractLoop() {
  const { t } = useTranslation();
  const transition = useKioskStore((s) => s.transition);

  // Fallback to TRYON on click for testing/bypass
  const handleClick = () => {
    transition('TRYON');
  };

  // We could try to load a video, if it fails or isn't there, we show the gradient fallback.
  // For simplicity, we can use a video tag with an onError fallback, or just rely on CSS background.

  return (
    <div
      className="absolute inset-0 z-50 bg-black cursor-pointer overflow-hidden flex items-center justify-center"
      onClick={handleClick}
    >
      <video
        src={`${import.meta.env.BASE_URL}videos/attract-1.mp4`}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-80"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />

      {/* Fallback Background (shows if video fails) */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#07080F] via-[#11141C] to-[#E60012]/20 -z-10" />

      {/* HUD Lines Decoration */}
      <div className="absolute inset-8 border border-white/10 clip-hud pointer-events-none" />

      <div className="relative z-10 text-center flex flex-col items-center gap-6 animate-pulse">
        <h1 className="font-display text-6xl md:text-8xl tracking-widest text-white drop-shadow-2xl">
          {t('kiosk.attract.cta', 'ACÉRCATE PARA EMPEZAR')}
        </h1>
        <div className="w-24 h-1 bg-brand-red glow-red" />
      </div>
    </div>
  );
}
