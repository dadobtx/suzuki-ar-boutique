import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
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
  const [view, setView] = useState<'front' | 'back'>('front');

  const imgboxRef = useRef<HTMLDivElement | null>(null);
  const teaseTimer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teaseTimer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const activeVariantId = useGarmentStore((s) => s.activeVariantId);
  const selectGarment = useGarmentStore((s) => s.selectGarment);
  const wishlist = useGarmentStore((s) => s.wishlist);
  const toggleWishlist = useGarmentStore((s) => s.toggleWishlist);

  const sessionId = useSizingStore((s) => s.sessionId);
  const track = useAnalyticsStore((s) => s.track);

  const isActive = activeGarmentId === garment.id;
  const isWishlisted = wishlist.includes(garment.sku);
  const baseUrl = import.meta.env.BASE_URL;

  const src = garment.thumbnailUrl ?? garment.overlayUrl;
  const imageUrl = `${baseUrl}${src.replace(/^\//, '')}`;

  // Nombres de prendas: quitar prefijo repetido de línea en la tarjeta
  const displayName = useMemo(() => {
    if (garment.name.toLowerCase().startsWith(garment.line.toLowerCase())) {
      const stripped = garment.name.slice(garment.line.length).trim();
      return stripped.length > 0 ? stripped : garment.name;
    }
    return garment.name;
  }, [garment.name, garment.line]);

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

  const clearPreviewTimers = () => {
    if (previewTimer1Ref.current) {
      clearTimeout(previewTimer1Ref.current);
      previewTimer1Ref.current = null;
    }
    if (previewTimer2Ref.current) {
      clearTimeout(previewTimer2Ref.current);
      previewTimer2Ref.current = null;
    }
  };

  // Reset view to 'front' when active garment or sessionId changes
  useEffect(() => {
    setView('front');
    clearTeaseTimers();
    clearPreviewTimers();
  }, [activeGarmentId, garment.id, sessionId]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      clearTeaseTimers();
      clearPreviewTimers();
    };
  }, []);

  // Animación de insinuación (Tease) automática
  useEffect(() => {
    if (!isActive) return;
    if (!resolvedBackView) return;
    if (hasSessionTeased(sessionId)) return;

    markSessionTeased(sessionId);

    teaseTimer1Ref.current = setTimeout(() => {
      setView('back');
      teaseTimer2Ref.current = setTimeout(() => {
        setView('front');
      }, 700);
    }, 1200);

    return () => {
      clearTeaseTimers();
    };
  }, [isActive, resolvedBackView, sessionId]);

  // Vista posterior automática al seleccionar la prenda
  const prevIsActiveRef = useRef(false);

  useEffect(() => {
    const wasActive = prevIsActiveRef.current;
    prevIsActiveRef.current = isActive;

    if (!isActive) {
      clearPreviewTimers();
      return;
    }

    if (!resolvedBackView) return;

    if (!wasActive) {
      clearPreviewTimers();
      previewTimer1Ref.current = setTimeout(() => {
        setView('back');
        previewTimer2Ref.current = setTimeout(() => {
          setView('front');
        }, 2000);
      }, 600);
    }

    return () => {
      clearPreviewTimers();
    };
  }, [isActive, resolvedBackView]);

  const handleManualFlip = () => {
    clearTeaseTimers();
    clearPreviewTimers();
    const nextView = view === 'front' ? 'back' : 'front';
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

  return (
    <div
      role="article"
      data-sku={garment.sku}
      data-view={view}
      className={`
        relative bg-surface rounded-sm border transition-all clip-hud flex flex-col h-[500px] overflow-hidden
        ${isActive ? 'border-brand-red glow-red' : 'border-line hover:border-fg-muted/50'}
      `}
    >
      {/* Primary card selection button for accessibility */}
      <button
        type="button"
        aria-pressed={isActive}
        aria-label={`${garment.name} · ${garment.line}`}
        onClick={() => selectGarment(garment.id)}
        className="absolute inset-0 z-0 w-full h-full min-w-[64px] min-h-[64px] cursor-pointer focus:outline-none"
      />

      {/* Wishlist Button - Top Right */}
      <button
        type="button"
        aria-label={t(isWishlisted ? 'catalog.removeWishlist' : 'catalog.addWishlist')}
        onClick={(e) => {
          e.stopPropagation();
          toggleWishlist(garment.sku);
        }}
        className="absolute top-2 right-2 p-3 z-10 text-fg-muted hover:text-brand-red transition-colors cursor-pointer"
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

      {/* Badges - Top Left */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        {garment.badges?.map((b) => (
          <span
            key={b}
            className="text-xs font-bold px-2 py-1 bg-brand-red text-white clip-hud tracking-widest uppercase"
          >
            {b}
          </span>
        ))}
      </div>

      {/* Image Area */}
      {!resolvedBackView ? (
        <div className="relative flex-1 min-h-0 w-full bg-white pointer-events-none mt-12">
          <div className="absolute inset-0 flex items-center justify-center p-8">
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
        </div>
      ) : (
        <div
          ref={imgboxRef}
          className="relative flex-1 min-h-0 w-full bg-white pointer-events-none flex items-center justify-center mt-12 [perspective:1200px]"
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
            {/* Front Face */}
            <div
              className="face front absolute inset-0 flex items-center justify-center p-8 [backface-visibility:hidden] [-webkit-backface-visibility:hidden]"
              style={
                resolvedBackView.mode === 'fade'
                  ? {
                      transition: prefersReducedMotion ? 'none' : 'opacity 0.28s ease',
                      opacity: view === 'front' ? 1 : 0,
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

          {/* Flip Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleManualFlip();
            }}
            className={`
              absolute right-3 bottom-3 z-10 w-[11%] min-w-[72px] min-h-[72px] aspect-square rounded-full border pointer-events-auto
              bg-surface/90 backdrop-blur-sm flex flex-col items-center justify-center p-1 cursor-pointer transition-all active:scale-95
              ${view === 'back' ? 'border-brand-red text-brand-red shadow-lg' : 'border-line hover:border-fg-muted text-fg-muted hover:text-white'}
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
      <div className="p-5 flex flex-col gap-1 bg-surface/90 backdrop-blur-sm pointer-events-none z-10 border-t border-line">
        <div className="font-mono text-sm text-brand-red tracking-widest uppercase">
          {garment.line}
        </div>
        <div
          className="font-display text-3xl leading-snug line-clamp-2 min-h-[2.75em]"
          title={garment.name}
        >
          {displayName}
        </div>
        <div className="font-mono text-lg text-fg-muted mt-1">
          ${((garment.priceCents || 0) / 100).toFixed(2)}
        </div>
      </div>
    </div>
  );
}
