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
    // Timeout is non-retryable — should only make one /tryon call.
    expect(result.attempts).toBe(1);
  });

  it('should NOT retry on PoseError (non-retryable)', async () => {
    let tryonCalls = 0;
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/tryon')) {
        tryonCalls++;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'error',
            error: 'PoseError: Failed to detect body pose in model image.',
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
    expect(result.status).toBe('error');
    expect(result.error).toContain('PoseError');
    expect(tryonCalls).toBe(1);
    expect(result.attempts).toBe(1);
  });

  it('should retry once on transient network error and succeed', async () => {
    let tryonCalls = 0;
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/tryon')) {
        tryonCalls++;
        if (tryonCalls === 1) {
          // First call: simulate transient network failure
          return Promise.reject(new Error('Failed to fetch'));
        }
        // Second call: succeed
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'success',
            imageUrl: 'http://example.com/retry-success.jpg',
            durationMs: 12000,
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
    expect(result.imageUrl).toBe('http://example.com/retry-success.jpg');
    expect(tryonCalls).toBe(2);
    expect(result.attempts).toBe(2);
  });

  it('should give up after MAX_RETRIES on persistent retryable error', async () => {
    let tryonCalls = 0;
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/tryon')) {
        tryonCalls++;
        return Promise.reject(new Error('Failed to fetch'));
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
    // 1 original attempt + 1 retry = 2 total
    expect(tryonCalls).toBe(2);
    expect(result.attempts).toBe(2);
  });
});
