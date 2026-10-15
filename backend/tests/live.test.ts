import { describe, it, expect, vi, beforeEach } from 'vitest';
import app, { _resetQuotaCacheForTesting } from '../src/index';

const DB_MOCK = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  run: vi.fn(),
  all: vi.fn(),
};

const MOCK_ENV = {
  DB: DB_MOCK as unknown as D1Database,
  FAL_API_KEY: 'test_fal_key',
  DECART_API_KEY: 'test_decart_key',
  LIVE_PROVIDER: 'decart',
  KIOSK_KEY: 'kiosk_secret_123',
  LIVE_SESSION_SECONDS: 15,
  LIVE_MAX_SESSIONS_PER_USER: 3,
  LIVE_MAX_SESSIONS_PER_DAY: 400,
  LIVE_BUDGET_CENTS_PER_EVENT: 10000,
};

describe('Live Try-On API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetQuotaCacheForTesting();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiKey: 'decart-client-token-abc',
        expiresAt: '2026-10-15T02:00:00Z',
        token: 'jwt-token-xyz',
      }),
    });
  });

  describe('POST /live/token - Kiosk Key Security', () => {
    it('returns 403 { reason: "kiosk_key" } if X-Kiosk-Key header is missing', async () => {
      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'user1', sku: '990F0-BLPK0', event: 'evt' }),
      });
      const res = await app.fetch(req, MOCK_ENV);

      expect(res.status).toBe(403);
      const data = (await res.json()) as { reason?: string };
      expect(data.reason).toBe('kiosk_key');
    });

    it('returns 403 { reason: "kiosk_key" } if X-Kiosk-Key is invalid', async () => {
      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Key': 'wrong_key',
        },
        body: JSON.stringify({ session_id: 'user1', sku: '990F0-BLPK0', event: 'evt' }),
      });
      const res = await app.fetch(req, MOCK_ENV);

      expect(res.status).toBe(403);
      const data = (await res.json()) as { reason?: string };
      expect(data.reason).toBe('kiosk_key');
    });
  });

  describe('POST /live/token - Busy Lock (Candado)', () => {
    it('returns 429 { reason: "busy" } if an unfinished session started less than max_seconds + 30 ago', async () => {
      // Mock busy check returning an active row
      DB_MOCK.all.mockResolvedValueOnce({
        results: [{ id: 99 }],
      });

      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Key': 'kiosk_secret_123',
        },
        body: JSON.stringify({ session_id: 'user1', sku: '990F0-BLPK0', event: 'evt' }),
      });
      const res = await app.fetch(req, MOCK_ENV);

      expect(res.status).toBe(429);
      const data = (await res.json()) as { reason?: string };
      expect(data.reason).toBe('busy');
      expect(DB_MOCK.bind).toHaveBeenCalledWith(45); // 15s maxSeconds + 30
    });
  });

  describe('POST /live/token - Quota Limits', () => {
    it('returns 429 if user exceeds per-user limit', async () => {
      DB_MOCK.all
        .mockResolvedValueOnce({ results: [] }) // busy check
        .mockResolvedValueOnce({ results: [{ count: 3 }] }); // userRes

      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Key': 'kiosk_secret_123',
        },
        body: JSON.stringify({ session_id: 'user1', sku: 'sku', event: 'evt' }),
      });
      const res = await app.fetch(req, MOCK_ENV);

      expect(res.status).toBe(429);
      const data = (await res.json()) as { limit?: string };
      expect(data.limit).toBe('user');
    });

    it('returns 429 if daily session limit is exceeded', async () => {
      DB_MOCK.all
        .mockResolvedValueOnce({ results: [] }) // busy check
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // userRes
        .mockResolvedValueOnce({ results: [{ count: 400 }] }); // dayRes

      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Key': 'kiosk_secret_123',
        },
        body: JSON.stringify({ session_id: 'user2', sku: 'sku', event: 'evt' }),
      });
      const res = await app.fetch(req, MOCK_ENV);

      expect(res.status).toBe(429);
      const data = (await res.json()) as { limit?: string };
      expect(data.limit).toBe('day');
    });

    it('returns 429 if event budget is exceeded', async () => {
      DB_MOCK.all
        .mockResolvedValueOnce({ results: [] }) // busy check
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // userRes
        .mockResolvedValueOnce({ results: [{ count: 10 }] }) // dayRes
        .mockResolvedValueOnce({ results: [{ total: 5000 }] }); // secRes

      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Key': 'kiosk_secret_123',
        },
        body: JSON.stringify({ session_id: 'user3', sku: 'sku', event: 'evt' }),
      });
      const res = await app.fetch(req, MOCK_ENV);

      expect(res.status).toBe(429);
      const data = (await res.json()) as { limit?: string };
      expect(data.limit).toBe('budget');
    });
  });

  describe('POST /live/token - Decart Provider', () => {
    it('returns 500 if DECART_API_KEY is not configured', async () => {
      DB_MOCK.all
        .mockResolvedValueOnce({ results: [] }) // busy check
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // userRes
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // dayRes
        .mockResolvedValueOnce({ results: [{ total: 0 }] }); // secRes

      DB_MOCK.run.mockResolvedValueOnce({ meta: { last_row_id: 111 } });

      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Key': 'kiosk_secret_123',
        },
        body: JSON.stringify({ session_id: '123', sku: 'sku', event: 'evt' }),
      });
      const envWithoutKey = { ...MOCK_ENV, DECART_API_KEY: undefined };
      const res = await app.fetch(req, envWithoutKey as unknown as typeof MOCK_ENV);

      expect(res.status).toBe(500);
      const data = (await res.json()) as { error?: string };
      expect(data.error).toBe('DECART_API_KEY is not configured.');
    });

    it('calls Decart API with allowedModels, maxSessionDuration and returns client token', async () => {
      DB_MOCK.all
        .mockResolvedValueOnce({ results: [] }) // busy check
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // userRes
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // dayRes
        .mockResolvedValueOnce({ results: [{ total: 0 }] }); // secRes

      DB_MOCK.run.mockResolvedValueOnce({ meta: { last_row_id: 12345 } });

      let capturedUrl = '';
      let capturedOptions: { headers?: Record<string, string>; body?: string } | null =
        null;
      globalThis.fetch = vi.fn().mockImplementation((url, options) => {
        capturedUrl = String(url);
        capturedOptions = options;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            apiKey: 'decart-client-token-999',
            expiresAt: '2026-10-15T02:00:00Z',
          }),
        });
      });

      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Key': 'kiosk_secret_123',
        },
        body: JSON.stringify({
          session_id: 'user-decart',
          sku: '990F0-BLPK0',
          event: 'evt',
        }),
      });

      const res = await app.fetch(req, MOCK_ENV);
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        status?: string;
        provider?: string;
        apiKey?: string;
        expiresAt?: string;
        max_seconds?: number;
        live_session_id?: number;
      };

      expect(data.status).toBe('success');
      expect(data.provider).toBe('decart');
      expect(data.apiKey).toBe('decart-client-token-999');
      expect(data.max_seconds).toBe(15);
      expect(data.live_session_id).toBe(12345);

      // Verify Decart API request
      expect(capturedUrl).toBe('https://api.decart.ai/v1/client/tokens');
      const opts = capturedOptions as {
        headers?: Record<string, string>;
        body?: string;
      } | null;
      expect(opts?.headers?.['x-api-key']).toBe('test_decart_key');

      const body = JSON.parse(opts?.body || '{}');
      expect(body.expiresIn).toBe(60);
      expect(body.allowedModels).toEqual(['lucy-vton-latest']);
      expect(body.constraints?.realtime?.maxSessionDuration).toBe(20); // 15 + 5
      expect(body.allowedOrigins).toContain('https://dadobtx.github.io');
    });

    it('rolls back row and records in live_intentos if Decart token fetch fails', async () => {
      DB_MOCK.all
        .mockResolvedValueOnce({ results: [] }) // busy check
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // userRes
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // dayRes
        .mockResolvedValueOnce({ results: [{ total: 0 }] }); // secRes

      DB_MOCK.run.mockResolvedValueOnce({ meta: { last_row_id: 888 } });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Decart upstream down',
      });

      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Key': 'kiosk_secret_123',
        },
        body: JSON.stringify({
          session_id: 'user-fail',
          sku: '990F0-BLPK0',
          event: 'evt',
        }),
      });

      const res = await app.fetch(req, MOCK_ENV);
      expect(res.status).toBe(500);

      // Verify rollback deletion for row 888
      expect(DB_MOCK.prepare).toHaveBeenCalledWith(
        'DELETE FROM live_sesiones WHERE id = ?',
      );
      expect(DB_MOCK.bind).toHaveBeenCalledWith(888);
    });
  });

  describe('POST /live/token - FAL Provider Fallback', () => {
    it('returns fal token when LIVE_PROVIDER is "fal"', async () => {
      const falEnv = { ...MOCK_ENV, LIVE_PROVIDER: 'fal' };

      DB_MOCK.all
        .mockResolvedValueOnce({ results: [] }) // busy check
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // userRes
        .mockResolvedValueOnce({ results: [{ count: 0 }] }) // dayRes
        .mockResolvedValueOnce({ results: [{ total: 0 }] }); // secRes

      DB_MOCK.run.mockResolvedValueOnce({ meta: { last_row_id: 777 } });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'mocked-fal-jwt' }),
      });

      const req = new Request('http://localhost/live/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Key': 'kiosk_secret_123',
        },
        body: JSON.stringify({ session_id: 'user-fal', sku: 'sku', event: 'evt' }),
      });

      const res = await app.fetch(req, falEnv);
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        provider?: string;
        token?: string;
        live_session_id?: number;
      };
      expect(data.provider).toBe('fal');
      expect(data.token).toBe('mocked-fal-jwt');
      expect(data.live_session_id).toBe(777);
    });
  });

  describe('GET /live/quota', () => {
    it('fetches quota and caches it for 2 seconds', async () => {
      let quotaFetchCount = 0;
      globalThis.fetch = vi.fn().mockImplementation((url) => {
        if (String(url).includes('/v1/realtime/quota')) {
          quotaFetchCount++;
          return Promise.resolve({
            ok: true,
            json: async () => ({ limit: 5, active: 1, remaining: 4 }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const req1 = new Request('http://localhost/live/quota');
      const res1 = await app.fetch(req1, MOCK_ENV);
      expect(res1.status).toBe(200);
      const data1 = (await res1.json()) as {
        limit: number;
        active: number;
        remaining: number;
      };
      expect(data1).toEqual({ limit: 5, active: 1, remaining: 4 });
      expect(quotaFetchCount).toBe(1);

      // Call immediately again: must be cached in memory
      const req2 = new Request('http://localhost/live/quota');
      const res2 = await app.fetch(req2, MOCK_ENV);
      expect(res2.status).toBe(200);
      const data2 = (await res2.json()) as {
        limit: number;
        active: number;
        remaining: number;
      };
      expect(data2).toEqual({ limit: 5, active: 1, remaining: 4 });
      expect(quotaFetchCount).toBe(1); // Not called again!
    });

    it('returns { unknown: true } if Decart API fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const req = new Request('http://localhost/live/quota');
      const res = await app.fetch(req, MOCK_ENV);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { unknown?: boolean };
      expect(data.unknown).toBe(true);
    });
  });

  describe('POST /live/fail', () => {
    it('records failed attempt in live_intentos and deletes from live_sesiones', async () => {
      DB_MOCK.run.mockResolvedValue({ success: true });

      const req = new Request('http://localhost/live/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          live_session_id: 12345,
          session_id: 'session-fail',
          sku: '990F0-BLPK0',
          provider: 'decart',
          reason: 'limit',
          detail: 'Concurrent session limit reached',
        }),
      });

      const res = await app.fetch(req, MOCK_ENV);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { status?: string };
      expect(data.status).toBe('success');

      expect(DB_MOCK.prepare).toHaveBeenCalledWith(
        'DELETE FROM live_sesiones WHERE id = ?',
      );
      expect(DB_MOCK.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO live_intentos'),
      );
    });
  });

  describe('POST /live/complete', () => {
    it('updates seconds downward and sets completed_at', async () => {
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

      expect(DB_MOCK.bind).toHaveBeenCalledWith(5, 5, 5, 12345);
    });

    it('records into live_intentos and deletes row if failed is true', async () => {
      DB_MOCK.all.mockResolvedValueOnce({
        results: [{ session_id: 'sess-1', sku: 'sku-1', provider: 'decart' }],
      });
      DB_MOCK.run.mockResolvedValue({ success: true });

      const req = new Request('http://localhost/live/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          live_id: 12345,
          failed: true,
          reason: 'no_video_timeout',
          detail: 'Video timeout after 30s',
        }),
      });

      const res = await app.fetch(req, MOCK_ENV);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { status?: string; deleted?: boolean };
      expect(data.status).toBe('success');
      expect(data.deleted).toBe(true);

      expect(DB_MOCK.prepare).toHaveBeenCalledWith(
        'DELETE FROM live_sesiones WHERE id = ?',
      );
      expect(DB_MOCK.bind).toHaveBeenCalledWith(12345);
    });

    it('parses JSON payload sent with Content-Type text/plain (sendBeacon format)', async () => {
      DB_MOCK.run.mockResolvedValueOnce({ success: true });

      const req = new Request('http://localhost/live/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ live_id: 9999, seconds: 12 }),
      });

      const res = await app.fetch(req, MOCK_ENV);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { status?: string };
      expect(data.status).toBe('success');

      expect(DB_MOCK.bind).toHaveBeenCalledWith(12, 12, 12, 9999);
    });
  });

  describe('GET /kiosk/reports', () => {
    it('includes live block with exitosas and fallidas_por_reason', async () => {
      DB_MOCK.all
        .mockResolvedValueOnce({ results: [] }) // ranking
        .mockResolvedValueOnce({ results: [] }) // distribucion
        .mockResolvedValueOnce({ results: [] }) // favoritos
        .mockResolvedValueOnce({ results: [] }) // calibracion
        .mockResolvedValueOnce({
          results: [{ sesiones_hoy: 12, segundos_hoy: 180 }],
        }) // liveStats
        .mockResolvedValueOnce({
          results: [{ reason: 'limit', provider: 'decart', count: 3 }],
        }); // failStats

      const req = new Request('http://localhost/kiosk/reports?token=suzuki-kiosk-2026');
      const res = await app.fetch(req, MOCK_ENV);

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        live?: {
          sesiones_hoy: number;
          segundos_hoy: number;
          fallidas_por_reason: Record<string, unknown>[];
          proveedor_actual: string;
        };
      };

      expect(data.live?.sesiones_hoy).toBe(12);
      expect(data.live?.segundos_hoy).toBe(180);
      expect(data.live?.fallidas_por_reason).toEqual([
        { reason: 'limit', provider: 'decart', count: 3 },
      ]);
      expect(data.live?.proveedor_actual).toBe('decart');
    });
  });
});
