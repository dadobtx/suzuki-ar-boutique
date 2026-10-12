import { useMemo } from 'react';
import { Hand, ChevronLeft, ChevronRight } from 'lucide-react';
import { useHandCursorStore } from '@/store/handCursor';
import { useHandGuide } from '@/lib/hand-guide';

export function HandCursor() {
  const cursor = useHandCursorStore((s) => s.cursor);
  const { state } = useHandGuide();

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // 'live-loading' / 'live-active' / 'hidden': el cursor NO se muestra
  if (
    !cursor.active ||
    state === 'live-loading' ||
    state === 'live-active' ||
    state === 'hidden'
  ) {
    return null;
  }

  // Dimensiones del anillo SVG
  const size = 88;
  const strokeWidth = 4;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(
    0,
    Math.min(1, cursor.confirmProgress ?? cursor.dwellProgress ?? 0),
  );
  const strokeDashoffset = circumference * (1 - progress);

  const showRightArrow =
    state === 'move-right' || (state === 'edge' && cursor.activeHandSide === 'Right');
  const showLeftArrow =
    state === 'move-left' || (state === 'edge' && cursor.activeHandSide === 'Left');
  const isEdge = state === 'edge';
  const isPulseRight = cursor.pulseArrow === 'right';
  const isPulseLeft = cursor.pulseArrow === 'left';

  return (
    <div
      data-testid="hand-cursor"
      className="absolute pointer-events-none z-40 transition-opacity duration-200 opacity-100"
      style={{
        left: `${(cursor.x * 100).toFixed(2)}%`,
        top: `${(cursor.y * 100).toFixed(2)}%`,
        transform: prefersReducedMotion
          ? 'translate(-50%, -50%)'
          : `translate(-50%, -50%) scale(${1 + progress * 0.08})`,
      }}
    >
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {/* Anillo de progreso SVG */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Base blanca al 22% */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.22)"
            strokeWidth={strokeWidth}
          />
          {/* Avance con rojo Suzuki de marca (índice o confirmación) */}
          {progress > 0 && (
            <circle
              data-testid="cursor-progress-ring"
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#E30613"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          )}
        </svg>

        {/* Ícono de mano ~48 px con sombra profunda */}
        <div className="text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.85)] filter flex items-center justify-center">
          <Hand size={46} strokeWidth={2.2} />
        </div>

        {/* Punto tenue: esperando volver al centro (disparador desarmado / recenter) */}
        {(state === 'recenter' || cursor.isStepDisarmed) && (
          <div
            data-testid="cursor-rearm-dot"
            className="absolute -bottom-3 w-2.5 h-2.5 rounded-full bg-white/40 shadow-sm"
          />
        )}

        {/* Flecha ▶ a la DERECHA del cursor */}
        {showRightArrow && (
          <div
            data-testid="cursor-arrow-right"
            className={`absolute flex items-center justify-center w-[44px] h-[44px] rounded-full bg-black/75 text-white border border-white/50 shadow-[0_4px_16px_rgba(0,0,0,0.85)] transition-all ${
              isEdge
                ? 'opacity-30'
                : isPulseRight
                  ? 'scale-125 bg-brand-red border-brand-red opacity-100'
                  : prefersReducedMotion
                    ? 'opacity-100'
                    : 'animate-hand-arrow-right'
            }`}
            style={{
              left: `${size + 16}px`,
              top: '50%',
              transform: isPulseRight
                ? 'translateY(-50%) scale(1.25)'
                : 'translateY(-50%)',
            }}
          >
            <ChevronRight size={28} strokeWidth={3} />
          </div>
        )}

        {/* Flecha ◀ a la IZQUIERDA del cursor */}
        {showLeftArrow && (
          <div
            data-testid="cursor-arrow-left"
            className={`absolute flex items-center justify-center w-[44px] h-[44px] rounded-full bg-black/75 text-white border border-white/50 shadow-[0_4px_16px_rgba(0,0,0,0.85)] transition-all ${
              isEdge
                ? 'opacity-30'
                : isPulseLeft
                  ? 'scale-125 bg-brand-red border-brand-red opacity-100'
                  : prefersReducedMotion
                    ? 'opacity-100'
                    : 'animate-hand-arrow-left'
            }`}
            style={{
              right: `${size + 16}px`,
              top: '50%',
              transform: isPulseLeft
                ? 'translateY(-50%) scale(1.25)'
                : 'translateY(-50%)',
            }}
          >
            <ChevronLeft size={28} strokeWidth={3} />
          </div>
        )}
      </div>
    </div>
  );
}
