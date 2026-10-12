import { describe, it, expect } from 'vitest';
import {
  computeMirrorTargetRect,
  sanitizeSlotRect,
  type Rect,
} from '@/components/rack/rack-geometry';

describe('computeMirrorTargetRect - contain destination inside torso box (34% x 42% at y=45%)', () => {
  const tabletMirror: Rect = {
    left: 0,
    top: 0,
    width: 1080,
    height: 1150,
  };

  const maxBoxW = tabletMirror.width * 0.34; // 367.2
  const maxBoxH = tabletMirror.height * 0.42; // 483
  const expectedCenterX = tabletMirror.left + tabletMirror.width * 0.5; // 540
  const expectedCenterY = tabletMirror.top + tabletMirror.height * 0.45; // 517.5

  it('contains tall garment (from 60x170) strictly within the 34% x 42% box centered at torso', () => {
    const fromTall: Rect = {
      left: 100,
      top: 1300,
      width: 60,
      height: 170,
    };

    const target = computeMirrorTargetRect(tabletMirror, fromTall);

    // Height is the limiting factor: 483 / 170 = 2.841176...
    // target.height = 483, target.width = 60 * 2.841176... = 170.47
    expect(target.width).toBeLessThanOrEqual(maxBoxW + 0.001);
    expect(target.height).toBeLessThanOrEqual(maxBoxH + 0.001);
    expect(target.height).toBeCloseTo(483, 1);
    expect(target.width).toBeCloseTo(170.47, 1);

    // Centered at torso (x = 540, y = 517.5)
    const targetCenterX = target.left + target.width * 0.5;
    const targetCenterY = target.top + target.height * 0.5;
    expect(targetCenterX).toBeCloseTo(expectedCenterX, 1);
    expect(targetCenterY).toBeCloseTo(expectedCenterY, 1);
  });

  it('contains square garment (from 120x120) strictly within the 34% x 42% box centered at torso', () => {
    const fromSquare: Rect = {
      left: 200,
      top: 1300,
      width: 120,
      height: 120,
    };

    const target = computeMirrorTargetRect(tabletMirror, fromSquare);

    // Width is the limiting factor: 367.2 / 120 = 3.06
    // target.width = 367.2, target.height = 367.2
    expect(target.width).toBeLessThanOrEqual(maxBoxW + 0.001);
    expect(target.height).toBeLessThanOrEqual(maxBoxH + 0.001);
    expect(target.width).toBeCloseTo(367.2, 1);
    expect(target.height).toBeCloseTo(367.2, 1);

    // Centered at torso (x = 540, y = 517.5)
    const targetCenterX = target.left + target.width * 0.5;
    const targetCenterY = target.top + target.height * 0.5;
    expect(targetCenterX).toBeCloseTo(expectedCenterX, 1);
    expect(targetCenterY).toBeCloseTo(expectedCenterY, 1);
  });

  it('limits destination rect to at most 34% width and 42% height when given an enormous rect', () => {
    const enormousSource: Rect = {
      left: 100,
      top: 1350,
      width: 10,
      height: 5000,
    };

    const target = computeMirrorTargetRect(tabletMirror, enormousSource);

    expect(target.width).toBeLessThanOrEqual(maxBoxW + 0.001);
    expect(target.height).toBeLessThanOrEqual(maxBoxH + 0.001);

    const targetCenterX = target.left + target.width * 0.5;
    const targetCenterY = target.top + target.height * 0.5;
    expect(targetCenterX).toBeCloseTo(expectedCenterX, 1);
    expect(targetCenterY).toBeCloseTo(expectedCenterY, 1);
  });
});

describe('sanitizeSlotRect - collapsed dimensions protection', () => {
  it('provides safe fallback dimensions if slot width or height is <= 0', () => {
    const collapsedSlot: Rect = {
      left: 200,
      top: 1350,
      width: 0,
      height: 0,
    };

    const sanitized = sanitizeSlotRect(collapsedSlot);
    expect(sanitized.width).toBe(120);
    expect(sanitized.height).toBe(120);
    expect(sanitized.left).toBe(200);
    expect(sanitized.top).toBe(1350);
  });

  it('preserves valid slot rects intact without distortion', () => {
    const validTallSlot: Rect = {
      left: 100,
      top: 1350,
      width: 60,
      height: 170,
    };

    const sanitized = sanitizeSlotRect(validTallSlot);
    expect(sanitized).toEqual(validTallSlot);
  });
});
