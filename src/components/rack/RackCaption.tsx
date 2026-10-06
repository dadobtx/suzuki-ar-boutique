import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import type { RackItem } from './buildRack';

interface RackCaptionProps {
  item: RackItem | null;
  totalCount: number;
  minPriceCents: number;
  isSelected: boolean;
  activeVariantId: string | null;
  isWishlisted: boolean;
  onToggleWishlist: (sku: string) => void;
  onSelectVariant?: (variantId: string) => void;
  interactive?: boolean;
  compact?: boolean;
}

export function RackCaption({
  item,
  totalCount,
  minPriceCents,
  isSelected,
  activeVariantId,
  isWishlisted,
  onToggleWishlist,
  onSelectVariant,
  interactive = true,
  compact = false,
}: RackCaptionProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<'front' | 'back'>('front');

  // Estado para retardo y fundido al cambiar de prenda
  const [displayedItem, setDisplayedItem] = useState<RackItem | null>(item);
  const [opacity, setOpacity] = useState<number>(1);
  const [fadeDuration, setFadeDuration] = useState<number>(250);
  const prevItemIdRef = useRef<string | null | undefined>(item?.id);

  // Sincronizar item con retardo de 300 ms y fundido (150 ms salida / 250 ms entrada)
  useEffect(() => {
    // Si no cambió el ID del item (misma prenda, o actualización interna), sincronizar de inmediato
    if (item?.id === prevItemIdRef.current) {
      setDisplayedItem(item);
      return;
    }

    const prevId = prevItemIdRef.current;
    prevItemIdRef.current = item?.id;

    const isReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    // Con prefers-reduced-motion o al inicializar desde null, cambio inmediato
    if (isReduced || !prevId || !item) {
      setDisplayedItem(item);
      setOpacity(1);
      return;
    }

    // 1. Fundido de salida de 150 ms
    setFadeDuration(150);
    setOpacity(0);

    // 2. El contenido nuevo entra a los ~300 ms del cambio de foco con entrada de 250 ms
    const timer = setTimeout(() => {
      setDisplayedItem(item);
      setFadeDuration(250);
      setOpacity(1);
    }, 300);

    // Si el foco cambia otra vez antes, cancelar el anterior (no encolar)
    return () => {
      clearTimeout(timer);
    };
  }, [item]);

  // Reset view when displayed item changes
  useEffect(() => {
    setView('front');
  }, [displayedItem?.id]);

  if (!displayedItem) {
    const minPriceFormatted = `$${(minPriceCents / 100).toFixed(2)}`;
    return (
      <div
        data-testid="rack-caption"
        style={{
          opacity,
          transition: `opacity ${fadeDuration}ms ease-out`,
        }}
        className={`w-full h-full flex flex-col items-center justify-center text-center ${compact ? 'px-4' : 'px-10'}`}
      >
        <span
          className={
            compact
              ? 'font-display text-2xl sm:text-3xl text-white tracking-wider uppercase'
              : 'font-display text-5xl lg:text-6xl text-white tracking-wider uppercase'
          }
        >
          Colección Suzuki
        </span>
        <div className={`flex items-center gap-6 ${compact ? 'mt-1' : 'mt-3'}`}>
          <span
            className={`font-mono font-bold text-fg tabular-nums ${compact ? 'text-lg sm:text-xl' : 'text-3xl'}`}
          >
            {totalCount} prendas
          </span>
          <span
            className={`text-fg-muted font-sans whitespace-nowrap ${compact ? 'text-sm sm:text-base' : 'text-2xl'}`}
          >
            desde {minPriceFormatted}
          </span>
        </div>
      </div>
    );
  }

  const currentVariant =
    (activeVariantId
      ? displayedItem.variants.find((v) => v.id === activeVariantId)
      : null) ?? displayedItem.variants[0];

  const frontThumb = currentVariant?.photoThumbUrl ?? displayedItem.photoThumbUrl;
  const backThumb = displayedItem.backThumbnailUrl;
  const hasBack = Boolean(backThumb);
  const activeThumb = view === 'back' && backThumb ? backThumb : frontThumb;

  const priceFormatted = `$${(displayedItem.priceCents / 100).toFixed(2)}`;
  const sizesText =
    displayedItem.sizes.length > 0 ? `Tallas ${displayedItem.sizes.join(', ')}` : '';
  const colorsText =
    displayedItem.variants.length > 1
      ? `${displayedItem.variants.length} colores`
      : displayedItem.colors.length > 1
        ? `${displayedItem.colors.length} colores`
        : '';

  const wishlistAria = t(
    isWishlisted ? 'catalog.removeWishlist' : 'catalog.addWishlist',
    { name: displayedItem.name },
  );

  return (
    <div
      data-testid="rack-caption"
      style={{
        opacity,
        transition: `opacity ${fadeDuration}ms ease-out`,
      }}
      className={`w-full h-full flex items-center justify-between ${compact ? 'px-6 gap-4' : 'px-10 gap-8'}`}
    >
      {/* ── Izquierda: Placa blanca con foto real y filo rojo inferior ── */}
      <div className="flex-shrink-0">
        <button
          type="button"
          onClick={() => {
            if (hasBack) {
              setView((v) => (v === 'front' ? 'back' : 'front'));
            }
          }}
          disabled={!hasBack}
          aria-label={hasBack ? 'Alternar vista frente y espalda' : undefined}
          className={`relative ${
            compact
              ? 'w-[54px] h-[54px] p-1 border-b-2'
              : 'w-[120px] h-[120px] p-2 border-b-4'
          } bg-white rounded-md overflow-hidden flex items-center justify-center shadow-xl border-b-brand-red ${
            hasBack ? 'cursor-pointer hover:opacity-95' : 'cursor-default'
          }`}
        >
          {activeThumb ? (
            <img
              src={activeThumb}
              alt={displayedItem.name}
              draggable={false}
              className="w-full h-full object-contain select-none pointer-events-none"
            />
          ) : (
            <div className="w-full h-full bg-surface-2/20" />
          )}

          {hasBack && (
            <span
              className={`absolute ${
                compact
                  ? 'top-0.5 right-0.5 text-[8px] px-1'
                  : 'top-1.5 right-1.5 text-[10px] px-1.5 py-0.5'
              } font-bold tracking-wider uppercase bg-black/70 text-white rounded`}
            >
              {view === 'front' ? 'Frente' : 'Espalda'}
            </span>
          )}
        </button>
      </div>

      {/* ── Centro: Nombre, precio, tallas y chips de variante ── */}
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <span
          className={`font-display text-white tracking-wide uppercase line-clamp-1 leading-none ${
            compact
              ? 'text-2xl sm:text-3xl'
              : 'text-4xl sm:text-5xl lg:text-6xl line-clamp-2'
          }`}
        >
          {displayedItem.name}
        </span>

        <div
          className={`flex flex-wrap items-baseline ${compact ? 'gap-3 mt-1' : 'gap-4 sm:gap-6 mt-2'}`}
        >
          <span
            className={`font-mono font-bold text-fg tabular-nums ${compact ? 'text-xl sm:text-2xl' : 'text-3xl sm:text-4xl'}`}
          >
            {priceFormatted}
          </span>
          {sizesText && (
            <span
              className={`text-fg-muted font-sans ${compact ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'}`}
            >
              {sizesText}
            </span>
          )}
          {colorsText && (
            <span
              className={`text-fg-muted font-sans ${compact ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'}`}
            >
              · {colorsText}
            </span>
          )}
        </div>

        {/* Chips de variante si la prenda abierta está seleccionada y tiene variantes */}
        {isSelected && displayedItem.variants.length > 1 && interactive && (
          <div
            className={`flex items-center gap-2 ${compact ? 'mt-1' : 'mt-3'} flex-wrap`}
          >
            {displayedItem.variants.map((v) => {
              const isVarActive =
                (activeVariantId ?? displayedItem.variants[0]?.id) === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelectVariant?.(v.id)}
                  aria-label={`Color ${v.label ?? v.id}`}
                  aria-pressed={isVarActive}
                  className={`${
                    compact
                      ? 'min-h-[28px] px-2.5 py-0.5 text-xs'
                      : 'min-h-[44px] px-3.5 py-1 text-sm'
                  } rounded-full border flex items-center gap-2 transition-all cursor-pointer ${
                    isVarActive
                      ? 'border-white bg-surface-2 text-white shadow-md'
                      : 'border-line bg-surface/80 text-fg-muted hover:text-white'
                  }`}
                >
                  <span
                    className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} rounded-full border border-white/40 flex-shrink-0`}
                    style={{ backgroundColor: v.color }}
                  />
                  <span
                    className={`${compact ? 'text-xs' : 'text-sm'} font-semibold tracking-wide`}
                  >
                    {v.label ?? v.id}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Derecha: Botón Favorito (mínimo 64×64 en normal, 48×48 en compact) ── */}
      <div className="flex-shrink-0">
        <button
          type="button"
          disabled={!interactive}
          aria-label={wishlistAria}
          onClick={(e) => {
            e.stopPropagation();
            if (interactive) {
              onToggleWishlist(displayedItem.sku);
            }
          }}
          className={`${
            compact
              ? 'w-12 h-12 min-w-[48px] min-h-[48px]'
              : 'w-16 h-16 min-w-[64px] min-h-[64px]'
          } rounded-full border border-line bg-surface-2 flex items-center justify-center transition-all cursor-pointer ${
            interactive
              ? 'hover:border-white/40 active:scale-95'
              : 'opacity-80 cursor-default'
          }`}
        >
          <Heart
            className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} transition-colors ${
              isWishlisted
                ? 'fill-brand-red text-brand-red'
                : 'text-fg-muted hover:text-white'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
