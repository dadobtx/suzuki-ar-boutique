import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index';

const DB_MOCK = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  run: vi.fn(),
  all: vi.fn(),
};

const MOCK_ENV = {
  DB: DB_MOCK as unknown as D1Database,
  FAL_API_KEY: 'test_key',
  LIVE_SESSION_SECONDS: 15,
  LIVE_MAX_SESSIONS_PER_USER: 3,
  LIVE_MAX_SESSIONS_PER_DAY: 400,
  LIVE_BUDGET_CENTS_PER_EVENT: 10000,
};

describe('Live Try-On API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'mocked-fal-token' }),
    });
  });

  describe('POST /live/token', () => {
    it('returns 500 if FAL_API_KEY is not configured', async () => {
      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: '123', sku: 'sku', event: 'evt' }),
      });
      const envWithoutKey = { ...MOCK_ENV, FAL_API_KEY: undefined };
      const res = await app.fetch(req, envWithoutKey as unknown as typeof MOCK_ENV);

      expect(res.status).toBe(500);
      const data = (await res.json()) as { error?: string };
      expect(data.error).toBe('FAL_API_KEY is not configured.');
    });

    it('returns 429 if user exceeds per-user limit', async () => {
      DB_MOCK.all.mockResolvedValueOnce({
        results: [{ count: 3 }],
      });

      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'user1', sku: 'sku', event: 'evt' }),
      });
      const res = await app.fetch(req, MOCK_ENV);

      expect(res.status).toBe(429);
      const data = (await res.json()) as { limit?: string };
      expect(data.limit).toBe('user');
    });

    it('returns 429 if daily session limit is exceeded', async () => {
      DB_MOCK.all
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // userRes
        .mockResolvedValueOnce({ results: [{ count: 400 }] }); // dayRes

      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'user2', sku: 'sku', event: 'evt' }),
      });
      const res = await app.fetch(req, MOCK_ENV);

      expect(res.status).toBe(429);
      const data = (await res.json()) as { limit?: string };
      expect(data.limit).toBe('day');
    });

    it('returns 429 if event budget is exceeded', async () => {
      DB_MOCK.all
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // userRes
        .mockResolvedValueOnce({ results: [{ count: 10 }] }) // dayRes
        .mockResolvedValueOnce({ results: [{ total: 5000 }] }); // secRes

      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'user3', sku: 'sku', event: 'evt' }),
      });
      const res = await app.fetch(req, MOCK_ENV);

      expect(res.status).toBe(429);
      const data = (await res.json()) as { limit?: string };
      expect(data.limit).toBe('budget');
    });

    it('returns success and inserts pessimistic billing on valid request', async () => {
      DB_MOCK.all
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // userRes
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // dayRes
        .mockResolvedValueOnce({ results: [{ total: 0 }] }); // secRes

      // Mock INSERT returning ID
      DB_MOCK.run.mockResolvedValueOnce({ meta: { last_row_id: 12345 } });

      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'user4', sku: 'sku', event: 'evt' }),
      });

      const res = await app.fetch(req, MOCK_ENV);
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        status?: string;
        token?: string;
        live_id?: number;
        max_seconds?: number;
      };
      expect(data.status).toBe('success');
      expect(data.token).toBe('mocked-fal-token');
      expect(data.live_id).toBe(12345);
      expect(data.max_seconds).toBe(15);

      // Verify D1 binding for insert
      expect(DB_MOCK.bind).toHaveBeenCalledWith('user4', 'sku', 'evt', 15);
    });

    it('deletes pessimistic row if fal token fetch fails', async () => {
      DB_MOCK.all
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // userRes
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // dayRes
        .mockResolvedValueOnce({ results: [{ total: 0 }] }); // secRes

      DB_MOCK.run.mockResolvedValueOnce({ meta: { last_row_id: 999 } });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        text: async () => 'Internal Server Error',
      });

      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'user5', sku: 'sku', event: 'evt' }),
      });

      const res = await app.fetch(req, MOCK_ENV);
      expect(res.status).toBe(500);

      // Verify rollback deletion was called with the ID 999
      expect(DB_MOCK.bind).toHaveBeenCalledWith(999);
    });
  });

  describe('POST /live/complete', () => {
    it('updates seconds downward correctly', async () => {
      DB_MOCK.run.mockResolvedValueOnce({ success: true });

      const req = new Request('http://localhost/live/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live_id: 12345, seconds: 5 }),
      });

      const res = await app.fetch(req, MOCK_ENV);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { status?: string };
      expect(data.status).toBe('success');

      // Verify it clamped using the query that includes `seconds > ?`
      expect(DB_MOCK.bind).toHaveBeenCalledWith(5, 12345, 5);
    });
  });
});
