// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { composePhoto } from '@/lib/photo-composer';
import type { Garment } from '@/types/garment';

describe('Photo Composer', () => {
  it('generates two photos: composed and clean', async () => {
    const videoEl = document.createElement('video');
    const overlayCanvas = document.createElement('canvas');
    const garment: Garment = {
      id: 'g1',
      sku: 'TEST-SKU-01',
      category: 'T-Shirts',
      line: 'GSX-R',
      name: 'Test Garment',
      description: 'Test',
      price: 10,
      sizes: ['M'],
      colors: ['Red'],
      badges: [],
      assetUrl: '/test.svg',
      overlayUrl: '/test.svg',
      anchorsUrl: '/test.json',
    };

    // Mock canvas methods to avoid JSDOM errors
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () =>
        ({
          drawImage: vi.fn(),
          strokeRect: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          stroke: vi.fn(),
          fillText: vi.fn(),
          measureText: vi.fn(() => ({ width: 0 })),
        }) as unknown as CanvasRenderingContext2D,
    );

    HTMLCanvasElement.prototype.toDataURL = vi
      .fn()
      .mockReturnValue('data:image/jpeg;base64,mockData');

    const result = await composePhoto({
      videoEl,
      overlayCanvas,
      garment,
      wishlistCode: 'ABC123',
    });

    expect(result.photoComposed).toBe('data:image/jpeg;base64,mockData');
    expect(result.photoClean).toBe('data:image/jpeg;base64,mockData');

    // JSDOM has mocked our methods, but we verified the flow executes
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledTimes(2);
  });
});
