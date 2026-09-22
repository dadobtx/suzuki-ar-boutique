/**
 * Center-crop math for mapping a video feed to a viewport
 * using CSS object-fit: cover across both axes.
 *
 * The <video> element with object-fit: cover automatically scales
 * the feed to fill the viewport and crops any overflow.
 * This module computes the exact crop offsets (horizontal and vertical)
 * so the canvas overlay can align landmarks, masks, and garments
 * to the visible portion of the feed.
 */

export interface CropResult {
  /** Horizontal pixels cropped from each side of the native video */
  cropX: number;
  /** Vertical pixels cropped from top and bottom of the native video */
  cropY: number;
  /** Width of the visible portion in native video pixels */
  visibleWidth: number;
  /** Height of the visible portion in native video pixels */
  visibleHeight: number;
  /** Scale factor: CSS pixels per native video pixel */
  scale: number;
}

/**
 * Compute the center-crop offset for a video feed displayed with
 * object-fit: cover in a container of a given aspect ratio.
 *
 * @param videoWidth  Native width of the video feed (e.g. 1280)
 * @param videoHeight Native height of the video feed (e.g. 720)
 * @param containerWidth  CSS width of the display container
 * @param containerHeight CSS height of the display container
 */
export function computeCropOffset(
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
): CropResult {
  if (
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    containerWidth <= 0 ||
    containerHeight <= 0
  ) {
    return {
      cropX: 0,
      cropY: 0,
      visibleWidth: videoWidth,
      visibleHeight: videoHeight,
      scale: 1,
    };
  }

  // object-fit: cover scales the video so the larger dimension ratio fills
  // the container, then crops the overflow on the other dimension.
  const scale = Math.max(containerWidth / videoWidth, containerHeight / videoHeight);
  const visibleWidth = containerWidth / scale;
  const visibleHeight = containerHeight / scale;
  const cropX = (videoWidth - visibleWidth) / 2;
  const cropY = (videoHeight - visibleHeight) / 2;

  return { cropX, cropY, visibleWidth, visibleHeight, scale };
}

/**
 * Convert a coordinate from native video space to CSS canvas space,
 * accounting for center-crop offset and scale.
 *
 * @param videoX X position in native video pixels
 * @param videoY Y position in native video pixels
 * @param crop  Result from computeCropOffset
 * @returns {x, y} in CSS coordinates for the canvas
 */
export function videoToCss(
  videoX: number,
  videoY: number,
  crop: CropResult,
): { x: number; y: number } {
  return {
    x: (videoX - crop.cropX) * crop.scale,
    y: (videoY - crop.cropY) * crop.scale,
  };
}

// ── Contain-fit helpers (for landscape mode with object-fit: contain) ──

export interface ContainResult {
  /** CSS-px per native video pixel */
  scale: number;
  /** Horizontal offset to center the video (letterbox padding) */
  drawX: number;
  /** Vertical offset to center the video (letterbox padding) */
  drawY: number;
  /** Rendered width in CSS pixels */
  drawW: number;
  /** Rendered height in CSS pixels */
  drawH: number;
}

/**
 * Compute "contain" fit metrics for landscape mode.
 * The video preserves aspect, fits inside container with letterboxing.
 */
export function computeContainOffset(
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
): ContainResult {
  if (
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    containerWidth <= 0 ||
    containerHeight <= 0
  ) {
    return { scale: 1, drawX: 0, drawY: 0, drawW: videoWidth, drawH: videoHeight };
  }
  const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight);
  const drawW = videoWidth * scale;
  const drawH = videoHeight * scale;
  const drawX = (containerWidth - drawW) / 2;
  const drawY = (containerHeight - drawH) / 2;
  return { scale, drawX, drawY, drawW, drawH };
}

/**
 * Convert video coords to CSS canvas coords for contain layout.
 */
export function videoToCssContain(
  videoX: number,
  videoY: number,
  fit: ContainResult,
): { x: number; y: number } {
  return {
    x: fit.drawX + videoX * fit.scale,
    y: fit.drawY + videoY * fit.scale,
  };
}
