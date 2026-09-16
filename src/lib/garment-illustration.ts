import type { Garment, GarmentVariant } from '@/types/garment';

export interface ResolvedGarmentIllustration {
  /** Clave de caché con prefijo namespaced: `illust:${sku}` o `illust:${sku}#${variantId}` */
  key: string;
  illustrationUrl: string;
  illustrationAnchorsUrl: string;
}

/**
 * Resuelve la ilustración tipo recortable para el adelanto AR local.
 * Si la prenda (o su variante resuelta) no tiene ilustración calibrada,
 * devuelve null para que el renderizador recurra al overlay fotográfico real.
 *
 * Nunca es consumido por motores de IA (FASHN / Lucy 2) ni por el catálogo.
 */
export function resolveGarmentIllustration(
  garment: Garment,
  variantId?: string | null,
): ResolvedGarmentIllustration | null {
  if (!garment.variants || garment.variants.length === 0) {
    if (!garment.illustrationUrl || !garment.illustrationAnchorsUrl) {
      return null;
    }
    return {
      key: `illust:${garment.sku}`,
      illustrationUrl: garment.illustrationUrl,
      illustrationAnchorsUrl: garment.illustrationAnchorsUrl,
    };
  }

  const fallback: GarmentVariant | undefined = garment.variants[0];
  if (!fallback) {
    if (!garment.illustrationUrl || !garment.illustrationAnchorsUrl) {
      return null;
    }
    return {
      key: `illust:${garment.sku}`,
      illustrationUrl: garment.illustrationUrl,
      illustrationAnchorsUrl: garment.illustrationAnchorsUrl,
    };
  }

  const selectedVariant =
    (variantId ? garment.variants.find((v) => v.id === variantId) : null) ?? fallback;

  const illustUrl = selectedVariant.illustrationUrl ?? garment.illustrationUrl;
  const illustAnchorsUrl =
    selectedVariant.illustrationAnchorsUrl ?? garment.illustrationAnchorsUrl;

  if (!illustUrl || !illustAnchorsUrl) {
    return null;
  }

  return {
    key: `illust:${garment.sku}#${selectedVariant.id}`,
    illustrationUrl: illustUrl,
    illustrationAnchorsUrl: illustAnchorsUrl,
  };
}
