// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateTryOnPhoto } from '../../src/lib/ai-tryon-client';

describe('generateTryOnPhoto', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return success on valid response', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/tryon')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'success',
            imageUrl: 'http://example.com/img.jpg',
            durationMs: 5000,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        blob: async () => new Blob(['test']),
      });
    });

    const result = await generateTryOnPhoto(
      'base64data',
      'http://localhost/garment.jpg',
      'jacket',
    );
    expect(result.status).toBe('success');
    expect(result.imageUrl).toBe('http://example.com/img.jpg');
  });

  it('should return error on 429', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/tryon')) {
        return Promise.resolve({
          ok: false,
          status: 429,
        });
      }
      return Promise.resolve({
        ok: true,
        blob: async () => new Blob(['test']),
      });
    });

    const result = await generateTryOnPhoto(
      'base64data',
      'http://localhost/garment.jpg',
      'jacket',
    );
    expect(result.status).toBe('error');
    expect(result.error).toContain('Too many requests');
  });

  it('should handle timeout abort error', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/tryon')) {
        const err = new Error('AbortError');
        err.name = 'AbortError';
        return Promise.reject(err);
      }
      return Promise.resolve({
        ok: true,
        blob: async () => new Blob(['test']),
      });
    });

    const result = await generateTryOnPhoto(
      'base64data',
      'http://localhost/garment.jpg',
      'jacket',
    );
    expect(result.status).toBe('error');
    expect(result.error).toBe('Request timed out');
  });
});
