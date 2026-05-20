import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { runFashnTryOn, pollFashn } from './fashn';

type Bindings = {
  FASHN_API_KEY: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMITER: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// Basic CORS
app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: (origin) => {
      const allowedOrigins = c.env.ALLOWED_ORIGIN.split(',').map((s) => s.trim());
      return allowedOrigins.includes(origin) ? origin : null;
    },
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  });
  return await corsMiddleware(c, next);
});

// Basic Rate Limiting: 10 requests / IP / minute
app.use('/tryon', async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
  const minute = Math.floor(Date.now() / 60000);
  const key = `rate_limit:${ip}:${minute}`;

  const currentStr = await c.env.RATE_LIMITER.get(key);
  const current = currentStr ? parseInt(currentStr, 10) : 0;

  if (current >= 10) {
    return c.json({ status: 'error', error: 'Rate limit exceeded' }, 429);
  }

  await c.env.RATE_LIMITER.put(key, (current + 1).toString(), { expirationTtl: 120 });

  await next();
});

app.post('/tryon', async (c) => {
  try {
    if (!c.env.FASHN_API_KEY) {
      return c.json(
        { status: 'error', error: 'FASHN_API_KEY is not configured on the server.' },
        500,
      );
    }

    const { personImage, garmentImageUrl } = await c.req.json();

    if (!personImage || !garmentImageUrl) {
      return c.json(
        { status: 'error', error: 'Missing personImage or garmentImageUrl' },
        400,
      );
    }

    const startTime = Date.now();

    // 1. Create Prediction
    let prediction;
    try {
      prediction = await runFashnTryOn(c.env.FASHN_API_KEY, personImage, garmentImageUrl);
    } catch (e) {
      const err = e as Error;
      return c.json(
        { status: 'error', error: `Initial request failed: ${err.message}` },
        200,
      );
    }

    console.log(`[tryon] start prediction=${prediction.id} model=tryon-v1.6`);

    // 2. Poll until finished (timeout ~30s)
    const result = await pollFashn(prediction.id, c.env.FASHN_API_KEY);

    const durationMs = Date.now() - startTime;
    console.log(
      `[tryon] result prediction=${prediction.id} status=${result.success ? 'success' : 'error'} durationMs=${durationMs}`,
    );

    if (result.success) {
      return c.json(
        {
          status: 'success',
          imageUrl: result.imageUrl,
          durationMs,
        },
        200,
      );
    } else {
      return c.json(
        {
          status: 'error',
          error: result.error || 'Generation failed',
        },
        200,
      );
    }
  } catch (error) {
    const err = error as Error;
    console.error('TryOn Error:', err);
    return c.json(
      {
        status: 'error',
        error: err.message || 'Internal Server Error',
      },
      200,
    );
  }
});

export default app;
