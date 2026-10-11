import { describe, it, expect } from 'vitest';
import {
  computeMirrorTargetRect,
  sanitizeSlotRect,
  type Rect,
} from '@/components/rack/rack-geometry';

describe('computeMirrorTargetRect - destination rect calculation and safety limits', () => {
  const standardMirror: Rect = {
    left: 0,
    top: 0,
    width: 1080,
    height: 1248,
  };

  it('calculates expected chest-centered square destination for standard garment', () => {
    const source: Rect = {
      left: 100,
      top: 1350,
      width: 352,
      height: 352,
    };

    const target = computeMirrorTargetRect(standardMirror, source);

    // 45% of 1080 = 486
    expect(target.width).toBeCloseTo(486, 1);
    expect(target.height).toBeCloseTo(486, 1);

    // Centered at x = 540, y = 1248 * 0.38 = 474.24
    expect(target.left).toBeCloseTo(540 - 243, 1); // 297
    expect(target.top).toBeCloseTo(474.24 - 243, 1); // 231.24
  });

  it('limits destination rect to at most 70% width and 60% height when given an enormous or distorted rect', () => {
    // Simulating an extreme distorted rect from collapsed/rotated element (e.g., width 10, height 5000)
    const enormousSource: Rect = {
      left: 100,
      top: 1350,
      width: 10,
      height: 5000,
    };

    const target = computeMirrorTargetRect(standardMirror, enormousSource);

    const maxAllowedWidth = standardMirror.width * 0.7; // 756
    const maxAllowedHeight = standardMirror.height * 0.6; // 748.8

    // Must be bounded within limits
    expect(target.width).toBeLessThanOrEqual(maxAllowedWidth + 0.001);
    expect(target.height).toBeLessThanOrEqual(maxAllowedHeight + 0.001);

    // Must remain centered on the target chest position
    const targetCenterX = target.left + target.width * 0.5;
    const targetCenterY = target.top + target.height * 0.5;

    const expectedCenterX = standardMirror.left + standardMirror.width * 0.5; // 540
    const expectedCenterY = standardMirror.top + standardMirror.height * 0.38; // 474.24

    expect(targetCenterX).toBeCloseTo(expectedCenterX, 1);
    expect(targetCenterY).toBeCloseTo(expectedCenterY, 1);
  });

  it('clamps huge dimensions for arbitrary large aspect inputs', () => {
    const mirror: Rect = { left: 50, top: 100, width: 800, height: 1000 };
    // Extremely wide source
    const hugeWideSource: Rect = { left: 0, top: 0, width: 10000, height: 100 };
    const targetWide = computeMirrorTargetRect(mirror, hugeWideSource);

    expect(targetWide.width).toBeLessThanOrEqual(mirror.width * 0.7);
    expect(targetWide.height).toBeLessThanOrEqual(mirror.height * 0.6);

    // Extremely tall source
    const hugeTallSource: Rect = { left: 0, top: 0, width: 100, height: 10000 };
    const targetTall = computeMirrorTargetRect(mirror, hugeTallSource);

    expect(targetTall.width).toBeLessThanOrEqual(mirror.width * 0.7);
    expect(targetTall.height).toBeLessThanOrEqual(mirror.height * 0.6);
  });
});

describe('sanitizeSlotRect - 3D foreshortened slot normalization', () => {
  it('normalizes a foreshortened slot (rotateY 76deg: width 85, height 352) to square 352x352 centered on hanger', () => {
    const rotatedSlot: Rect = {
      left: 200,
      top: 1350,
      width: 85,
      height: 352,
    };

    const sanitized = sanitizeSlotRect(rotatedSlot);
    expect(sanitized.width).toBe(352);
    expect(sanitized.height).toBe(352);

    // Center should be preserved
    const originalCenter = 200 + 85 * 0.5; // 242.5
    const sanitizedCenter = sanitized.left + sanitized.width * 0.5;
    expect(sanitizedCenter).toBeCloseTo(originalCenter, 1);
  });

  it('leaves already open or square slots untouched', () => {
    const squareSlot: Rect = {
      left: 100,
      top: 1350,
      width: 352,
      height: 352,
    };

    const sanitized = sanitizeSlotRect(squareSlot);
    expect(sanitized).toEqual(squareSlot);
  });
});
