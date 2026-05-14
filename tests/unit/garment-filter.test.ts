import { describe, it, expect } from 'vitest';
import { filterGarments } from '../../src/lib/garment-filter';
import type { Garment } from '../../src/types/garment';

const mockCatalog: Garment[] = [
  {
    id: '1',
    line: 'GSX-R',
    category: 'top',
    sizes: ['S', 'M'],
    colors: ['#000', '#FFF'],
    sku: '1',
    name: 'Jacket',
    priceCents: 100,
    overlayUrl: '',
    anchorsUrl: '',
    thumbnailUrl: '',
  },
  {
    id: '2',
    line: 'Ecstar',
    category: 'top',
    sizes: ['L', 'XL'],
    colors: ['#000'],
    sku: '2',
    name: 'Polo',
    priceCents: 100,
    overlayUrl: '',
    anchorsUrl: '',
    thumbnailUrl: '',
  },
  {
    id: '3',
    line: 'GSX-R',
    category: 'bottom',
    sizes: ['M', 'L'],
    colors: ['#FFF'],
    sku: '3',
    name: 'Pants',
    priceCents: 100,
    overlayUrl: '',
    anchorsUrl: '',
    thumbnailUrl: '',
  },
  {
    id: '4',
    line: 'Lifestyle',
    category: 'accessory',
    sizes: [],
    colors: ['#F00'],
    sku: '4',
    name: 'Cap',
    priceCents: 100,
    overlayUrl: '',
    anchorsUrl: '',
    thumbnailUrl: '',
  },
];

describe('garment-filter', () => {
  it('returns all garments when no filters are active', () => {
    const result = filterGarments(mockCatalog, {
      line: 'Todas',
      category: null,
      sizes: [],
      colors: [],
    });
    expect(result.length).toBe(4);
  });

  it('filters by line', () => {
    const result = filterGarments(mockCatalog, {
      line: 'GSX-R',
      category: null,
      sizes: [],
      colors: [],
    });
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('1');
    expect(result[1].id).toBe('3');
  });

  it('filters by line and category', () => {
    const result = filterGarments(mockCatalog, {
      line: 'GSX-R',
      category: 'top',
      sizes: [],
      colors: [],
    });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by multiple sizes', () => {
    const result = filterGarments(mockCatalog, {
      line: 'Todas',
      category: null,
      sizes: ['L'],
      colors: [],
    });
    expect(result.length).toBe(2); // Ecstar Polo and GSX-R Pants
  });

  it('filters by multiple colors', () => {
    const result = filterGarments(mockCatalog, {
      line: 'Todas',
      category: null,
      sizes: [],
      colors: ['#F00'],
    });
    expect(result.length).toBe(1); // Lifestyle Cap
  });

  it('combines all filters', () => {
    const result = filterGarments(mockCatalog, {
      line: 'GSX-R',
      category: 'top',
      sizes: ['S'],
      colors: ['#FFF'],
    });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1');
  });
});
