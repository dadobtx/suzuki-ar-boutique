import type { Garment } from '@/types/garment';

export type BackViewMode = 'flip' | 'fade';

export interface ResolvedBackView {
  imageUrl: string;
  thumbnailUrl: string;
  mode: BackViewMode;
}

/**
 * Resuelve los assets y el modo de animación de la vista posterior de una prenda.
 *
 * Reglas:
 * 1. Si la prenda tiene variants y la variante activa trae backImageUrl,
 *    mandan los campos de la variante.
 * 2. Si no, se usan los campos de la prenda.
 * 3. Sin backImageUrl -> null (prendas sin vista trasera).
 * 4. thumbnailUrl cae a imageUrl si no está presente.
 * 5. mode: 'flip' solo si flip === true; con false o undefined cae a 'fade'.
 */
export function resolveBackView(
  garment: Garment,
  variantId?: string | null,
): ResolvedBackView | null {
  if (garment.variants && garment.variants.length > 0) {
    const activeVariant =
      (variantId ? garment.variants.find((v) => v.id === variantId) : null) ??
      garment.variants[0];

    if (activeVariant?.backImageUrl) {
      return {
        imageUrl: activeVariant.backImageUrl,
        thumbnailUrl: activeVariant.backThumbnailUrl || activeVariant.backImageUrl,
        mode: activeVariant.flip === true ? 'flip' : 'fade',
      };
    }
  }

  if (garment.backImageUrl) {
    return {
      imageUrl: garment.backImageUrl,
      thumbnailUrl: garment.backThumbnailUrl || garment.backImageUrl,
      mode: garment.flip === true ? 'flip' : 'fade',
    };
  }

  return null;
}
