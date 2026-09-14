import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, SlidersHorizontal, X } from 'lucide-react';
import { useGarmentStore } from '@/store/garment';
import { useSizingStore } from '@/store/sizing';
import { useAnalyticsStore } from '@/store/analytics';
import { resolveBackView } from '@/lib/back-view';
import type { Garment } from '@/types/garment';

// Marca de insinuación compartida entre todas las tarjetas por sesión (Correction 2)
const TEASE_STORAGE_KEY = 'suzuki_ar_back_view_teased_session';
let teasedSessionInMemory: string | null = null;

function hasSessionTeased(sessionId: string | null): boolean {
  const key = sessionId ?? 'default';
  if (teasedSessionInMemory === key) return true;
  try {
    return sessionStorage.getItem(TEASE_STORAGE_KEY) === key;
  } catch {
    return false;
  }
}

function markSessionTeased(sessionId: string | null): void {
  const key = sessionId ?? 'default';
  teasedSessionInMemory = key;
  try {
    sessionStorage.setItem(TEASE_STORAGE_KEY, key);
  } catch {
    // ignore
  }
}

// Analítica: primer volteo manual por SKU por sesión
const manuallyViewedSkusPerSession = new Map<string, Set<string>>();

function hasManuallyViewedBack(sessionId: string | null, sku: string): boolean {
  const key = sessionId ?? 'default';
  return manuallyViewedSkusPerSession.get(key)?.has(sku) ?? false;
}

function markManuallyViewedBack(sessionId: string | null, sku: string): void {
  const key = sessionId ?? 'default';
  let set = manuallyViewedSkusPerSession.get(key);
  if (!set) {
    set = new Set();
    manuallyViewedSkusPerSession.set(key, set);
  }
  set.add(sku);
}

interface CatalogCardProps {
  garment: Garment;
}

export function CatalogCard({ garment }: CatalogCardProps) {
  const { t } = useTranslation();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [backImgLoaded, setBackImgLoaded] = useState(false);
  const [backImgError, setBackImgError] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<'front' | 'back'>('front');

  const imgboxRef = useRef<HTMLDivElement | null>(null);
  const teaseTimer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teaseTimer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const activeVariantId = useGarmentStore((s) => s.activeVariantId);
  const selectGarment = useGarmentStore((s) => s.selectGarment);
  const wishlist = useGarmentStore((s) => s.wishlist);
  const toggleWishlist = useGarmentStore((s) => s.toggleWishlist);
  const filters = useGarmentStore((s) => s.filters);
  const setFilter = useGarmentStore((s) => s.setFilter);

  const sessionId = useSizingStore((s) => s.sessionId);
  const track = useAnalyticsStore((s) => s.track);

  const isActive = activeGarmentId === garment.id;
  const isWishlisted = wishlist.includes(garment.sku);
  const baseUrl = import.meta.env.BASE_URL;

  const src = garment.thumbnailUrl ?? garment.overlayUrl;
  const imageUrl = `${baseUrl}${src.replace(/^\//, '')}`;

  // activeVariantId SOLO PARA LA TARJETA ACTIVA (Correction 4)
  const resolvedBackView = useMemo(
    () => resolveBackView(garment, isActive ? activeVariantId : null),
    [garment, isActive, activeVariantId],
  );

  const backImageUrl = useMemo(() => {
    if (!resolvedBackView) return '';
    const backSrc = resolvedBackView.thumbnailUrl || resolvedBackView.imageUrl;
    return `${baseUrl}${backSrc.replace(/^\//, '')}`;
  }, [baseUrl, resolvedBackView]);

  const clearTeaseTimers = () => {
    if (teaseTimer1Ref.current) {
      clearTimeout(teaseTimer1Ref.current);
      teaseTimer1Ref.current = null;
    }
    if (teaseTimer2Ref.current) {
      clearTimeout(teaseTimer2Ref.current);
      teaseTimer2Ref.current = null;
    }
  };

  // Reset view to 'front' when active garment or sessionId changes
  useEffect(() => {
    setView('front');
    clearTeaseTimers();
  }, [activeGarmentId, sessionId]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTeaseTimers();
    };
  }, []);

  // IntersectionObserver for Tease (runs once per session across ALL cards)
  useEffect(() => {
    if (!resolvedBackView || resolvedBackView.mode !== 'flip') return;
    if (typeof window === 'undefined') return;

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    if (hasSessionTeased(sessionId)) return;

    const element = imgboxRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          if (hasSessionTeased(sessionId)) {
            observer.disconnect();
            return;
          }

          markSessionTeased(sessionId);
          observer.disconnect();

          teaseTimer1Ref.current = setTimeout(() => {
            setView('back');
            teaseTimer2Ref.current = setTimeout(() => {
              setView('front');
              teaseTimer2Ref.current = null;
            }, 1500);
            teaseTimer1Ref.current = null;
          }, 700);
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [resolvedBackView, sessionId]);

  const handleManualFlip = () => {
    clearTeaseTimers();
    const nextView = view === 'back' ? 'front' : 'back';
    setView(nextView);

    if (nextView === 'back' && !hasManuallyViewedBack(sessionId, garment.sku)) {
      markManuallyViewedBack(sessionId, garment.sku);
      track({
        type: 'garment_back_viewed',
        sku: garment.sku,
        variantId: isActive && activeVariantId ? activeVariantId : undefined,
      });
    }
  };

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      {!resolvedBackView ? (
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
      ) : (
        <div
          ref={imgboxRef}
          className="relative flex-1 w-full bg-surface-2 cursor-pointer flex items-center justify-center mt-12 [perspective:1200px]"
          onClick={() => selectGarment(garment.id)}
        >
          {/* Faces container */}
          <div
            className="faces absolute inset-0 [transform-style:preserve-3d]"
            style={
              resolvedBackView.mode === 'flip'
                ? {
                    transition: prefersReducedMotion
                      ? 'none'
                      : 'transform 0.55s cubic-bezier(0.4, 0.05, 0.2, 1)',
                    transform: view === 'back' ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  }
                : undefined
            }
          >
            {/* Front Face (mismo padding p-8, object-contain, tamaño aparente - Correction 5) */}
            <div
              className="face front absolute inset-0 flex items-center justify-center p-8 [backface-visibility:hidden] [-webkit-backface-visibility:hidden]"
              style={
                resolvedBackView.mode === 'fade'
                  ? {
                      transition: prefersReducedMotion ? 'none' : 'opacity 0.28s ease',
                      opacity: view === 'front' ? 1 : 0,
                      pointerEvents: view === 'front' ? 'auto' : 'none',
                    }
                  : undefined
              }
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

            {/* Back Face */}
            <div
              className="face back absolute inset-0 flex items-center justify-center p-8 [backface-visibility:hidden] [-webkit-backface-visibility:hidden]"
              style={
                resolvedBackView.mode === 'flip'
                  ? {
                      transform: 'rotateY(180deg)',
                    }
                  : {
                      transition: prefersReducedMotion ? 'none' : 'opacity 0.28s ease',
                      opacity: view === 'back' ? 1 : 0,
                      pointerEvents: view === 'back' ? 'auto' : 'none',
                    }
              }
            >
              {!backImgLoaded && !backImgError && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <img
                src={backImageUrl}
                alt={`${garment.name} - ${t('catalog.viewBack')}`}
                className={`w-full h-full object-contain drop-shadow-xl transition-opacity duration-300 ${backImgLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setBackImgLoaded(true)}
                onError={() => {
                  setBackImgError(true);
                  setBackImgLoaded(true);
                }}
                loading="lazy"
              />
            </div>
          </div>

          {/* Flip Button: Hermano de .faces fuera del contenedor que rota (Correction 3), ~11% min 72px (Correction 1) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleManualFlip();
            }}
            className={`
              absolute right-3 bottom-3 z-10 w-[11%] min-w-[72px] min-h-[72px] aspect-square rounded-full border
              bg-surface/90 backdrop-blur-sm flex flex-col items-center justify-center p-1 cursor-pointer transition-all active:scale-95
              ${view === 'back' ? 'border-brand-red text-brand-red shadow-[0_0_12px_rgba(230,0,18,0.5)]' : 'border-surface-hover hover:border-fg-muted text-fg-muted hover:text-white'}
            `}
            aria-label={
              view === 'back' ? t('catalog.viewFrontAria') : t('catalog.viewBackAria')
            }
            aria-pressed={view === 'back'}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="w-[38%] h-[38%] block"
            >
              <path d="M21 12a9 9 0 1 1-3.2-6.9" />
              <path d="M21 3v5h-5" />
            </svg>
            <b
              className="font-mono font-bold tracking-wider uppercase leading-none mt-1 text-center"
              style={{ fontSize: 'clamp(10px, 1.1vw, 20px)' }}
            >
              {view === 'back' ? t('catalog.viewFront') : t('catalog.viewBack')}
            </b>
          </button>
        </div>
      )}

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
