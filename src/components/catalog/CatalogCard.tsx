import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, SlidersHorizontal, X } from 'lucide-react';
import { useGarmentStore } from '@/store/garment';
import type { Garment } from '@/types/garment';

interface CatalogCardProps {
  garment: Garment;
}

export function CatalogCard({ garment }: CatalogCardProps) {
  const { t } = useTranslation();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const selectGarment = useGarmentStore((s) => s.selectGarment);
  const wishlist = useGarmentStore((s) => s.wishlist);
  const toggleWishlist = useGarmentStore((s) => s.toggleWishlist);
  const filters = useGarmentStore((s) => s.filters);
  const setFilter = useGarmentStore((s) => s.setFilter);

  const isActive = activeGarmentId === garment.id;
  const isWishlisted = wishlist.includes(garment.sku);
  const baseUrl = import.meta.env.BASE_URL;

  const imageUrl = `${baseUrl}${garment.overlayUrl.replace(/^\//, '')}`;

  const toggleSize = (size: string) => {
    const newSizes = filters.sizes.includes(size)
      ? filters.sizes.filter((s) => s !== size)
      : [...filters.sizes, size];
    setFilter('sizes', newSizes);
  };

  const toggleColor = (color: string) => {
    const newColors = filters.colors.includes(color)
      ? filters.colors.filter((c) => c !== color)
      : [...filters.colors, color];
    setFilter('colors', newColors);
  };

  return (
    <div
      className={`
        relative bg-surface rounded-sm border transition-all clip-hud flex flex-col h-[500px]
        ${isActive ? 'border-brand-red glow-red' : 'border-surface-hover hover:border-fg-muted/50'}
      `}
    >
      {/* Wishlist Button - Top Right */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleWishlist(garment.sku);
        }}
        className="absolute top-2 right-2 p-3 z-10 text-fg-muted hover:text-brand-red transition-colors"
        style={{
          minHeight: '60px',
          minWidth: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Heart
          className={`w-7 h-7 transition-all ${isWishlisted ? 'fill-brand-red text-brand-red' : ''}`}
        />
      </button>

      {/* Filter Button - Top Left */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setDrawerOpen(true);
        }}
        className="absolute top-2 left-2 p-3 z-10 text-fg-muted hover:text-white transition-colors bg-surface/50 rounded-full backdrop-blur-sm"
        style={{
          minHeight: '60px',
          minWidth: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SlidersHorizontal className="w-6 h-6" />
      </button>

      {/* Badges - Top Left Below Filter */}
      <div className="absolute top-[80px] left-4 z-10 flex flex-col gap-2">
        {garment.badges?.map((b) => (
          <span
            key={b}
            className="text-xs font-bold px-2 py-1 bg-brand-red text-white clip-hud tracking-widest"
          >
            {b}
          </span>
        ))}
      </div>

      {/* Image Area */}
      <div
        className="relative flex-1 w-full bg-surface-2 cursor-pointer flex items-center justify-center p-8 mt-12"
        onClick={() => selectGarment(garment.id)}
      >
        {!imgLoaded && !imgError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <img
          src={imageUrl}
          alt={garment.name}
          className={`w-full h-full object-contain drop-shadow-xl transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            setImgError(true);
            setImgLoaded(true);
          }}
          loading="lazy"
        />
      </div>

      {/* Info Area */}
      <div
        className="p-5 flex flex-col gap-1 cursor-pointer bg-surface/80 backdrop-blur-sm"
        onClick={() => selectGarment(garment.id)}
      >
        <div className="font-mono text-sm text-brand-red tracking-widest uppercase">
          {garment.line}
        </div>
        <div className="font-display text-3xl leading-none truncate" title={garment.name}>
          {garment.name}
        </div>
        <div className="font-mono text-lg text-fg-muted mt-1">
          ${((garment.priceCents || 0) / 100).toFixed(2)}
        </div>
      </div>

      {/* Filter Drawer Overlay */}
      {drawerOpen && (
        <div className="absolute inset-0 z-20 bg-surface/90 backdrop-blur-md p-6 flex flex-col gap-6 overflow-y-auto scrollbar-hide">
          <div className="flex justify-between items-center border-b border-surface-hover pb-4">
            <span className="font-display text-3xl tracking-wide">
              {t('catalog.filter')}
            </span>
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-2 text-fg-muted hover:text-brand-red transition-colors"
              style={{
                minHeight: '60px',
                minWidth: '60px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X className="w-8 h-8" />
            </button>
          </div>

          <div className="flex-1 flex flex-col gap-8">
            {/* Sizes */}
            {garment.sizes && garment.sizes.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="font-mono text-sm text-fg-muted uppercase tracking-widest">
                  {t('catalog.size')}
                </span>
                <div className="flex flex-wrap gap-3">
                  {garment.sizes.map((size) => {
                    const isSelected = filters.sizes.includes(size);
                    return (
                      <button
                        key={size}
                        onClick={() => toggleSize(size)}
                        className={`
                          w-16 h-16 font-mono text-lg font-bold border transition-all clip-hud flex items-center justify-center
                          ${isSelected ? 'bg-brand-red/20 border-brand-red text-white glow-red' : 'border-surface-hover hover:border-fg-muted text-fg-muted hover:text-white'}
                        `}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Colors */}
            {garment.colors && garment.colors.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="font-mono text-sm text-fg-muted uppercase tracking-widest">
                  {t('catalog.color')}
                </span>
                <div className="flex flex-wrap gap-4">
                  {garment.colors.map((color) => {
                    const isSelected = filters.colors.includes(color);
                    return (
                      <button
                        key={color}
                        onClick={() => toggleColor(color)}
                        className={`
                          w-12 h-12 rounded-full border-2 transition-all flex items-center justify-center
                          ${isSelected ? 'border-brand-red scale-110 shadow-[0_0_12px_rgba(230,0,18,0.5)]' : 'border-surface hover:border-fg-muted/50 hover:scale-105'}
                        `}
                        style={{ backgroundColor: color }}
                        aria-label={`Color ${color}`}
                      >
                        {isSelected && (
                          <div className="w-3 h-3 rounded-full bg-white mix-blend-difference" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setDrawerOpen(false)}
            className="w-full mt-auto h-16 bg-brand-red text-white font-display text-2xl tracking-widest clip-hud hover:brightness-110 transition-all glow-red"
          >
            {t('catalog.apply')}
          </button>
        </div>
      )}
    </div>
  );
}
