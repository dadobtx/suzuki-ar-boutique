import { describe, it, expect } from 'vitest';
import {
  computeFraming,
  computeFramingMetrics,
  FramingHysteresis,
  FRAMING_TOO_CLOSE,
  FRAMING_TOO_FAR,
  HEAD_CUT,
  type LandmarkPoint,
} from '@/lib/body-framing';

function createLandmarks(sw: number, headTop: number): LandmarkPoint[] {
  const lm: LandmarkPoint[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0.9,
  }));
  // 0: nose, 2: left eye, 5: right eye
  lm[0] = { x: 0.5, y: headTop + 0.01 };
  lm[2] = { x: 0.48, y: headTop };
  lm[5] = { x: 0.52, y: headTop };

  // 11: left shoulder, 12: right shoulder
  lm[11] = { x: 0.5 - sw / 2, y: 0.4 };
  lm[12] = { x: 0.5 + sw / 2, y: 0.4 };
  return lm;
}

describe('body-framing logic', () => {
  it('exports expected framing threshold constants', () => {
    expect(FRAMING_TOO_CLOSE).toBe(0.3);
    expect(FRAMING_TOO_FAR).toBe(0.12);
    expect(HEAD_CUT).toBe(0.03);
  });

  it('handles null, undefined, or incomplete landmarks gracefully', () => {
    expect(computeFraming(null)).toBe('ok');
    expect(computeFraming(undefined)).toBe('ok');
    expect(computeFraming([])).toBe('ok');
    expect(computeFramingMetrics(null)).toEqual({
      framing: 'ok',
      sw: null,
      headTop: null,
    });
  });

  it('detects headCut when headTop < HEAD_CUT (0.03)', () => {
    const lm = createLandmarks(0.2, 0.01);
    const metrics = computeFramingMetrics(lm);
    expect(metrics.framing).toBe('headCut');
    expect(metrics.headTop).toBeCloseTo(0.01);
    expect(metrics.sw).toBeCloseTo(0.2);
  });

  it('detects tooClose when sw > FRAMING_TOO_CLOSE (0.30)', () => {
    const lm = createLandmarks(0.35, 0.1);
    const metrics = computeFramingMetrics(lm);
    expect(metrics.framing).toBe('tooClose');
    expect(metrics.sw).toBeCloseTo(0.35);
  });

  it('detects tooFar when sw < FRAMING_TOO_FAR (0.12)', () => {
    const lm = createLandmarks(0.08, 0.15);
    const metrics = computeFramingMetrics(lm);
    expect(metrics.framing).toBe('tooFar');
    expect(metrics.sw).toBeCloseTo(0.08);
  });

  it('returns ok when framing is within standard thresholds', () => {
    const lm = createLandmarks(0.22, 0.08);
    const metrics = computeFramingMetrics(lm);
    expect(metrics.framing).toBe('ok');
    expect(metrics.sw).toBeCloseTo(0.22);
    expect(metrics.headTop).toBeCloseTo(0.08);
  });

  it('prioritizes headCut over tooClose and tooFar', () => {
    // Both headCut and tooClose
    const lmCutAndClose = createLandmarks(0.35, 0.01);
    expect(computeFraming(lmCutAndClose)).toBe('headCut');

    // Both headCut and tooFar
    const lmCutAndFar = createLandmarks(0.08, 0.01);
    expect(computeFraming(lmCutAndFar)).toBe('headCut');
  });

  it('applies hysteresis filter: only transitions after delayMs (1000ms)', () => {
    const filter = new FramingHysteresis(1000, 'ok');

    // At t = 100: candidate becomes tooClose, but current stays 'ok'
    expect(filter.update('tooClose', 100)).toBe('ok');

    // At t = 600: 500ms elapsed, still 'ok'
    expect(filter.update('tooClose', 600)).toBe('ok');

    // At t = 1099: 999ms elapsed, still 'ok'
    expect(filter.update('tooClose', 1099)).toBe('ok');

    // At t = 1100: 1000ms elapsed, commits 'tooClose'
    expect(filter.update('tooClose', 1100)).toBe('tooClose');
    expect(filter.getCurrent()).toBe('tooClose');

    // Flapping candidate: reverts back to 'ok' at t = 1200
    expect(filter.update('ok', 1200)).toBe('tooClose');
    // Candidate changes to 'tooFar' at t = 1300 -> resets candidate timer
    expect(filter.update('tooFar', 1300)).toBe('tooClose');
    // At t = 2299 (999ms since 1300), still 'tooClose'
    expect(filter.update('tooFar', 2299)).toBe('tooClose');
    // At t = 2300 (1000ms since 1300), becomes 'tooFar'
    expect(filter.update('tooFar', 2300)).toBe('tooFar');
  });

  it('resets hysteresis to initial state', () => {
    const filter = new FramingHysteresis(1000, 'ok');
    filter.update('tooClose', 100);
    filter.update('tooClose', 1200);
    expect(filter.getCurrent()).toBe('tooClose');

    filter.reset('ok');
    expect(filter.getCurrent()).toBe('ok');
  });
});
