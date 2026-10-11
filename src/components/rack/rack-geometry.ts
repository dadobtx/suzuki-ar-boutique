export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Calculates the destination rectangle for a garment flying to or from the mirror cell.
 *
 * Requirements:
 * - Centered at chest level: horizontally centered (50%) and 38% from the top of the mirror.
 * - Standard width is 45% of the mirror width.
 * - Protects against huge destination sizes by clamping width to at most 70% and height to at most 60%
 *   of the mirror cell, centered on the target point.
 * - Normalizes aspect ratio if source is distorted by 3D rack perspective (rotateY 76deg) or closed slots.
 */
export function computeMirrorTargetRect(mirrorRect: Rect, sourceRect: Rect): Rect {
  let targetW = mirrorRect.width * 0.45;

  let aspect =
    sourceRect.width > 0 && sourceRect.height > 0
      ? sourceRect.width / sourceRect.height
      : 1;

  // Suzuki cutout illustrations are square 1:1. If 3D rotation foreshortened the width, reset to 1.
  if (aspect < 0.6 || aspect > 1.8) {
    aspect = 1.0;
  }

  let targetH = targetW / aspect;

  const targetCenterX = mirrorRect.left + mirrorRect.width * 0.5;
  const targetCenterY = mirrorRect.top + mirrorRect.height * 0.38;

  // Protection: clamp to at most 70% width and 60% height of the mirror cell
  const maxW = mirrorRect.width * 0.7;
  const maxH = mirrorRect.height * 0.6;

  if (targetW > maxW || targetH > maxH) {
    const scale = Math.min(maxW / targetW, maxH / targetH);
    targetW = targetW * scale;
    targetH = targetH * scale;
  }

  return {
    left: targetCenterX - targetW * 0.5,
    top: targetCenterY - targetH * 0.5,
    width: targetW,
    height: targetH,
  };
}

/**
 * Sanitizes a slot rect measured from the DOM to ensure unrotated square proportions
 * if the slot element was measured during a 3D rotation (rotateY 76deg) or in closed state.
 */
export function sanitizeSlotRect(slotRect: Rect): Rect {
  if (slotRect.height > 0 && slotRect.width < slotRect.height * 0.6) {
    const centerX = slotRect.left + slotRect.width * 0.5;
    return {
      left: centerX - slotRect.height * 0.5,
      top: slotRect.top,
      width: slotRect.height,
      height: slotRect.height,
    };
  }
  return slotRect;
}
