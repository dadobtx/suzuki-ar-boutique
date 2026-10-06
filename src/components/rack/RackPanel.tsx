import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useGarmentStore } from '@/store/garment';
import { buildRack, type RackItem } from './buildRack';
import { RackSlot } from './RackSlot';
import { RackCaption } from './RackCaption';
import './rack.css';

interface RackPanelProps {
  mode: 'attract' | 'interactive';
}

export function RackPanel({ mode }: RackPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

  const catalog = useGarmentStore((s) => s.catalog);
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const activeVariantId = useGarmentStore((s) => s.activeVariantId);
  const selectGarment = useGarmentStore((s) => s.selectGarment);
  const selectVariant = useGarmentStore((s) => s.selectVariant);
  const wishlist = useGarmentStore((s) => s.wishlist);
  const toggleWishlist = useGarmentStore((s) => s.toggleWishlist);

  const [panelHeight, setPanelHeight] = useState<number>(672);
  const [focusIdx, setFocusIdx] = useState<number | null>(mode === 'attract' ? 0 : null);
  const [kickClasses, setKickClasses] = useState<string[]>([]);
  const isBusyRef = useRef<boolean>(false);

  // Construir items del perchero con catálogo real y variante activa
  const items: RackItem[] = useMemo(() => {
    return buildRack(catalog, activeGarmentId, activeVariantId);
  }, [catalog, activeGarmentId, activeVariantId]);

  // Medir contenedor
  useEffect(() => {
    if (!panelRef.current) return;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setPanelHeight(entry.contentRect.height);
        }
      }
    });
    ro.observe(panelRef.current);
    return () => ro.disconnect();
  }, []);

  // Precargar ilustraciones en memoria una vez
  useEffect(() => {
    items.forEach((item) => {
      const urlsToPreload =
        item.illustrations.length > 0
          ? item.illustrations
          : ([item.illustrationUrl, item.fallbackPhotoUrl, item.photoThumbUrl].filter(
              Boolean,
            ) as string[]);

      urlsToPreload.forEach((url) => {
        const img = new Image();
        img.src = url;
        if (img.decode) {
          img.decode().catch(() => {});
        }
      });
    });
  }, [items]);

  // Función para sacudir una prenda (swing)
  const kick = useCallback((index: number, delay = 0) => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    ) {
      return;
    }
    setTimeout(() => {
      setKickClasses((prev) => {
        const next = [...prev];
        const current = next[index];
        next[index] = current === 'kick' ? 'kick2' : 'kick';
        return next;
      });
    }, delay);
  }, []);

  // Inicializar estado de mecida según cantidad de items
  useEffect(() => {
    setKickClasses(new Array(items.length).fill(''));
  }, [items.length]);

  // Si cambia la prenda activa, enfocarla si estamos en modo interactivo
  useEffect(() => {
    if (mode === 'interactive' && activeGarmentId) {
      const idx = items.findIndex((it) => it.id === activeGarmentId);
      if (idx !== -1) {
        setFocusIdx(idx);
      }
    }
  }, [activeGarmentId, items, mode]);

  // Despertar del perchero: mecida escalonada desde el centro al entrar a modo interactivo
  useEffect(() => {
    if (mode === 'interactive' && items.length > 0) {
      const center = (items.length - 1) / 2;
      items.forEach((_, k) => {
        kick(k, 120 + Math.abs(k - center) * 55);
      });
    }
  }, [mode, items, kick]);

  // Modo Attract: ciclo automático cada 2600 ms, pausado en document.hidden
  useEffect(() => {
    if (mode !== 'attract' || items.length === 0) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const startTimer = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (document.hidden) return;
        setFocusIdx((prev) => {
          const next = prev === null ? 0 : (prev + 1) % items.length;
          kick(next);
          return next;
        });
      }, 2600);
    };

    startTimer();

    const handleVisibility = () => {
      if (document.hidden) {
        if (timer) clearInterval(timer);
      } else {
        startTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [mode, items.length, kick]);

  // Cambio de foco
  const setFocus = useCallback(
    (index: number | null, doKick = true) => {
      setFocusIdx(index);
      if (index !== null && doKick) {
        kick(index);
      }
    },
    [kick],
  );

  // Animación de Vuelo (Flyer hacia o desde la celda del espejo)
  const flyElement = useCallback(
    async (
      src: string,
      from: { left: number; top: number; width: number; height: number },
      to: { left: number; top: number; width: number; height: number },
      { arc = -140, tilt = -6 }: { arc?: number; tilt?: number } = {},
    ): Promise<void> => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const isReduced =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)')?.matches;

      const img = document.createElement('img');
      img.className = 'rack-flyer';
      img.src = src;
      img.alt = '';
      Object.assign(img.style, {
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
      });
      document.body.appendChild(img);

      if (isReduced || typeof img.animate !== 'function') {
        img.remove();
        return;
      }

      const dx = to.left - from.left;
      const dy = to.top - from.top;
      const sx = from.width > 0 ? to.width / from.width : 1;
      const sy = from.height > 0 ? to.height / from.height : 1;
      const mid = `translate(${dx * 0.38}px, ${dy * 0.38 + arc}px) scale(${1 + (sx - 1) * 0.5}, ${1 + (sy - 1) * 0.5}) rotate(${tilt}deg)`;

      try {
        const anim = img.animate(
          [
            { transform: 'translate(0,0) scale(1,1) rotate(0deg)', opacity: '1' },
            { transform: mid, offset: 0.42 },
            {
              transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(0deg)`,
              opacity: '1',
            },
          ],
          {
            duration: 760,
            easing: 'cubic-bezier(0.35, 0.7, 0.2, 1)',
            fill: 'forwards',
          },
        );

        if (anim?.finished) {
          await anim.finished;
        }

        const fade = img.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 250,
          easing: 'ease-out',
          fill: 'forwards',
        });
        if (fade?.finished) {
          await fade.finished;
        }
      } catch {
        // En caso de interrupción
      } finally {
        img.remove();
      }
    },
    [],
  );

  // Calcular rectángulo objetivo en la celda del espejo
  const getMirrorTargetRect = useCallback(
    (from: { left: number; top: number; width: number; height: number }) => {
      const mirrorEl =
        document.querySelector('[data-stage="mirror"]') ||
        document.getElementById('mirror');
      if (!mirrorEl) {
        return {
          left: window.innerWidth * 0.5 - 150,
          top: window.innerHeight * 0.25,
          width: 300,
          height: 300,
        };
      }
      const mRect = mirrorEl.getBoundingClientRect();
      const targetW = mRect.width * 0.45;
      const aspect = from.width > 0 && from.height > 0 ? from.width / from.height : 1;
      const targetH = targetW / aspect;
      const targetLeft = mRect.left + mRect.width * 0.5 - targetW * 0.5;
      const targetTop = mRect.top + mRect.height * 0.38 - targetH * 0.5;
      return {
        left: targetLeft,
        top: targetTop,
        width: targetW,
        height: targetH,
      };
    },
    [],
  );

  // Tomar o devolver una prenda
  const handleTakeOrReturn = useCallback(
    async (index: number) => {
      if (mode !== 'interactive' || isBusyRef.current) return;
      const item = items[index];
      if (!item) return;

      const currentActiveId = useGarmentStore.getState().activeGarmentId;
      const isAlreadySelected = currentActiveId === item.id;
      const slotEl = slotRefs.current[index];
      const slotImg = slotEl?.querySelector<HTMLElement>('.rack-garment') || slotEl;
      const flySrc = item.illustrationUrl || item.fallbackPhotoUrl;

      isBusyRef.current = true;

      try {
        if (isAlreadySelected) {
          // Deseleccionar y vuelo de regreso
          selectGarment(null);
          kick(index);

          if (slotImg && flySrc) {
            const slotRect = slotImg.getBoundingClientRect();
            const mirrorRect = getMirrorTargetRect(slotRect);
            await flyElement(flySrc, mirrorRect, slotRect, { arc: -60, tilt: 5 });
          }
        } else {
          // Si había otra puesta, se deselecciona esa y la nueva vuela hacia el espejo
          setFocus(index);
          kick(index);
          selectGarment(item.id);

          if (slotImg && flySrc) {
            const slotRect = slotImg.getBoundingClientRect();
            const mirrorRect = getMirrorTargetRect(slotRect);
            await flyElement(flySrc, slotRect, mirrorRect, { arc: -140, tilt: -6 });
          }
        }
      } finally {
        isBusyRef.current = false;
      }
    },
    [mode, items, selectGarment, kick, setFocus, getMirrorTargetRect, flyElement],
  );

  // Interacción táctil / puntero con histéresis
  const handlePointerMove = (e: React.PointerEvent) => {
    if (mode !== 'interactive' || isBusyRef.current) return;
    const x = e.clientX;

    // Histéresis: si el cursor permanece dentro del slot abierto, no cambiar
    if (focusIdx !== null && slotRefs.current[focusIdx]) {
      const openRect = slotRefs.current[focusIdx]?.getBoundingClientRect();
      if (openRect && x >= openRect.left && x <= openRect.right) {
        return;
      }
    }

    let bestIdx: number | null = null;
    let bestDist = Infinity;
    items.forEach((_, k) => {
      const el = slotRefs.current[k];
      if (el) {
        const r = el.getBoundingClientRect();
        const center = r.left + r.width / 2;
        const dist = Math.abs(x - center);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = k;
        }
      }
    });

    if (bestIdx !== null && bestIdx !== focusIdx) {
      setFocus(bestIdx);
    }
  };

  // Teclado (← → Enter Escape)
  useEffect(() => {
    if (mode !== 'interactive') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = items.length;
        if (n === 0) return;
        const cur = focusIdx ?? (e.key === 'ArrowRight' ? -1 : n);
        const next = Math.min(
          n - 1,
          Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)),
        );
        setFocus(next);
      } else if (e.key === 'Enter') {
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        if (focusIdx !== null && items[focusIdx]) {
          handleTakeOrReturn(focusIdx);
        }
      } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        const currentActiveId = useGarmentStore.getState().activeGarmentId;
        if (currentActiveId) {
          const activeIdx = items.findIndex((it) => it.id === currentActiveId);
          if (activeIdx !== -1) {
            handleTakeOrReturn(activeIdx);
          } else {
            selectGarment(null);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    mode,
    focusIdx,
    items,
    activeGarmentId,
    handleTakeOrReturn,
    setFocus,
    selectGarment,
  ]);

  // Cálculos para la leyenda (RackCaption)
  const openItem = focusIdx !== null && items[focusIdx] ? items[focusIdx] : null;
  const isSelected = openItem ? activeGarmentId === openItem.id : false;
  const isWishlisted = openItem ? wishlist.includes(openItem.sku) : false;

  const validPrices = items
    .map((it) => it.priceCents)
    .filter((p) => typeof p === 'number' && !isNaN(p));
  const minPriceCents = validPrices.length > 0 ? Math.min(...validPrices) : 3529;

  // Alto del recortable ≈ 52% del alto del panel (~352px en panel de 672px)
  const garmentHeight = Math.round(panelHeight * 0.5238);

  return (
    <section
      ref={panelRef}
      data-testid="rack-panel"
      data-mode={mode}
      aria-label="Perchero Suzuki"
      onPointerMove={handlePointerMove}
      className="relative w-full h-full bg-surface border-t border-line overflow-hidden select-none"
    >
      {/* ── Riel metálico con soportes en los extremos ── */}
      <div className="rack-rail" aria-hidden="true" />

      {/* ── Perchero con ganchos y recortables ── */}
      <div role="listbox" aria-label="Prendas del perchero" className="rack-container">
        {items.map((item, idx) => {
          const isOpen = focusIdx === idx;
          const isLeft = focusIdx !== null && idx < focusIdx;
          const isEmpty = activeGarmentId === item.id;

          return (
            <RackSlot
              key={item.id}
              ref={(el) => {
                slotRefs.current[idx] = el;
              }}
              item={item}
              index={idx}
              isOpen={isOpen}
              isLeft={isLeft}
              isEmpty={isEmpty}
              kickClass={kickClasses[idx] || ''}
              garmentHeight={garmentHeight}
              onClick={() => {
                if (mode === 'interactive') {
                  handleTakeOrReturn(idx);
                }
              }}
            />
          );
        })}
      </div>

      {/* ── Leyenda inferior (RackCaption) ── */}
      <div className="absolute left-0 right-0 bottom-3 h-[160px] pointer-events-auto">
        <RackCaption
          item={openItem}
          totalCount={items.length}
          minPriceCents={minPriceCents}
          isSelected={isSelected}
          activeVariantId={activeVariantId}
          isWishlisted={isWishlisted}
          onToggleWishlist={toggleWishlist}
          onSelectVariant={selectVariant}
          interactive={mode === 'interactive'}
        />
      </div>
    </section>
  );
}
