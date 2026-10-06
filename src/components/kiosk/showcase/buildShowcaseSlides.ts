import type { Garment } from '@/types/garment';
import { resolveGarmentIllustration } from '@/lib/garment-illustration';

export type ShowcaseSlide =
  | {
      kind: 'garment';
      garment: Garment;
      illustrations: string[]; // 0, 1 o 2 URLs (2 cuando hay variantes con ilustración)
      photos: { thumb?: string; full?: string }[]; // en paralelo a illustrations (mismo índice = misma variante)
      colorCount: number; // variants.length si >1, si no colors.length
    }
  | {
      kind: 'summary';
      count: number;
      minPriceCents: number;
      illustrations: string[];
    };

export function prefixBaseUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const baseUrl = import.meta.env.BASE_URL ?? '/';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const cleanPath = url.replace(/^\//, '');
  return `${cleanBase}${cleanPath}`;
}

export function buildShowcaseSlides(catalog: Garment[]): ShowcaseSlide[] {
  const slides: ShowcaseSlide[] = [];
  const maxGarments = catalog.slice(0, 10);
  const summaryIllustrations: string[] = [];

  for (const garment of maxGarments) {
    // 1. Resolve illustrations and photos in parallel
    const illustrations: string[] = [];
    const photos: { thumb?: string; full?: string }[] = [];

    if (garment.variants && garment.variants.length > 0) {
      for (const v of garment.variants) {
        const resolved = resolveGarmentIllustration(garment, v.id);
        if (resolved?.illustrationUrl) {
          const formatted = prefixBaseUrl(resolved.illustrationUrl);
          if (formatted && !illustrations.includes(formatted)) {
            illustrations.push(formatted);
            const thumb = prefixBaseUrl(v.thumbnailUrl || garment.thumbnailUrl);
            const full = prefixBaseUrl(v.overlayUrl || garment.overlayUrl);
            photos.push({
              ...(thumb ? { thumb } : {}),
              ...(full ? { full } : {}),
            });
          }
        }
      }
      // If no variants had illustrations, fallback to variant photos
      if (photos.length === 0) {
        for (const v of garment.variants) {
          const thumb = prefixBaseUrl(v.thumbnailUrl || garment.thumbnailUrl);
          const full = prefixBaseUrl(v.overlayUrl || garment.overlayUrl);
          if (thumb || full) {
            photos.push({
              ...(thumb ? { thumb } : {}),
              ...(full ? { full } : {}),
            });
          }
        }
      }
    } else {
      const resolved = resolveGarmentIllustration(garment);
      if (resolved?.illustrationUrl) {
        const formatted = prefixBaseUrl(resolved.illustrationUrl);
        if (formatted) {
          illustrations.push(formatted);
        }
      }
      const thumb = prefixBaseUrl(garment.thumbnailUrl);
      const full = prefixBaseUrl(garment.overlayUrl);
      if (thumb || full) {
        photos.push({
          ...(thumb ? { thumb } : {}),
          ...(full ? { full } : {}),
        });
      }
    }

    // Fallback: Skip if no illustration and no photo
    if (illustrations.length === 0 && photos.length === 0) {
      continue;
    }

    // 3. Color count
    const colorCount =
      garment.variants && garment.variants.length > 1
        ? garment.variants.length
        : (garment.colors?.length ?? 1);

    slides.push({
      kind: 'garment',
      garment,
      illustrations,
      photos,
      colorCount,
    });

    const firstIllust = illustrations[0];
    if (firstIllust && summaryIllustrations.length < 6) {
      summaryIllustrations.push(firstIllust);
    }
  }

  // Summary slide
  if (slides.length > 0) {
    const validPrices = slides
      .filter((s): s is ShowcaseSlide & { kind: 'garment' } => s.kind === 'garment')
      .map((s) => s.garment.priceCents)
      .filter((p): p is number => typeof p === 'number' && !isNaN(p));

    const minPriceCents = validPrices.length > 0 ? Math.min(...validPrices) : 0;

    slides.push({
      kind: 'summary',
      count: slides.length,
      minPriceCents,
      illustrations: summaryIllustrations,
    });
  }

  return slides;
}
