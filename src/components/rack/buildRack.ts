import type { Garment } from '@/types/garment';
import { resolveGarmentIllustration } from '@/lib/garment-illustration';
import { resolveBackView } from '@/lib/back-view';

export interface RackVariant {
  id: string;
  label?: string;
  color?: string;
  illustrationUrl: string | null;
  photoThumbUrl?: string;
  photoFullUrl?: string;
}

export interface RackItem {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  sizes: string[];
  colors: string[];
  illustrationUrl: string | null;
  fallbackPhotoUrl: string | null;
  hasIllustration: boolean;
  illustrations: string[]; // todas las ilustraciones resueltas de la prenda / variantes
  photoThumbUrl?: string;
  backThumbnailUrl?: string;
  variants: RackVariant[];
  garment: Garment;
}

let hasWarnedMaxGarments = false;

export function prefixBaseUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const baseUrl = import.meta.env?.BASE_URL ?? '/';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const cleanPath = url.replace(/^\//, '');
  return `${cleanBase}${cleanPath}`;
}

export function buildRack(
  catalog: Garment[],
  activeGarmentId?: string | null,
  activeVariantId?: string | null,
): RackItem[] {
  let list = catalog;
  if (catalog.length > 12) {
    if (!hasWarnedMaxGarments) {
      console.warn(
        `[buildRack] Catalog has ${catalog.length} items; capping at 12 for rack.`,
      );
      hasWarnedMaxGarments = true;
    }
    list = catalog.slice(0, 12);
  }

  return list.map((garment) => {
    const isActive = activeGarmentId === garment.id;
    const variants: RackVariant[] = [];
    const illustrations: string[] = [];

    if (garment.variants && garment.variants.length > 0) {
      for (const v of garment.variants) {
        const resolved = resolveGarmentIllustration(garment, v.id);
        const illustUrl = resolved?.illustrationUrl
          ? (prefixBaseUrl(resolved.illustrationUrl) ?? null)
          : null;

        if (illustUrl && !illustrations.includes(illustUrl)) {
          illustrations.push(illustUrl);
        }

        variants.push({
          id: v.id,
          label: v.label,
          color: v.color,
          illustrationUrl: illustUrl,
          photoThumbUrl: prefixBaseUrl(v.thumbnailUrl || garment.thumbnailUrl),
          photoFullUrl: prefixBaseUrl(v.overlayUrl || garment.overlayUrl),
        });
      }
    } else {
      const resolved = resolveGarmentIllustration(garment);
      const illustUrl = resolved?.illustrationUrl
        ? (prefixBaseUrl(resolved.illustrationUrl) ?? null)
        : null;
      if (illustUrl) {
        illustrations.push(illustUrl);
      }
    }

    // Determine current active variant or fallback to first
    let currentVariant: RackVariant | undefined;
    if (variants.length > 0) {
      currentVariant =
        (isActive && activeVariantId
          ? variants.find((v) => v.id === activeVariantId)
          : null) ?? variants[0];
    }

    const currentIllustUrl = currentVariant
      ? currentVariant.illustrationUrl
      : (illustrations[0] ?? null);

    const hasIllustration = Boolean(currentIllustUrl);
    const fallbackPhotoUrl = hasIllustration
      ? null
      : (prefixBaseUrl(garment.thumbnailUrl ?? garment.overlayUrl) ?? null);

    const photoThumbUrl =
      currentVariant?.photoThumbUrl ??
      prefixBaseUrl(garment.thumbnailUrl ?? garment.overlayUrl);

    // Back view resolution
    const backView = resolveBackView(
      garment,
      isActive && activeVariantId ? activeVariantId : (variants[0]?.id ?? null),
    );
    const backThumbnailUrl = backView?.thumbnailUrl
      ? prefixBaseUrl(backView.thumbnailUrl)
      : undefined;

    return {
      id: garment.id,
      sku: garment.sku,
      name: garment.name,
      priceCents: garment.priceCents ?? 0,
      sizes: garment.sizes ?? [],
      colors: garment.colors ?? [],
      illustrationUrl: currentIllustUrl,
      fallbackPhotoUrl,
      hasIllustration,
      illustrations,
      photoThumbUrl,
      backThumbnailUrl,
      variants,
      garment,
    };
  });
}
