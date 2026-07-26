import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index';

const MOCK_ENV = {
  ALLOWED_ORIGIN: 'https://dadobtx.github.io',
  FASHN_API_KEY: 'test_token',
  REPLICATE_API_TOKEN: 'replicate_token',
  RATE_LIMITER: {
    get: vi.fn(),
    put: vi.fn(),
  } as unknown as KVNamespace,
};

describe('POST /stylize', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid styleId with 400', async () => {
    const req = new Request('http://localhost/stylize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: 'https://cdn.fashn.ai/input.jpg',
        styleId: 'invalid-style',
      }),
    });
    const res = await app.fetch(req, MOCK_ENV);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Invalid styleId');
  });

  it('rejects image URLs from unapproved domains with 400', async () => {
    const req = new Request('http://localhost/stylize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: 'https://eviltracker.com/input.jpg',
        styleId: 'anime-football',
      }),
    });
    const res = await app.fetch(req, MOCK_ENV);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('domain must be cdn.fashn.ai');
  });

  it('returns success on mock successful Replicate call', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/predictions')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'pred_123',
            status: 'succeeded',
            output: ['https://cdn.replicate.com/stylized.jpg'],
          }),
        });
      }
      return Promise.resolve({ ok: true });
    });

    const req = new Request('http://localhost/stylize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: 'https://cdn.fashn.ai/input.jpg',
        styleId: 'anime-football',
      }),
    });
    const res = await app.fetch(req, MOCK_ENV);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; imageUrl: string };
    expect(data.status).toBe('success');
    expect(data.imageUrl).toBe('https://cdn.replicate.com/stylized.jpg');
  });

  it('returns status error on Replicate failure', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/predictions')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'pred_123',
            status: 'failed',
            error: 'Model crashed',
          }),
        });
      }
      return Promise.resolve({ ok: true });
    });

    const req = new Request('http://localhost/stylize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: 'https://cdn.fashn.ai/input.jpg',
        styleId: 'anime-football',
      }),
    });
    const res = await app.fetch(req, MOCK_ENV);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; error: string };
    expect(data.status).toBe('error');
    expect(data.error).toBe('Model crashed');
  });

  it('handles 429 rate limit with retry_after and then succeeds', async () => {
    let callsCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/predictions')) {
        callsCount++;
        if (callsCount < 3) {
          return Promise.resolve({
            ok: false,
            status: 429,
            json: async () => ({
              detail: 'Request was throttled',
              retry_after: 0.1,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'pred_123',
            status: 'succeeded',
            output: ['https://cdn.replicate.com/stylized.jpg'],
          }),
        });
      }
      return Promise.resolve({ ok: true });
    });

    vi.stubGlobal('setTimeout', (fn: () => void) => fn());

    const req = new Request('http://localhost/stylize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: 'https://cdn.fashn.ai/input.jpg',
        styleId: 'anime-football',
      }),
    });
    const res = await app.fetch(req, MOCK_ENV);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; imageUrl: string };
    expect(data.status).toBe('success');
    expect(data.imageUrl).toBe('https://cdn.replicate.com/stylized.jpg');
    expect(callsCount).toBe(3);

    vi.unstubAllGlobals();
  });

  it('rate limits stylize requests', async () => {
    (
      MOCK_ENV.RATE_LIMITER.get as unknown as {
        mockResolvedValueOnce: (val: string | null) => void;
      }
    ).mockResolvedValueOnce('15');
    const req = new Request('http://localhost/stylize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: 'https://cdn.fashn.ai/input.jpg',
        styleId: 'anime-football',
      }),
    });
    const res = await app.fetch(req, MOCK_ENV);
    expect(res.status).toBe(429);
  });
});
