import { describe, it, expect } from 'vitest';
import { OneEuroFilter, Point3DFilter } from '@/lib/one-euro-filter';

describe('OneEuroFilter', () => {
  it('converges on a noisy signal', () => {
    const filter = new OneEuroFilter({ fcmin: 1.0, beta: 0.007 });
    const target = 100;

    // Send a noisy signal oscillating around target
    let filtered = 0;
    for (let i = 0; i < 100; i++) {
      const noise = (Math.random() - 0.5) * 10;
      filtered = filter.filter(target + noise, i * 33); // 30fps = ~33ms
    }

    // Should converge close to target
    expect(filtered).toBeGreaterThan(95);
    expect(filtered).toBeLessThan(105);
  });

  it('handles step response (quick movement)', () => {
    const filter = new OneEuroFilter();

    // Stable at 0
    filter.filter(0, 0);
    filter.filter(0, 33);

    // Big step to 100
    filter.filter(100, 66);
    filter.filter(100, 99);
    const out = filter.filter(100, 132);

    // With default parameters, it should follow the step closely after a few frames
    expect(out).toBeGreaterThan(80);
  });

  it('handles edge cases (NaN, Infinity)', () => {
    const filter = new OneEuroFilter();

    expect(filter.filter(NaN, 100)).toBeNaN();
    expect(filter.filter(Infinity, 100)).toBe(Infinity);
  });

  it('handles invalid time steps (t=0 or negative)', () => {
    const filter = new OneEuroFilter();

    const v1 = filter.filter(10, 100);
    expect(v1).toBe(10);

    // Negative delta should reset
    const v2 = filter.filter(20, 50);
    expect(v2).toBe(20);
  });
});

describe('Point3DFilter', () => {
  it('filters 3D points independently', () => {
    const filter = new Point3DFilter();

    const pt1 = { x: 0, y: 0, z: 0, visibility: 0.9 };
    const out1 = filter.filterPoint(pt1, 0);
    expect(out1).toEqual(pt1);

    const pt2 = { x: 100, y: -50, z: 10, visibility: 0.9 };
    const out2 = filter.filterPoint(pt2, 33);

    expect(out2.x).toBeGreaterThan(0);
    expect(out2.y).toBeLessThan(0);
    expect(out2.visibility).toBe(0.9); // Passes through extra properties
  });
});
