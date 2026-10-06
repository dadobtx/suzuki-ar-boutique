import type { Garment } from '@/types/garment';
import { resolveGarmentIllustration } from '@/lib/garment-illustration';

export type ShowcaseSlide =
  | {
      kind: 'garment';
      garment: Garment;
      illustrations: string[]; // 0, 1 o 2 URLs (2 cuando hay variantes con ilustración)
      photo: { thumb?: string; full?: string };
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
    // 1. Resolve illustrations
    const illustrations: string[] = [];
    if (garment.variants && garment.variants.length > 0) {
      for (const v of garment.variants) {
        const resolved = resolveGarmentIllustration(garment, v.id);
        if (resolved?.illustrationUrl) {
          const formatted = prefixBaseUrl(resolved.illustrationUrl);
          if (formatted && !illustrations.includes(formatted)) {
            illustrations.push(formatted);
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
    }

    // 2. Resolve photo
    const firstVariant = garment.variants?.[0];
    const rawThumb = firstVariant?.thumbnailUrl || garment.thumbnailUrl;
    const rawFull = firstVariant?.overlayUrl || garment.overlayUrl;

    const thumb = prefixBaseUrl(rawThumb);
    const full = prefixBaseUrl(rawFull);

    // Fallback: Skip if no illustration and no photo
    if (illustrations.length === 0 && !thumb && !full) {
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
      photo: {
        ...(thumb ? { thumb } : {}),
        ...(full ? { full } : {}),
      },
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
