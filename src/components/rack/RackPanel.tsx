import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useGarmentStore } from '@/store/garment';
import { useKioskStore } from '@/store/kiosk';
import { buildRack, type RackItem } from './buildRack';
import { RackSlot } from './RackSlot';
import { RackCaption } from './RackCaption';
import { useHandCursorStore } from '@/store/handCursor';
import { useAnalyticsStore } from '@/store/analytics';
import './rack.css';

interface RackPanelProps {
  mode: 'attract' | 'interactive';
  active?: boolean;
}

export function RackPanel({ mode, active = true }: RackPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

  const catalog = useGarmentStore((s) => s.catalog);
  const activeGarmentId = useGarmentStore((s) => s.activeGarmentId);
  const activeVariantId = useGarmentStore((s) => s.activeVariantId);
  const selectGarment = useGarmentStore((s) => s.selectGarment);
  const selectVariant = useGarmentStore((s) => s.selectVariant);
  const wishlist = useGarmentStore((s) => s.wishlist);
  const toggleWishlist = useGarmentStore((s) => s.toggleWishlist);

  const kioskState = useKioskStore((s) => s.state);
  const prevActiveRef = useRef<boolean>(active);
  const activeFlyersRef = useRef<Set<{ img: HTMLElement; anims: Animation[] }>>(
    new Set(),
  );
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const [panelHeight, setPanelHeight] = useState<number>(672);
  const [focusIdx, setFocusIdx] = useState<number | null>(mode === 'attract' ? 0 : null);
  const [kickClasses, setKickClasses] = useState<string[]>([]);
  const [returningId, setReturningId] = useState<string | null>(null);
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

  // Timeouts rastreados para cancelación limpia
  const registerTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeoutsRef.current.delete(id);
      fn();
    }, ms);
    timeoutsRef.current.add(id);
    return id;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current.clear();
  }, []);

  // Cancelar animaciones y remover clones de vuelo del DOM
  const cancelAllFlyers = useCallback(() => {
    activeFlyersRef.current.forEach(({ img, anims }) => {
      anims.forEach((a) => {
        try {
          a.cancel();
        } catch {
          // Ignorar animaciones que ya finalizaron o fueron canceladas
        }
      });
      img.remove();
    });
    activeFlyersRef.current.clear();
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.rack-flyer').forEach((el) => el.remove());
    }
  }, []);

  // Resetear estado local del perchero (focus, vuelo, busy, mecida, timeouts, flyers)
  const resetLocalState = useCallback(() => {
    clearAllTimeouts();
    cancelAllFlyers();
    setFocusIdx(mode === 'attract' ? 0 : null);
    setReturningId(null);
    isBusyRef.current = false;
    useHandCursorStore.getState().setBusy(false);
    setKickClasses(new Array(items.length).fill(''));
  }, [clearAllTimeouts, cancelAllFlyers, mode, items.length]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      clearAllTimeouts();
      cancelAllFlyers();
    };
  }, [clearAllTimeouts, cancelAllFlyers]);

  // Limpieza cuando kioskState pasa a 'ATTRACT' o active pasa true->false sin prenda activa
  useEffect(() => {
    const isAttract = kioskState === 'ATTRACT';
    const wasActive = prevActiveRef.current;
    const visitorLeft = wasActive && !active && !activeGarmentId;

    if (isAttract || visitorLeft) {
      resetLocalState();
    }
  }, [kioskState, active, activeGarmentId, resetLocalState]);

  // Precargar ilustraciones en memoria una vez basadas en el catálogo (no en items)
  const preloadUrls = useMemo(() => {
    const staticItems = buildRack(catalog, null, null);
    const urls: string[] = [];
    staticItems.forEach((item) => {
      const urlsToPreload =
        item.illustrations.length > 0
          ? item.illustrations
          : ([item.illustrationUrl, item.fallbackPhotoUrl, item.photoThumbUrl].filter(
              Boolean,
            ) as string[]);

      urlsToPreload.forEach((url) => {
        if (url && !urls.includes(url)) {
          urls.push(url);
        }
      });
    });
    return urls;
  }, [catalog]);

  useEffect(() => {
    preloadUrls.forEach((url) => {
      const img = new Image();
      img.src = url;
      if (img.decode) {
        img.decode().catch(() => {});
      }
    });
  }, [preloadUrls]);

  // Función para sacudir una prenda (swing)
  const kick = useCallback(
    (index: number, delay = 0) => {
      if (
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      ) {
        return;
      }
      registerTimeout(() => {
        setKickClasses((prev) => {
          const next = [...prev];
          const current = next[index];
          next[index] = current === 'kick' ? 'kick2' : 'kick';
          return next;
        });
        registerTimeout(() => {
          setKickClasses((prev) => {
            if (!prev[index]) return prev;
            const next = [...prev];
            next[index] = '';
            return next;
          });
        }, 1600);
      }, delay);
    },
    [registerTimeout],
  );

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

  // Despertar del perchero: mecida escalonada desde el centro SOLO cuando active pasa de false a true
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;

    if (mode === 'interactive' && !wasActive && active && items.length > 0) {
      const center = (items.length - 1) / 2;
      items.forEach((_, k) => {
        kick(k, 120 + Math.abs(k - center) * 55);
      });
    }
    // items no se incluye intencionalmente para no disparar la mecida al cambiar de prenda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, mode, kick, items.length]);

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

      const flyerRecord = { img, anims: [] as Animation[] };
      activeFlyersRef.current.add(flyerRecord);

      if (isReduced || typeof img.animate !== 'function') {
        activeFlyersRef.current.delete(flyerRecord);
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
        flyerRecord.anims.push(anim);

        if (anim?.finished) {
          await anim.finished;
        }

        const fade = img.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 250,
          easing: 'ease-out',
          fill: 'forwards',
        });
        flyerRecord.anims.push(fade);

        if (fade?.finished) {
          await fade.finished;
        }
      } catch {
        // En caso de interrupción
      } finally {
        activeFlyersRef.current.delete(flyerRecord);
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

  type TakeMethod = 'hand_dwell' | 'hand_point' | 'touch' | 'keyboard';

  // Tomar o devolver una prenda
  const handleTakeOrReturn = useCallback(
    async (index: number, method: TakeMethod = 'touch') => {
      if (mode !== 'interactive' || !active || isBusyRef.current) return;
      const item = items[index];
      if (!item) return;

      const currentActiveId = useGarmentStore.getState().activeGarmentId;
      const isAlreadySelected = currentActiveId === item.id;
      const slotEl = slotRefs.current[index];
      const slotImg = slotEl?.querySelector<HTMLElement>('.rack-garment') || slotEl;
      const flySrc = item.illustrationUrl || item.fallbackPhotoUrl;

      isBusyRef.current = true;
      useHandCursorStore.getState().setBusy(true);

      // Si se toma una prenda, registrar analytics
      if (!isAlreadySelected) {
        useAnalyticsStore.getState().track({
          type: 'garment_take_input',
          method,
          sku: item.id,
        });
      }

      try {
        if (isAlreadySelected) {
          // Deseleccionar y mantener slot vacío mientras vuela de regreso
          setReturningId(item.id);
          selectGarment(null);

          if (slotImg && flySrc) {
            const slotRect = slotImg.getBoundingClientRect();
            const mirrorRect = getMirrorTargetRect(slotRect);
            await flyElement(flySrc, mirrorRect, slotRect, { arc: -60, tilt: 5 });
          }

          setReturningId(null);
          kick(index);
        } else if (currentActiveId) {
          // Tocar otra prenda con una puesta: la anterior vuelve a su gancho y la nueva sale
          setFocus(index);
          kick(index);
          selectGarment(item.id);

          const prevIdx = items.findIndex((it) => it.id === currentActiveId);
          const prevItem = prevIdx !== -1 ? items[prevIdx] : null;

          if (prevItem) {
            setReturningId(prevItem.id);
          }

          // Vuelo de regreso de la anterior
          const returnPromise = (async () => {
            if (prevItem && prevIdx !== -1) {
              const prevSlotEl = slotRefs.current[prevIdx];
              const prevSlotImg =
                prevSlotEl?.querySelector<HTMLElement>('.rack-garment') || prevSlotEl;
              const prevFlySrc = prevItem.illustrationUrl || prevItem.fallbackPhotoUrl;
              if (prevSlotImg && prevFlySrc) {
                const prevSlotRect = prevSlotImg.getBoundingClientRect();
                const mirrorRect = getMirrorTargetRect(prevSlotRect);
                await flyElement(prevFlySrc, mirrorRect, prevSlotRect, {
                  arc: -60,
                  tilt: 5,
                });
              }
              setReturningId((cur) => (cur === prevItem.id ? null : cur));
              kick(prevIdx);
            }
          })();

          // 120 ms después, vuelo de la nueva
          const takePromise = (async () => {
            await new Promise((resolve) => registerTimeout(() => resolve(true), 120));
            if (slotImg && flySrc) {
              const slotRect = slotImg.getBoundingClientRect();
              const mirrorRect = getMirrorTargetRect(slotRect);
              await flyElement(flySrc, slotRect, mirrorRect, { arc: -140, tilt: -6 });
            }
          })();

          await Promise.all([returnPromise, takePromise]);
        } else {
          // Ninguna puesta: la nueva vuela hacia el espejo
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
        setReturningId(null);
        isBusyRef.current = false;
        useHandCursorStore.getState().setBusy(false);
      }
    },
    [
      mode,
      active,
      items,
      selectGarment,
      kick,
      setFocus,
      getMirrorTargetRect,
      flyElement,
      registerTimeout,
    ],
  );

  const handCursor = useHandCursorStore((s) => s.cursor);
  const handLastEvent = useHandCursorStore((s) => s.lastEvent);

  // Cambio de foco por cursor de mano
  useEffect(() => {
    if (mode !== 'interactive' || !active || isBusyRef.current) return;
    if (handCursor.active && handCursor.index >= 0 && handCursor.index < items.length) {
      setFocus(handCursor.index);
    }
  }, [handCursor.active, handCursor.index, mode, active, items.length, setFocus]);

  // Evento take por mano
  useEffect(() => {
    if (mode !== 'interactive' || !active || isBusyRef.current) return;
    if (handLastEvent && handLastEvent.type === 'take') {
      handleTakeOrReturn(handLastEvent.index, handLastEvent.method ?? 'hand_dwell');
      useHandCursorStore.getState().clearLastEvent();
    }
  }, [handLastEvent, mode, active, handleTakeOrReturn]);

  // Interacción táctil / puntero con histéresis
  const handlePointerMove = (e: React.PointerEvent) => {
    if (mode !== 'interactive' || !active || isBusyRef.current) return;

    // Si el cursor de mano está activo, el puntero no cambia el foco (y viceversa durante la pausa)
    const isHandActive = useHandCursorStore.getState().cursor.active;
    const isPaused = useHandCursorStore.getState().pausedUntilMs > Date.now();
    if (isHandActive && !isPaused) return;

    useHandCursorStore.getState().pause(2000);

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
    if (mode !== 'interactive' || !active) return;

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
          handleTakeOrReturn(focusIdx, 'keyboard');
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const currentActiveId = useGarmentStore.getState().activeGarmentId;
        if (currentActiveId) {
          const activeIdx = items.findIndex((it) => it.id === currentActiveId);
          if (activeIdx !== -1) {
            handleTakeOrReturn(activeIdx, 'keyboard');
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
    active,
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

  // Reservar la altura de la leyenda (64px en pantallas compactas <=350px, 90px en <=450px, 120px en 672px estándar)
  const isCompact = panelHeight <= 350;
  const alturaLeyenda = isCompact ? 64 : panelHeight <= 450 ? 90 : 120;

  // Calcular garmentHeight: min(0.52 * panelHeight, panelHeight - alturaLeyenda - 58 (riel) - 50 (gancho) - 16) con mínimo de 120px
  const maxAvailableForGarment = panelHeight - alturaLeyenda - 58 - 50 - 16;
  const desiredGarmentHeight =
    panelHeight >= 600
      ? Math.round(panelHeight * 0.5238) // 352px exactos en 672px
      : Math.round(panelHeight * 0.52);

  const garmentHeight = Math.max(
    120,
    Math.min(desiredGarmentHeight, maxAvailableForGarment),
  );

  return (
    <section
      ref={panelRef}
      data-testid="rack-panel"
      data-mode={mode}
      aria-label="Perchero Suzuki"
      onPointerDown={() => useHandCursorStore.getState().pause(2000)}
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
          const isEmpty = activeGarmentId === item.id || returningId === item.id;

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
                if (mode === 'interactive' && active) {
                  useHandCursorStore.getState().pause(2000);
                  handleTakeOrReturn(idx, 'touch');
                }
              }}
            />
          );
        })}
      </div>

      {/* ── Leyenda inferior (RackCaption) ── */}
      <div
        style={{ height: `${alturaLeyenda}px` }}
        className="absolute left-0 right-0 bottom-2 pointer-events-auto"
      >
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
          compact={isCompact}
        />
      </div>
    </section>
  );
}
