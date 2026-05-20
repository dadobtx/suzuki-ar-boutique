import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runFashnTryOn, pollFashn } from '../src/fashn';

describe('Fashn AI Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('runFashnTryOn', () => {
    it('successfully submits prediction request', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'fashn_id_123' }),
      });

      const res = await runFashnTryOn('mock_api_key', 'person_b64', 'garment_b64');
      expect(res.id).toBe('fashn_id_123');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.fashn.ai/v1/run',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock_api_key',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('throws error when authentication fails (HTTP 401)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(
        runFashnTryOn('invalid_key', 'person_b64', 'garment_b64'),
      ).rejects.toThrow('FASHN API submit error: 401 Unauthorized');
    });
  });

  describe('pollFashn', () => {
    it('returns success on completed status with output URL', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'completed',
          output: ['https://cdn.fashn.ai/output.jpg'],
          error: null,
        }),
      });

      const res = await pollFashn('fashn_id_123', 'mock_api_key');
      expect(res.success).toBe(true);
      expect(res.imageUrl).toBe('https://cdn.fashn.ai/output.jpg');
    });

    it('returns error when status is failed', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'failed',
          output: null,
          error: { name: 'InternalError', message: 'Something went wrong' },
        }),
      });

      const res = await pollFashn('fashn_id_123', 'mock_api_key');
      expect(res.success).toBe(false);
      expect(res.error).toBe('InternalError: Something went wrong');
    });

    it('polls multiple times if status is starting or processing', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            ok: true,
            json: async () => ({ status: 'processing', output: null, error: null }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            status: 'completed',
            output: ['https://cdn.fashn.ai/output.jpg'],
            error: null,
          }),
        };
      });

      vi.stubGlobal('setTimeout', (fn: () => void) => fn());

      const res = await pollFashn('fashn_id_123', 'mock_api_key');
      expect(res.success).toBe(true);
      expect(res.imageUrl).toBe('https://cdn.fashn.ai/output.jpg');
      expect(callCount).toBe(3);

      vi.unstubAllGlobals();
    });

    it('returns error on timeout if max duration is reached', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'processing', output: null, error: null }),
      });

      vi.stubGlobal('setTimeout', (fn: () => void) => fn());

      const res = await pollFashn('fashn_id_123', 'mock_api_key');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Polling timeout after');

      vi.unstubAllGlobals();
    });
  });
});
