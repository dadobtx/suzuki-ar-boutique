import { useMemo } from 'react';
import { Hand } from 'lucide-react';
import { useHandCursorStore } from '@/store/handCursor';

export function HandCursor() {
  const cursor = useHandCursorStore((s) => s.cursor);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  if (!cursor.active) {
    return null;
  }

  // Dimensiones del anillo SVG
  const size = 88;
  const strokeWidth = 4;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference * (1 - Math.max(0, Math.min(1, cursor.dwellProgress)));

  return (
    <div
      data-testid="hand-cursor"
      className={`absolute pointer-events-none z-40 transition-opacity duration-200 ${
        cursor.active ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        left: `${(cursor.x * 100).toFixed(2)}%`,
        top: `${(cursor.y * 100).toFixed(2)}%`,
        transform: prefersReducedMotion
          ? 'translate(-50%, -50%)'
          : `translate(-50%, -50%) scale(${1 + cursor.dwellProgress * 0.08})`,
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
          {/* Avance con rojo Suzuki de marca */}
          {cursor.dwellProgress > 0 && (
            <circle
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

        {/* Ícono de mano ~64 px con sombra profunda */}
        <div className="text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.85)] filter">
          <Hand size={48} strokeWidth={2.2} />
        </div>
      </div>
    </div>
  );
}
