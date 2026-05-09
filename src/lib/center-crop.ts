/**
 * Center-crop math for mapping a 16:9 landscape video feed
 * to a 9:16 portrait viewport using CSS object-fit: cover.
 *
 * The <video> element with object-fit:cover automatically crops
 * the feed to fill the viewport. This module computes the exact
 * crop offset so the canvas overlay can align landmarks/garments
 * to the visible portion of the feed.
 */

export interface CropResult {
  /** Horizontal pixels cropped from each side of the native video */
  cropX: number;
  /** Width of the visible portion in native video pixels */
  visibleWidth: number;
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
    return { cropX: 0, visibleWidth: videoWidth, scale: 1 };
  }

  const videoAspect = videoWidth / videoHeight;
  const containerAspect = containerWidth / containerHeight;

  // object-fit: cover scales the video so the SMALLER dimension fills
  // the container, then crops the overflow on the larger dimension.
  if (videoAspect > containerAspect) {
    // Video is wider than container → crop horizontally (landscape→portrait)
    // Scale is determined by matching heights
    const scale = containerHeight / videoHeight;
    const visibleWidth = videoHeight * containerAspect;
    const cropX = (videoWidth - visibleWidth) / 2;
    return { cropX, visibleWidth, scale };
  } else {
    // Video is taller than or matches container → crop vertically or no crop
    // For the portrait use case this branch means video is already narrow enough
    const scale = containerWidth / videoWidth;
    const visibleWidth = videoWidth;
    const cropX = 0;
    return { cropX, visibleWidth, scale };
  }
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
    y: videoY * crop.scale,
  };
}
