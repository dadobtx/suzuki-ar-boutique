/**
 * Unificación de reloj: convierte la marca de pausa táctil del store (Date.now(), época Unix)
 * a la escala de tiempo de alta resolución (performance.now()) que utiliza el HandCursorTracker.
 *
 * Si la pausa aún no expira (pausedUntilEpochMs > epochNowMs), proyecta el remanente en ms
 * sobre perfNowMs. Si ya expiró o no hay pausa, devuelve 0.
 */
export function toTrackerPauseUntil(
  pausedUntilEpochMs: number,
  perfNowMs: number,
  epochNowMs: number,
): number {
  return pausedUntilEpochMs > epochNowMs
    ? perfNowMs + (pausedUntilEpochMs - epochNowMs)
    : 0;
}
