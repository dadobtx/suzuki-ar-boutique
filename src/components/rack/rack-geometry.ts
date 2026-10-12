export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Calculates the destination rectangle for a garment flying to or from the mirror cell.
 *
 * Requirements (Tablet Polish):
 * - Contained inside a bounding box of at most 34% width and 42% height of the mirror cell.
 * - Aspect ratio preserved from source: scale = min(maxW / from.width, maxH / from.height).
 * - Horizontally centered (50% of mirror width).
 * - Vertical center placed at ~45% from the top of the mirror (torso level).
 */
export function computeMirrorTargetRect(mirrorRect: Rect, sourceRect: Rect): Rect {
  const maxW = mirrorRect.width * 0.34;
  const maxH = mirrorRect.height * 0.42;

  const fromW = sourceRect.width > 0 ? sourceRect.width : 1;
  const fromH = sourceRect.height > 0 ? sourceRect.height : 1;

  const scale = Math.min(maxW / fromW, maxH / fromH);
  const targetW = fromW * scale;
  const targetH = fromH * scale;

  const targetCenterX = mirrorRect.left + mirrorRect.width * 0.5;
  const targetCenterY = mirrorRect.top + mirrorRect.height * 0.45;

  return {
    left: targetCenterX - targetW * 0.5,
    top: targetCenterY - targetH * 0.5,
    width: targetW,
    height: targetH,
  };
}

/**
 * Sanitizes a slot rect measured from the DOM to ensure non-collapsed dimensions.
 */
export function sanitizeSlotRect(slotRect: Rect): Rect {
  if (slotRect.width <= 0 || slotRect.height <= 0) {
    return {
      left: slotRect.left || 0,
      top: slotRect.top || 0,
      width: 120,
      height: 120,
    };
  }
  return slotRect;
}
