// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateStylizedPhoto } from '../../src/lib/ai-stylize-client';

describe('generateStylizedPhoto', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return success on valid response', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/stylize')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'success',
            imageUrl: 'http://example.com/stylized.jpg',
            durationMs: 4000,
          }),
        });
      }
      return Promise.resolve({ ok: true });
    });

    const signal = new AbortController().signal;
    const result = await generateStylizedPhoto(
      'http://example.com/original.jpg',
      'anime-football',
      signal,
    );
    expect(result.status).toBe('success');
    expect(result.imageUrl).toBe('http://example.com/stylized.jpg');
  });

  it('should NOT retry on 429 (rate-limit)', async () => {
    let stylizeCalls = 0;
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/stylize')) {
        stylizeCalls++;
        return Promise.resolve({
          ok: false,
          status: 429,
        });
      }
      return Promise.resolve({ ok: true });
    });

    const signal = new AbortController().signal;
    const result = await generateStylizedPhoto(
      'http://example.com/original.jpg',
      'anime-football',
      signal,
    );
    expect(result.status).toBe('error');
    expect(result.error).toContain('Too many requests');
    expect(stylizeCalls).toBe(1);
    expect(result.attempts).toBe(1);
  });

  it('should NOT retry on timeout abort error', async () => {
    let stylizeCalls = 0;
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/stylize')) {
        stylizeCalls++;
        const err = new Error('AbortError');
        err.name = 'AbortError';
        return Promise.reject(err);
      }
      return Promise.resolve({ ok: true });
    });

    const signal = new AbortController().signal;
    const result = await generateStylizedPhoto(
      'http://example.com/original.jpg',
      'anime-football',
      signal,
    );
    expect(result.status).toBe('error');
    expect(result.error).toBe('Request timed out');
    expect(stylizeCalls).toBe(1);
    expect(result.attempts).toBe(1);
  });

  it('should NOT retry on manual abort', async () => {
    let stylizeCalls = 0;
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/stylize')) {
        stylizeCalls++;
        const err = new Error('AbortError');
        err.name = 'AbortError';
        return Promise.reject(err);
      }
      return Promise.resolve({ ok: true });
    });

    const controller = new AbortController();
    controller.abort(); // manual abort before start

    const result = await generateStylizedPhoto(
      'http://example.com/original.jpg',
      'anime-football',
      controller.signal,
    );
    expect(result.status).toBe('error');
    expect(result.error).toBe('Request aborted');
    expect(stylizeCalls).toBe(0);
    expect(result.attempts).toBe(0);
  });

  it('should abort in-flight request on manual abort', async () => {
    let stylizeCalls = 0;
    const controller = new AbortController();
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/stylize')) {
        stylizeCalls++;
        controller.abort(); // manual abort mid-flight
        const err = new Error('AbortError');
        err.name = 'AbortError';
        return Promise.reject(err);
      }
      return Promise.resolve({ ok: true });
    });

    const result = await generateStylizedPhoto(
      'http://example.com/original.jpg',
      'anime-football',
      controller.signal,
    );
    expect(result.status).toBe('error');
    expect(result.error).toBe('Request aborted');
    expect(stylizeCalls).toBe(1);
    expect(result.attempts).toBe(1);
  });

  it('should retry once on transient network error and succeed', async () => {
    let stylizeCalls = 0;
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/stylize')) {
        stylizeCalls++;
        if (stylizeCalls === 1) {
          return Promise.reject(new Error('Failed to fetch'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'success',
            imageUrl: 'http://example.com/stylized.jpg',
            durationMs: 5000,
          }),
        });
      }
      return Promise.resolve({ ok: true });
    });

    const signal = new AbortController().signal;
    const result = await generateStylizedPhoto(
      'http://example.com/original.jpg',
      'anime-football',
      signal,
    );
    expect(result.status).toBe('success');
    expect(result.imageUrl).toBe('http://example.com/stylized.jpg');
    expect(stylizeCalls).toBe(2);
    expect(result.attempts).toBe(2);
  });
});
