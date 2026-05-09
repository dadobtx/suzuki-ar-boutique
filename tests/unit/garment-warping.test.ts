import { describe, it, expect, vi } from 'vitest';
import { computeAffineTransform, warpGarment } from '../../src/lib/garment-warping';
import type { Point } from '../../src/lib/garment-warping';

describe('garment-warping math', () => {
  it('computes identity transform when src == dst', () => {
    const src: [Point, Point, Point] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    const dst = src;

    const transform = computeAffineTransform(src, dst);
    expect(transform).not.toBeNull();
    if (!transform) return;

    // Expected identity matrix: [1, 0, 0, 1, 0, 0]
    const [a, b, c, d, e, f] = transform;
    expect(a).toBeCloseTo(1);
    expect(b).toBeCloseTo(0);
    expect(c).toBeCloseTo(0);
    expect(d).toBeCloseTo(1);
    expect(e).toBeCloseTo(0);
    expect(f).toBeCloseTo(0);
  });

  it('computes scaling transform correctly', () => {
    const src: [Point, Point, Point] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    const dst: [Point, Point, Point] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 }, // Scaled x by 2
      { x: 0, y: 30 }, // Scaled y by 3
    ];

    const transform = computeAffineTransform(src, dst);
    expect(transform).not.toBeNull();
    if (!transform) return;

    // Expected scaling matrix: [2, 0, 0, 3, 0, 0]
    const [a, b, c, d, e, f] = transform;
    expect(a).toBeCloseTo(2);
    expect(b).toBeCloseTo(0);
    expect(c).toBeCloseTo(0);
    expect(d).toBeCloseTo(3);
    expect(e).toBeCloseTo(0);
    expect(f).toBeCloseTo(0);
  });

  it('computes translation transform correctly', () => {
    const src: [Point, Point, Point] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    const dst: [Point, Point, Point] = [
      { x: 5, y: 15 },
      { x: 15, y: 15 },
      { x: 5, y: 25 },
    ];

    const transform = computeAffineTransform(src, dst);
    expect(transform).not.toBeNull();
    if (!transform) return;

    // Expected translation matrix: [1, 0, 0, 1, 5, 15]
    const [a, b, c, d, e, f] = transform;
    expect(a).toBeCloseTo(1);
    expect(b).toBeCloseTo(0);
    expect(c).toBeCloseTo(0);
    expect(d).toBeCloseTo(1);
    expect(e).toBeCloseTo(5);
    expect(f).toBeCloseTo(15);
  });

  it('returns null for collinear points', () => {
    const src: [Point, Point, Point] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ];
    const dst: [Point, Point, Point] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];

    const transform = computeAffineTransform(src, dst);
    expect(transform).toBeNull();
  });
});

describe('warpGarment', () => {
  it('early returns if < 3 anchors', () => {
    const ctx = {
      save: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    warpGarment(ctx, {} as CanvasImageSource, [{ x: 0, y: 0 }], [{ x: 0, y: 0 }]);
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('performs Delaunay triangulation and calls canvas API', () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      transform: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    const img = {} as CanvasImageSource;

    // A square made of 4 points -> 2 triangles
    const anchorsSrc: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ];
    const anchorsDst = anchorsSrc;

    warpGarment(ctx, img, anchorsSrc, anchorsDst);

    // Context should be saved around the whole function, and around each of the 2 triangles
    expect(ctx.save).toHaveBeenCalledTimes(1 + 2);
    // Transform should have been called 2 times (once per triangle)
    expect(ctx.transform).toHaveBeenCalledTimes(2);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect(ctx.clip).toHaveBeenCalledTimes(2);
    expect(ctx.restore).toHaveBeenCalledTimes(1 + 2);
  });
});
