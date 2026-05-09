import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';

interface DprCanvasResult {
  dpr: number;
  width: number;
  height: number;
}

/**
 * DPR-aware canvas sizing hook.
 *
 * Pattern from plan §3.1:
 *   canvas.width  = Math.round(cssWidth * dpr)
 *   canvas.height = Math.round(cssHeight * dpr)
 *   canvas.style.width  = `${cssWidth}px`
 *   canvas.style.height = `${cssHeight}px`
 *   ctx.scale(dpr, dpr)
 *
 * All drawing logic operates in CSS coordinates after this.
 * Recalculates on container resize (ResizeObserver) and DPR change (monitor switch).
 */
export function useDprCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  containerRef: RefObject<HTMLElement | null>,
): DprCanvasResult {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const rafId = useRef(0);

  const applySize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const currentDpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const cssWidth = rect.width;
    const cssHeight = rect.height;

    canvas.width = Math.round(cssWidth * currentDpr);
    canvas.height = Math.round(cssHeight * currentDpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
    }

    setDpr(currentDpr);
    setSize({ width: cssWidth, height: cssHeight });
  }, [canvasRef, containerRef]);

  // ResizeObserver for container size changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(applySize);
    });

    ro.observe(container);
    applySize(); // initial sizing

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId.current);
    };
  }, [containerRef, applySize]);

  // DPR change listener (e.g. moving window to different-DPR monitor)
  useEffect(() => {
    const mql = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const handler = () => applySize();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [dpr, applySize]);

  return { dpr, width: size.width, height: size.height };
}
