import { describe, it, expect } from 'vitest';
import {
  p95,
  percentile,
  average,
  calculateDetectionRate,
  calculateMatchRate,
  calculatePalmWidth,
  filterSlidingWindow,
  calculateFpsFromTimestamps,
  getDominantGesture,
  escapeCsvField,
  recordsToCsv,
  matchesRequestedGesture,
  type DiagHandRecord,
} from '@/lib/diag-hand-stats';

describe('diag-hand-stats pure functions', () => {
  describe('p95 and percentile with known datasets', () => {
    it('returns 0 for empty array', () => {
      expect(p95([])).toBe(0);
      expect(percentile([], 50)).toBe(0);
    });

    it('returns the single element for 1-item array', () => {
      expect(p95([42])).toBe(42);
      expect(percentile([42], 50)).toBe(42);
    });

    it('calculates p95 correctly on known 100-number dataset (1 to 100)', () => {
      const numbers = Array.from({ length: 100 }, (_, i) => i + 1);
      // Index for 95% in 0-indexed 100 items: 0.95 * 99 = 94.05 -> interpolation between 95 and 96
      const val = p95(numbers);
      expect(val).toBeCloseTo(95.05, 2);
    });

    it('calculates p95 on known latency values', () => {
      const latencies = [10, 12, 11, 15, 14, 13, 12, 10, 11, 25]; // 10 elements
      // sorted: [10, 10, 11, 11, 12, 12, 13, 14, 15, 25]
      // 0.95 * 9 = 8.55 -> between index 8 (15) and 9 (25)
      const val = p95(latencies);
      expect(val).toBeCloseTo(15 + 0.55 * (25 - 15), 2); // 20.5
    });

    it('calculates average correctly', () => {
      expect(average([])).toBe(0);
      expect(average([10, 20, 30])).toBe(20);
    });
  });

  describe('detection rate & gesture matching', () => {
    it('calculates detection rate', () => {
      expect(calculateDetectionRate([])).toBe(0);
      const samples = [
        { hasHand: true },
        { hasHand: false },
        { hasHand: true },
        { hasHand: true },
      ];
      expect(calculateDetectionRate(samples)).toBe(75);
    });

    it('matches gestures properly with aliases and Spanish terms', () => {
      expect(matchesRequestedGesture('Open_Palm', 'Palma abierta')).toBe(true);
      expect(matchesRequestedGesture('Closed_Fist', 'Puño')).toBe(true);
      expect(matchesRequestedGesture('Pointing_Up', 'Índice arriba')).toBe(true);
      expect(matchesRequestedGesture(null, 'Mano bajada')).toBe(true);
      expect(matchesRequestedGesture('None', 'Mano bajada')).toBe(true);
      expect(matchesRequestedGesture('Closed_Fist', 'Palma abierta')).toBe(false);
    });

    it('calculates match rate accurately', () => {
      expect(calculateMatchRate([], 'Palma abierta')).toBe(0);
      const samples = [
        { gesture: 'Open_Palm' },
        { gesture: 'Open_Palm' },
        { gesture: 'Closed_Fist' },
        { gesture: null },
      ];
      expect(calculateMatchRate(samples, 'Palma abierta')).toBe(50);
    });
  });

  describe('palm width calculation', () => {
    it('calculates palm width in pixels between landmark 5 and 17', () => {
      const lm5 = { x: 0.4, y: 0.5 };
      const lm17 = { x: 0.5, y: 0.5 };
      const width = 1280;
      const height = 720;
      // dx = 0.1 * 1280 = 128px, dy = 0
      const palmWidth = calculatePalmWidth(lm5, lm17, width, height);
      expect(palmWidth).toBeCloseTo(128, 2);
    });
  });

  describe('sliding window & fps', () => {
    it('filters samples within window', () => {
      const now = 10000;
      const samples = [
        { timestamp: 4000, value: 1 }, // > 5s old
        { timestamp: 6000, value: 2 }, // in window
        { timestamp: 9500, value: 3 }, // in window
      ];
      const filtered = filterSlidingWindow(samples, now, 5000);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].value).toBe(2);
      expect(filtered[1].value).toBe(3);
    });

    it('calculates fps from timestamps in window', () => {
      expect(calculateFpsFromTimestamps([])).toBe(0);
      expect(calculateFpsFromTimestamps([1000])).toBe(0);
      // 11 frames over 1000 ms = 10 intervals in 1 second = 10 fps
      const timestamps = Array.from({ length: 11 }, (_, i) => 1000 + i * 100);
      const fps = calculateFpsFromTimestamps(timestamps, 5000);
      expect(fps).toBeCloseTo(10, 1);
    });

    it('identifies dominant gesture and score', () => {
      const samples = [
        { gesture: 'Open_Palm', gestureScore: 0.9 },
        { gesture: 'Open_Palm', gestureScore: 0.8 },
        { gesture: 'Closed_Fist', gestureScore: 0.95 },
        { gesture: 'None', gestureScore: 0 },
      ];
      const dom = getDominantGesture(samples);
      expect(dom).not.toBeNull();
      expect(dom?.gesture).toBe('Open_Palm');
      expect(dom?.count).toBe(2);
      expect(dom?.avgScore).toBeCloseTo(0.85, 2);
    });
  });

  describe('CSV serialization', () => {
    it('escapes fields with commas, quotes, newlines and preserves accents', () => {
      expect(escapeCsvField('normal')).toBe('normal');
      expect(escapeCsvField('hello, world')).toBe('"hello, world"');
      expect(escapeCsvField('quote "test"')).toBe('"quote ""test"""');
      expect(escapeCsvField('line\nbreak')).toBe('"line\nbreak"');
      expect(escapeCsvField('Índice arriba y Puño')).toBe('Índice arriba y Puño');
    });

    it('serializes full records to RFC 4180 CSV correctly with Spanish accents', () => {
      const records: DiagHandRecord[] = [
        {
          id: 'rec-1',
          timestamp: 1728169200000,
          camera: 'Integrated Webcam (04f2:b626)',
          resolution: '1280x720',
          distance: 2.0,
          requestedGesture: 'Índice arriba',
          detectionRate: 94.5,
          matchRate: 91.2,
          avgScore: 0.88,
          avgPalmWidthPx: 52.4,
          gestureFps: 29.8,
          poseFps: 29.5,
          gestureLatencyP95: 14.8,
          poseLatencyP95: 18.2,
          delegate: 'GPU',
          thresholds: 'det: 0.5, pres: 0.5, trk: 0.5',
        },
        {
          id: 'rec-2',
          timestamp: 1728169210000,
          camera: 'Redragon GW911, HD Webcam',
          resolution: '1920x1080',
          distance: 1.5,
          requestedGesture: 'Puño',
          detectionRate: 100.0,
          matchRate: 98.0,
          avgScore: 0.95,
          avgPalmWidthPx: 84.0,
          gestureFps: 30.0,
          poseFps: null,
          gestureLatencyP95: 12.1,
          poseLatencyP95: null,
          delegate: 'CPU',
          thresholds: 'det: 0.6, pres: 0.6, trk: 0.6',
        },
      ];

      const csv = recordsToCsv(records);
      const lines = csv.split('\r\n');

      expect(lines).toHaveLength(3); // header + 2 rows
      expect(lines[0]).toContain('Gesto pedido');
      expect(lines[0]).toContain('Inferencia P95 (ms)');

      // Row 1 contains accents
      expect(lines[1]).toContain('Índice arriba');
      // Thresholds contains commas, so must be quoted
      expect(lines[1]).toContain('"det: 0.5, pres: 0.5, trk: 0.5"');

      // Row 2 camera has comma, so must be quoted
      expect(lines[2]).toContain('"Redragon GW911, HD Webcam"');
      expect(lines[2]).toContain('Puño');
      expect(lines[2]).toContain('N/A'); // for null poseFps
    });
  });
});
