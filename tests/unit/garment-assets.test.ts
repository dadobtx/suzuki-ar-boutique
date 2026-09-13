import { describe, it, expect } from 'vitest';
import { resolveGarmentAssets } from '@/lib/garment-assets';
import type { Garment } from '@/types/garment';

describe('resolveGarmentAssets', () => {
  const baseGarmentWithoutVariants: Garment = {
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
  };

  const reversibleGarment: Garment = {
    id: '990F0-BKQJ5',
    line: 'Team Black',
    name: 'Team Black Reversible Jacket',
    category: 'top',
    sku: '990F0-BKQJ5',
    sizes: ['L'],
    colors: ['#CB1C2A', '#14161B'],
    priceCents: 25671,
    overlayUrl: '/garments/990F0-BKQJ5.png',
    anchorsUrl: '/garments/990F0-BKQJ5.anchors.json',
    thumbnailUrl: '/garments/990F0-BKQJ5.thumb.png',
    variants: [
      {
        id: 'roja',
        label: 'Roja',
        color: '#CB1C2A',
        overlayUrl: '/garments/990F0-BKQJ5.png',
        anchorsUrl: '/garments/990F0-BKQJ5.anchors.json',
        thumbnailUrl: '/garments/990F0-BKQJ5.thumb.png',
      },
      {
        id: 'negra',
        label: 'Negra',
        color: '#14161B',
        overlayUrl: '/garments/990F0-BKQJ5_2.png',
        anchorsUrl: '/garments/990F0-BKQJ5_2.anchors.json',
        thumbnailUrl: '/garments/990F0-BKQJ5_2.thumb.png',
      },
    ],
  };

  it('prenda sin variants -> devuelve los campos de la prenda, key = sku, variant = null', () => {
    const assets = resolveGarmentAssets(baseGarmentWithoutVariants);
    expect(assets.key).toBe(baseGarmentWithoutVariants.sku);
    expect(assets.overlayUrl).toBe(baseGarmentWithoutVariants.overlayUrl);
    expect(assets.anchorsUrl).toBe(baseGarmentWithoutVariants.anchorsUrl);
    expect(assets.thumbnailUrl).toBe(baseGarmentWithoutVariants.thumbnailUrl);
    expect(assets.variant).toBeNull();
  });

  it('prenda sin variants y sin thumbnailUrl -> thumbnailUrl cae a overlayUrl', () => {
    const garmentWithoutThumb: Garment = {
      ...baseGarmentWithoutVariants,
      thumbnailUrl: undefined,
    };
    const assets = resolveGarmentAssets(garmentWithoutThumb);
    expect(assets.thumbnailUrl).toBe(garmentWithoutThumb.overlayUrl);
  });

  it('prenda con variants y variantId null -> devuelve variants[0]', () => {
    const assets = resolveGarmentAssets(reversibleGarment, null);
    expect(assets.variant).toEqual(reversibleGarment.variants![0]);
    expect(assets.key).toBe('990F0-BKQJ5#roja');
    expect(assets.overlayUrl).toBe('/garments/990F0-BKQJ5.png');
    expect(assets.anchorsUrl).toBe('/garments/990F0-BKQJ5.anchors.json');
    expect(assets.thumbnailUrl).toBe('/garments/990F0-BKQJ5.thumb.png');
  });

  it('prenda con variants y variantId inexistente -> devuelve variants[0] (no lanza)', () => {
    expect(() => {
      const assets = resolveGarmentAssets(reversibleGarment, 'amarilla_inexistente');
      expect(assets.variant).toEqual(reversibleGarment.variants![0]);
      expect(assets.key).toBe('990F0-BKQJ5#roja');
    }).not.toThrow();
  });

  it('prenda con variants y variantId válido -> devuelve esa variante y key === `${sku}#${variantId}`', () => {
    const assets = resolveGarmentAssets(reversibleGarment, 'negra');
    expect(assets.variant).toEqual(reversibleGarment.variants![1]);
    expect(assets.key).toBe('990F0-BKQJ5#negra');
    expect(assets.overlayUrl).toBe('/garments/990F0-BKQJ5_2.png');
    expect(assets.anchorsUrl).toBe('/garments/990F0-BKQJ5_2.anchors.json');
    expect(assets.thumbnailUrl).toBe('/garments/990F0-BKQJ5_2.thumb.png');
  });

  it('las dos caras de 990F0-BKQJ5 dan keys DISTINTAS', () => {
    const assetsRoja = resolveGarmentAssets(reversibleGarment, 'roja');
    const assetsNegra = resolveGarmentAssets(reversibleGarment, 'negra');

    expect(assetsRoja.key).not.toBe(assetsNegra.key);
    expect(assetsRoja.key).toBe('990F0-BKQJ5#roja');
    expect(assetsNegra.key).toBe('990F0-BKQJ5#negra');
    expect(assetsRoja.overlayUrl).not.toBe(assetsNegra.overlayUrl);
    expect(assetsRoja.anchorsUrl).not.toBe(assetsNegra.anchorsUrl);
  });
});
