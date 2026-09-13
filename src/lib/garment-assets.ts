import type { Garment, GarmentVariant } from '@/types/garment';

export interface ResolvedGarmentAssets {
  /** Clave de caché: sku, o `${sku}#${variantId}` si hay variante */
  key: string;
  overlayUrl: string;
  anchorsUrl: string;
  thumbnailUrl: string;
  variant: GarmentVariant | null;
}

export function resolveGarmentAssets(
  garment: Garment,
  variantId?: string | null,
): ResolvedGarmentAssets {
  if (!garment.variants || garment.variants.length === 0) {
    return {
      key: garment.sku,
      overlayUrl: garment.overlayUrl,
      anchorsUrl: garment.anchorsUrl,
      thumbnailUrl: garment.thumbnailUrl ?? garment.overlayUrl,
      variant: null,
    };
  }

  const fallback = garment.variants[0];
  if (!fallback) {
    return {
      key: garment.sku,
      overlayUrl: garment.overlayUrl,
      anchorsUrl: garment.anchorsUrl,
      thumbnailUrl: garment.thumbnailUrl ?? garment.overlayUrl,
      variant: null,
    };
  }

  const selectedVariant =
    (variantId ? garment.variants.find((v) => v.id === variantId) : null) ?? fallback;

  return {
    key: `${garment.sku}#${selectedVariant.id}`,
    overlayUrl: selectedVariant.overlayUrl,
    anchorsUrl: selectedVariant.anchorsUrl,
    thumbnailUrl: selectedVariant.thumbnailUrl ?? selectedVariant.overlayUrl,
    variant: selectedVariant,
  };
}
