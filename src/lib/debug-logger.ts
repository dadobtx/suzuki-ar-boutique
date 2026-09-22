import { isDebugMode } from './debug-mode';

export type DebugLogLevel =
  | 'log'
  | 'warn'
  | 'error'
  | 'window.error'
  | 'unhandledrejection';

export interface DebugLogEntry {
  id: number;
  timestamp: string;
  level: DebugLogLevel;
  message: string;
}

const MAX_LOG_ENTRIES = 50;
const debugLogs: DebugLogEntry[] = [];
let nextLogId = 1;
let isInitialized = false;

function formatTimestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function stringifyArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error)
        return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`.trim();
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

export function addDebugLog(level: DebugLogLevel, message: string): void {
  const entry: DebugLogEntry = {
    id: nextLogId++,
    timestamp: formatTimestamp(),
    level,
    message,
  };

  debugLogs.unshift(entry);
  if (debugLogs.length > MAX_LOG_ENTRIES) {
    debugLogs.pop();
  }
}

export function getDebugLogs(): readonly DebugLogEntry[] {
  return debugLogs;
}

export function clearDebugLogs(): void {
  debugLogs.length = 0;
}

/**
 * Initializes debug logging by capturing console methods and global errors.
 * Strictly no-op if isDebugMode() is false.
 */
export function initDebugLogger(): void {
  if (isInitialized) return;
  if (!isDebugMode()) return;

  isInitialized = true;

  // Preserve original console functions
  const origWarn = console.warn;
  const origError = console.error;
  const origLog = console.log;
  const origInfo = console.info;

  console.warn = function (...args: unknown[]) {
    try {
      addDebugLog('warn', stringifyArgs(args));
    } catch {
      // Ignore internal logger errors
    }
    return origWarn.apply(console, args);
  };

  console.error = function (...args: unknown[]) {
    try {
      addDebugLog('error', stringifyArgs(args));
    } catch {
      // Ignore internal logger errors
    }
    return origError.apply(console, args);
  };

  console.log = function (...args: unknown[]) {
    try {
      addDebugLog('log', stringifyArgs(args));
    } catch {
      // Ignore internal logger errors
    }
    return origLog.apply(console, args);
  };

  console.info = function (...args: unknown[]) {
    try {
      addDebugLog('log', stringifyArgs(args));
    } catch {
      // Ignore internal logger errors
    }
    return origInfo.apply(console, args);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      const msg =
        event.error instanceof Error
          ? `${event.error.name}: ${event.error.message}`
          : event.message || 'Unknown window error';
      addDebugLog('window.error', msg);
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const msg =
        reason instanceof Error
          ? `${reason.name}: ${reason.message}`
          : typeof reason === 'string'
            ? reason
            : 'Unhandled promise rejection';
      addDebugLog('unhandledrejection', msg);
    });
  }
}
