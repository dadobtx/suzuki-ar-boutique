import { describe, it, expect } from 'vitest';
import { computeCropOffset, videoToCss } from '../../src/lib/center-crop';

describe('computeCropOffset', () => {
  it('crops landscape 1280×720 to portrait 9:16 viewport', () => {
    // Container is 360×640 (9:16 aspect)
    const result = computeCropOffset(1280, 720, 360, 640);

    // Scale = 640/720 = 0.8889
    expect(result.scale).toBeCloseTo(640 / 720, 4);

    // visibleWidth = 720 * (360/640) = 405
    expect(result.visibleWidth).toBeCloseTo(405, 1);

    // cropX = (1280 - 405) / 2 = 437.5
    expect(result.cropX).toBeCloseTo(437.5, 1);
    expect(result.cropY).toBe(0);
    expect(result.visibleHeight).toBe(720);
  });

  it('crops landscape 1920×1080 to portrait 9:16 viewport', () => {
    const result = computeCropOffset(1920, 1080, 540, 960);

    expect(result.scale).toBeCloseTo(960 / 1080, 4);
    // visibleWidth = 1080 * (540/960) = 607.5
    expect(result.visibleWidth).toBeCloseTo(607.5, 1);
    // cropX = (1920 - 607.5) / 2 = 656.25
    expect(result.cropX).toBeCloseTo(656.25, 1);
    expect(result.cropY).toBe(0);
    expect(result.visibleHeight).toBe(1080);
  });

  it('no crop when video is already portrait (720×1280)', () => {
    const result = computeCropOffset(720, 1280, 360, 640);

    // videoAspect (0.5625) == containerAspect (0.5625) → no horizontal or vertical crop
    expect(result.cropX).toBe(0);
    expect(result.cropY).toBe(0);
    expect(result.visibleWidth).toBe(720);
    expect(result.visibleHeight).toBe(1280);
  });

  it('crops horizontally for 1:1 viewport with wider video', () => {
    const result = computeCropOffset(1280, 720, 500, 500);

    // containerAspect = 1, videoAspect = 1.78 → crop horizontally
    // scale = 500/720
    expect(result.scale).toBeCloseTo(500 / 720, 4);
    // visibleWidth = 720 * 1 = 720
    expect(result.visibleWidth).toBeCloseTo(720, 1);
    // cropX = (1280 - 720) / 2 = 280
    expect(result.cropX).toBeCloseTo(280, 1);
    expect(result.cropY).toBe(0);
    expect(result.visibleHeight).toBe(720);
  });

  it('handles zero dimensions gracefully', () => {
    const result = computeCropOffset(0, 0, 360, 640);
    expect(result.cropX).toBe(0);
    expect(result.cropY).toBe(0);
    expect(result.visibleWidth).toBe(0);
    expect(result.visibleHeight).toBe(0);
    expect(result.scale).toBe(1);
  });

  it('landscape viewport with landscape video → no horizontal or vertical crop', () => {
    // Container is 800×450 (16:9) — same aspect as video
    const result = computeCropOffset(1280, 720, 800, 450);

    expect(result.cropX).toBeCloseTo(0, 1);
    expect(result.cropY).toBeCloseTo(0, 1);
    expect(result.visibleWidth).toBeCloseTo(1280, 1);
    expect(result.visibleHeight).toBeCloseTo(720, 1);
  });

  it('crops portrait video 720×1280 in 800×832 container with vertical crop', () => {
    const result = computeCropOffset(720, 1280, 800, 832);

    expect(result.scale).toBeCloseTo(800 / 720, 4);
    expect(result.cropX).toBe(0);
    expect(result.cropY).toBeCloseTo(265.6, 1);
    expect(result.visibleHeight).toBeCloseTo(748.8, 1);
    expect(result.visibleWidth).toBe(720);

    // el centro del video (360, 640) mapea al centro del contenedor (400, 416)
    const center = videoToCss(360, 640, result);
    expect(center.x).toBeCloseTo(400, 1);
    expect(center.y).toBeCloseTo(416, 1);
  });

  it('crops landscape video 1280×720 in 1080×1248 container (32" kiosk portrait) with horizontal crop and no vertical crop', () => {
    const result = computeCropOffset(1280, 720, 1080, 1248);

    expect(result.cropY).toBe(0);
    expect(result.cropX).toBeGreaterThan(0);
  });

  it('maps (cropX, cropY) to (0, 0) and (cropX + visibleWidth, cropY + visibleHeight) to (containerWidth, containerHeight)', () => {
    const testCases = [
      { vw: 1280, vh: 720, cw: 360, ch: 640 },
      { vw: 720, vh: 1280, cw: 800, ch: 832 },
      { vw: 1280, vh: 720, cw: 1080, ch: 1248 },
    ];

    for (const { vw, vh, cw, ch } of testCases) {
      const crop = computeCropOffset(vw, vh, cw, ch);

      const topLeft = videoToCss(crop.cropX, crop.cropY, crop);
      expect(topLeft.x).toBeCloseTo(0, 4);
      expect(topLeft.y).toBeCloseTo(0, 4);

      const bottomRight = videoToCss(
        crop.cropX + crop.visibleWidth,
        crop.cropY + crop.visibleHeight,
        crop,
      );
      expect(bottomRight.x).toBeCloseTo(cw, 4);
      expect(bottomRight.y).toBeCloseTo(ch, 4);
    }
  });
});

describe('videoToCss', () => {
  it('maps center pixel correctly in portrait crop', () => {
    const crop = computeCropOffset(1280, 720, 360, 640);
    // Center of video: (640, 360)
    const css = videoToCss(640, 360, crop);

    // x = (640 - 437.5) * scale = 202.5 * (640/720) ≈ 180
    expect(css.x).toBeCloseTo(180, 0);
    // y = 360 * scale = 360 * (640/720) = 320
    expect(css.y).toBeCloseTo(320, 0);
  });

  it('maps top-left of visible area to (0, 0)', () => {
    const crop = computeCropOffset(1280, 720, 360, 640);
    // The visible area starts at (cropX, cropY)
    const css = videoToCss(crop.cropX, crop.cropY, crop);

    expect(css.x).toBeCloseTo(0, 1);
    expect(css.y).toBeCloseTo(0, 1);
  });
});
