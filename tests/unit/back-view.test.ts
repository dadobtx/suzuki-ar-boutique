import { describe, it, expect } from 'vitest';
import { resolveBackView } from '@/lib/back-view';
import type { Garment } from '@/types/garment';

describe('resolveBackView', () => {
  const baseGarmentWithoutBack: Garment = {
    id: '990F0-BKBW5',
    line: 'Team Black',
    name: 'Team Black Vest',
    category: 'top',
    sku: '990F0-BKBW5',
    sizes: ['S', 'M', 'L'],
    colors: ['#191C20'],
    priceCents: 8648,
    overlayUrl: '/garments/990F0-BKBW5.png',
    anchorsUrl: '/garments/990F0-BKBW5.anchors.json',
    thumbnailUrl: '/garments/990F0-BKBW5.thumb.png',
  };

  const garmentWithFlipTrue: Garment = {
    id: '990F0-BKTM1',
    line: 'Team Black',
    name: 'Team Black T-Shirt',
    category: 'top',
    sku: '990F0-BKTM1',
    sizes: ['S', 'M', 'L'],
    colors: ['#0A0E12'],
    priceCents: 3529,
    overlayUrl: '/garments/990F0-BKTM1.png',
    anchorsUrl: '/garments/990F0-BKTM1.anchors.json',
    thumbnailUrl: '/garments/990F0-BKTM1.thumb.png',
    backImageUrl: '/garments/990F0-BKTM1.back.png',
    backThumbnailUrl: '/garments/990F0-BKTM1.back.thumb.png',
    flip: true,
  };

  it('prenda sin backImageUrl -> null', () => {
    const result = resolveBackView(baseGarmentWithoutBack);
    expect(result).toBeNull();
  });

  it('prenda con backImageUrl y flip:true -> mode "flip"', () => {
    const result = resolveBackView(garmentWithFlipTrue);
    expect(result).not.toBeNull();
    expect(result?.imageUrl).toBe('/garments/990F0-BKTM1.back.png');
    expect(result?.thumbnailUrl).toBe('/garments/990F0-BKTM1.back.thumb.png');
    expect(result?.mode).toBe('flip');
  });

  it('prenda con backImageUrl y flip:false -> mode "fade"', () => {
    const garmentWithFlipFalse: Garment = {
      ...garmentWithFlipTrue,
      flip: false,
    };
    const result = resolveBackView(garmentWithFlipFalse);
    expect(result).not.toBeNull();
    expect(result?.mode).toBe('fade');
  });

  it('prenda con backImageUrl y flip ausente -> mode "fade"', () => {
    const garmentWithoutFlip: Garment = {
      ...garmentWithFlipTrue,
      flip: undefined,
    };
    const result = resolveBackView(garmentWithoutFlip);
    expect(result).not.toBeNull();
    expect(result?.mode).toBe('fade');
  });

  it('sin backThumbnailUrl -> thumbnailUrl cae a imageUrl', () => {
    const garmentWithoutThumb: Garment = {
      ...garmentWithFlipTrue,
      backThumbnailUrl: undefined,
    };
    const result = resolveBackView(garmentWithoutThumb);
    expect(result).not.toBeNull();
    expect(result?.thumbnailUrl).toBe(garmentWithoutThumb.backImageUrl);
  });

  it('prenda con variants: si la variante activa trae backImageUrl, mandan los campos de la variante y no los de la prenda', () => {
    const garmentWithVariants: Garment = {
      ...garmentWithFlipTrue,
      backImageUrl: '/garments/garment-back.png',
      backThumbnailUrl: '/garments/garment-back.thumb.png',
      flip: true,
      variants: [
        {
          id: 'roja',
          label: 'Roja',
          color: '#CB1C2A',
          overlayUrl: '/garments/roja.png',
          anchorsUrl: '/garments/roja.anchors.json',
          thumbnailUrl: '/garments/roja.thumb.png',
          backImageUrl: '/garments/roja.back.png',
          backThumbnailUrl: '/garments/roja.back.thumb.png',
          flip: false,
        },
        {
          id: 'negra',
          label: 'Negra',
          color: '#14161B',
          overlayUrl: '/garments/negra.png',
          anchorsUrl: '/garments/negra.anchors.json',
          thumbnailUrl: '/garments/negra.thumb.png',
          backImageUrl: '/garments/negra.back.png',
          backThumbnailUrl: '/garments/negra.back.thumb.png',
          flip: true,
        },
      ],
    };

    const resultRoja = resolveBackView(garmentWithVariants, 'roja');
    expect(resultRoja).toEqual({
      imageUrl: '/garments/roja.back.png',
      thumbnailUrl: '/garments/roja.back.thumb.png',
      mode: 'fade',
    });

    const resultNegra = resolveBackView(garmentWithVariants, 'negra');
    expect(resultNegra).toEqual({
      imageUrl: '/garments/negra.back.png',
      thumbnailUrl: '/garments/negra.back.thumb.png',
      mode: 'flip',
    });
  });

  it('variantId inexistente -> cae a variants[0], no lanza', () => {
    const garmentWithVariants: Garment = {
      ...garmentWithFlipTrue,
      variants: [
        {
          id: 'roja',
          label: 'Roja',
          color: '#CB1C2A',
          overlayUrl: '/garments/roja.png',
          anchorsUrl: '/garments/roja.anchors.json',
          thumbnailUrl: '/garments/roja.thumb.png',
          backImageUrl: '/garments/roja.back.png',
          backThumbnailUrl: '/garments/roja.back.thumb.png',
          flip: true,
        },
      ],
    };

    expect(() => {
      const result = resolveBackView(garmentWithVariants, 'inexistente');
      expect(result).toEqual({
        imageUrl: '/garments/roja.back.png',
        thumbnailUrl: '/garments/roja.back.thumb.png',
        mode: 'flip',
      });
    }).not.toThrow();
  });
});
