import { isActiveZoneEnabled } from './active-zone';
import { isDebugMode } from './debug-mode';

export const HAND_INPUT_STORAGE_KEY = 'suzuki-hand-input';

export function parseHandInputFlag(val: string | null | undefined): boolean | null {
  if (val === null || val === undefined) return null;
  const lower = val.trim().toLowerCase();
  if (lower === '1' || lower === 'true' || lower === 'on') return true;
  if (lower === '0' || lower === 'false' || lower === 'off') return false;
  return null;
}

export function readUrlHandInput(): boolean | null {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }

  // 1. window.location.search (?hand=...)
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const parsed = parseHandInputFlag(searchParams.get('hand'));
    if (parsed !== null) return parsed;
  } catch {
    // Ignore URL parsing errors
  }

  // 2. window.location.hash (#/...?...&hand=...)
  try {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex));
      const parsed = parseHandInputFlag(hashParams.get('hand'));
      if (parsed !== null) return parsed;
    }
  } catch {
    // Ignore URL parsing errors
  }

  return null;
}

export function readSessionHandInput(): boolean | null {
  try {
    const val = sessionStorage.getItem(HAND_INPUT_STORAGE_KEY);
    return parseHandInputFlag(val);
  } catch {
    return null;
  }
}

export function writeSessionHandInput(enabled: boolean): void {
  try {
    sessionStorage.setItem(HAND_INPUT_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // sessionStorage unavailable
  }
}

/**
 * Prioridad: ?hand=1 / ?hand=0 (search o hash) > sessionStorage('suzuki-hand-input') > VITE_HAND_INPUT > OFF.
 */
export function isHandInputEnabled(): boolean {
  // 1. URL (?hand=1 / ?hand=0 en search o hash)
  const fromUrl = readUrlHandInput();
  if (fromUrl !== null) {
    return fromUrl;
  }

  // 2. Si hand_sim=1 y debug=1, la entrada por mano queda activa para QA
  if (isHandSimEnabled()) {
    return true;
  }

  // 3. sessionStorage
  const fromSession = readSessionHandInput();
  if (fromSession !== null) {
    return fromSession;
  }

  // 3. Environment variable VITE_HAND_INPUT
  const envVal = parseHandInputFlag(import.meta.env?.VITE_HAND_INPUT);
  if (envVal !== null) {
    return envVal;
  }

  // 4. Default: OFF
  return false;
}

/**
 * Hand input fuerza la zona activa a ON.
 */
export function isEffectiveActiveZoneEnabled(): boolean {
  return isActiveZoneEnabled() || isHandInputEnabled();
}

/**
 * Modo simulado para QA: ?hand_sim=1 (en search o hash), SOLO con ?debug=1.
 */
export function isHandSimEnabled(): boolean {
  if (!isDebugMode()) return false;
  if (typeof window === 'undefined' || !window.location) return false;

  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('hand_sim') === '1') return true;
  } catch {
    // ignore
  }

  try {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex));
      if (hashParams.get('hand_sim') === '1') return true;
    }
  } catch {
    // ignore
  }

  return false;
}

/**
 * Parámetro de diagnóstico para QA: ?hand_fps=10 (o cualquier número), SOLO con ?debug=1.
 */
export function readHandFpsParam(): number | null {
  if (!isDebugMode()) return null;
  if (typeof window === 'undefined' || !window.location) return null;

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const val = searchParams.get('hand_fps');
    if (val !== null) {
      const parsed = parseFloat(val);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // ignore
  }

  try {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex));
      const val = hashParams.get('hand_fps');
      if (val !== null) {
        const parsed = parseFloat(val);
        if (!Number.isNaN(parsed) && parsed > 0) return parsed;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Indicador para habilitar confirmación por permanencia (dwell legacy): ?hand_dwell=1
 */
export function isHandDwellEnabled(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('hand_dwell') === '1') return true;
  } catch {
    // ignore
  }
  try {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex));
      if (hashParams.get('hand_dwell') === '1') return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Indicador para modo de mapeo absoluto legacy: ?hand_mode=absolute
 */
export function isHandAbsoluteModeEnabled(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('hand_mode') === 'absolute') return true;
  } catch {
    // ignore
  }
  try {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex));
      if (hashParams.get('hand_mode') === 'absolute') return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Indicador para modo de palanca continua v2/v3: ?hand_mode=palanca
 */
export function isHandLeverModeEnabled(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('hand_mode') === 'palanca') return true;
  } catch {
    // ignore
  }
  try {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex));
      if (hashParams.get('hand_mode') === 'palanca') return true;
    }
  } catch {
    // ignore
  }
  return false;
}
