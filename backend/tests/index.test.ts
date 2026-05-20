import { describe, it, expect, vi } from 'vitest';
import app from '../src/index';

const MOCK_ENV = {
  ALLOWED_ORIGIN: 'https://dadobtx.github.io',
  FASHN_API_KEY: 'test_token',
  RATE_LIMITER: {
    get: vi.fn(),
    put: vi.fn(),
  } as unknown as KVNamespace,
};

describe('Backend Proxy', () => {
  it('rejects requests without personImage or garmentImageUrl', async () => {
    const req = new Request('http://localhost/tryon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await app.fetch(req, MOCK_ENV);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string; status?: string };
    expect(data.error).toBe('Missing personImage or garmentImageUrl');
  });

  it('rate limits requests', async () => {
    (
      MOCK_ENV.RATE_LIMITER.get as unknown as {
        mockResolvedValueOnce: (val: string | null) => void;
      }
    ).mockResolvedValueOnce('10');
    const req = new Request('http://localhost/tryon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personImage: 'base64...',
        garmentImageUrl: 'http://...',
      }),
    });
    const res = await app.fetch(req, MOCK_ENV);
    expect(res.status).toBe(429);
  });
});
