import React, { forwardRef } from 'react';
import type { RackItem } from './buildRack';

interface RackSlotProps {
  item: RackItem;
  index: number;
  isOpen: boolean;
  isLeft: boolean;
  isEmpty: boolean;
  kickClass: string;
  garmentHeight?: number;
  onClick: (e: React.MouseEvent) => void;
}

export const RackSlot = forwardRef<HTMLDivElement, RackSlotProps>(function RackSlot(
  { item, index, isOpen, isLeft, isEmpty, kickClass, garmentHeight = 352, onClick },
  ref,
) {
  const gh = garmentHeight;
  const gw = gh; // Proporción 1:1 estándar de recortables Suzuki (1254×1254)
  const ow = gw + 22;

  const moneyFormatted = `$${(item.priceCents / 100).toFixed(2)}`;
  const ariaLabel = `${item.name}, ${moneyFormatted}`;

  const slotClasses = [
    'rack-slot',
    isOpen ? 'open' : '',
    isLeft ? 'left' : '',
    isEmpty ? 'empty' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const swingClasses = ['rack-swing', kickClass].filter(Boolean).join(' ');

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isOpen}
      aria-label={ariaLabel}
      tabIndex={-1}
      data-rack-index={index}
      data-garment-id={item.id}
      className={slotClasses}
      style={
        {
          '--gw': `${gw}px`,
          '--gh': `${gh}px`,
          '--ow': `${ow}px`,
        } as React.CSSProperties
      }
      onClick={onClick}
    >
      {/* Barra de foco roja de 4px × 56px */}
      <div className="rack-focusbar" aria-hidden="true" />

      {/* Contenedor péndulo con origen en el gancho */}
      <div className={swingClasses}>
        {/* Contenedor 3D con giro */}
        <div className="rack-turn">
          {/* Gancho SVG */}
          <svg
            className="rack-hanger"
            viewBox="0 0 150 70"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M75 4c-9 0-13 7-10 13 3 5 10 6 10 14v6" />
            <path d="M75 37 14 60c-6 3-4 8 2 8h118c6 0 8-5 2-8L75 37" />
          </svg>

          {/* Prenda (Ilustración o Placa blanca de Fallback) */}
          {item.illustrationUrl ? (
            <img
              src={item.illustrationUrl}
              alt={`${item.name} (ilustración)`}
              draggable={false}
              className="rack-garment select-none object-contain pointer-events-none"
            />
          ) : (
            <div className="rack-garment select-none bg-white rounded-lg p-3 flex items-center justify-center shadow-lg border border-white/20">
              {item.fallbackPhotoUrl && (
                <img
                  src={item.fallbackPhotoUrl}
                  alt={item.name}
                  draggable={false}
                  className="w-full h-full object-contain pointer-events-none"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
