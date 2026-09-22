import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isDebugMode } from '@/lib/debug-mode';
import {
  initDebugLogger,
  getDebugLogs,
  clearDebugLogs,
  addDebugLog,
} from '@/lib/debug-logger';

describe('Diagnostic Overlay & Debug Mode', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    clearDebugLogs();
  });

  afterEach(() => {
    // Restore window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  function setMockLocation(search: string, hash: string) {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...originalLocation,
        search,
        hash,
      },
    });
  }

  describe('isDebugMode()', () => {
    it('returns false when no debug parameter is provided', () => {
      setMockLocation('', '');
      expect(isDebugMode()).toBe(false);

      setMockLocation('?pro=1', '#/kiosk');
      expect(isDebugMode()).toBe(false);
    });

    it('returns true when ?debug=1 is in window.location.search', () => {
      setMockLocation('?debug=1', '');
      expect(isDebugMode()).toBe(true);

      setMockLocation('?pro=1&debug=1', '#/');
      expect(isDebugMode()).toBe(true);
    });

    it('returns true when debug=1 is inside window.location.hash query', () => {
      setMockLocation('', '#/?debug=1');
      expect(isDebugMode()).toBe(true);

      setMockLocation('', '#/kiosk?mode=test&debug=1');
      expect(isDebugMode()).toBe(true);
    });

    it('returns false when debug has other values like debug=0 or debug=true', () => {
      setMockLocation('?debug=0', '');
      expect(isDebugMode()).toBe(false);

      setMockLocation('?debug=true', '');
      expect(isDebugMode()).toBe(false);
    });
  });

  describe('console identity when debug mode is disabled', () => {
    it('does NOT alter or wrap console.warn, console.error, console.log or console.info without ?debug=1', () => {
      setMockLocation('', '#/');
      expect(isDebugMode()).toBe(false);

      const warnBefore = console.warn;
      const errorBefore = console.error;
      const logBefore = console.log;
      const infoBefore = console.info;

      initDebugLogger();

      expect(console.warn).toBe(warnBefore);
      expect(console.error).toBe(errorBefore);
      expect(console.log).toBe(logBefore);
      expect(console.info).toBe(infoBefore);
    });
  });

  describe('debug log buffer and limits', () => {
    it('caps log buffer at 50 entries and maintains newest first', () => {
      for (let i = 1; i <= 60; i++) {
        addDebugLog('log', `Message ${i}`);
      }

      const logs = getDebugLogs();
      expect(logs.length).toBe(50);
      // Newest should be Message 60
      expect(logs[0].message).toBe('Message 60');
      // Oldest kept should be Message 11
      expect(logs[49].message).toBe('Message 11');
    });

    it('records timestamp and log levels correctly', () => {
      addDebugLog('warn', 'warning message');
      addDebugLog('error', 'error message');

      const logs = getDebugLogs();
      expect(logs[0].level).toBe('error');
      expect(logs[0].message).toBe('error message');
      expect(logs[0].timestamp).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);

      expect(logs[1].level).toBe('warn');
      expect(logs[1].message).toBe('warning message');
    });
  });
});
