/**
 * Detects if debug mode is active via URL query param (?debug=1).
 * Supports standard search (?debug=1) and hash routing (#/path?debug=1).
 */
export function isDebugMode(): boolean {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }

  // 1. Check window.location.search (?debug=1)
  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('debug') === '1') {
      return true;
    }
  } catch {
    // Ignore URL parsing errors
  }

  // 2. Check window.location.hash (#/...?...&debug=1)
  try {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex));
      if (hashParams.get('debug') === '1') {
        return true;
      }
    }
  } catch {
    // Ignore URL parsing errors
  }

  return false;
}

/**
 * Detects if operator mode is active via URL query param (?debug=1 or ?dev=1).
 * Supports standard search (?debug=1, ?dev=1) and hash routing (#/path?debug=1 or dev=1).
 */
export function isOperatorMode(): boolean {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }

  // 1. Check window.location.search (?debug=1 or ?dev=1)
  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('debug') === '1' || searchParams.get('dev') === '1') {
      return true;
    }
  } catch {
    // Ignore URL parsing errors
  }

  // 2. Check window.location.hash (#/...?...&debug=1 or dev=1)
  try {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex));
      if (hashParams.get('debug') === '1' || hashParams.get('dev') === '1') {
        return true;
      }
    }
  } catch {
    // Ignore URL parsing errors
  }

  return false;
}
