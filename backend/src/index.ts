import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { runFashnTryOn, pollFashn } from './fashn';
import { runReplicateStylize } from './replicate';
import { STYLE_CATALOG } from './styles';

type Bindings = {
  FASHN_API_KEY: string;
  REPLICATE_API_TOKEN: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMITER: KVNamespace;
  DB: D1Database;
  KIOSK_REPORTS_TOKEN?: string;
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

// Rate Limiting for /tryon: 10 requests / IP / minute
app.use('/tryon', async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
  const minute = Math.floor(Date.now() / 60000);
  const key = `rate_limit_tryon:${ip}:${minute}`;

  const currentStr = await c.env.RATE_LIMITER.get(key);
  const current = currentStr ? parseInt(currentStr, 10) : 0;

  if (current >= 10) {
    return c.json({ status: 'error', error: 'Rate limit exceeded' }, 429);
  }

  await c.env.RATE_LIMITER.put(key, (current + 1).toString(), { expirationTtl: 120 });

  await next();
});

// Rate Limiting for /stylize: 15 requests / IP / minute
app.use('/stylize', async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
  const minute = Math.floor(Date.now() / 60000);
  const key = `rate_limit_stylize:${ip}:${minute}`;

  const currentStr = await c.env.RATE_LIMITER.get(key);
  const current = currentStr ? parseInt(currentStr, 10) : 0;

  if (current >= 15) {
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

app.post('/stylize', async (c) => {
  try {
    if (!c.env.REPLICATE_API_TOKEN) {
      return c.json(
        {
          status: 'error',
          error: 'REPLICATE_API_TOKEN is not configured on the server.',
        },
        500,
      );
    }

    const { imageUrl, styleId } = await c.req.json();

    if (!imageUrl || !styleId) {
      return c.json({ status: 'error', error: 'Missing imageUrl or styleId' }, 400);
    }

    // Validate styleId exists in catalog
    const style = STYLE_CATALOG.find((s) => s.id === styleId);
    if (!style) {
      return c.json({ status: 'error', error: `Invalid styleId: ${styleId}` }, 400);
    }

    // Validate imageUrl originates only from cdn.fashn.ai
    try {
      const parsedUrl = new URL(imageUrl);
      if (parsedUrl.hostname !== 'cdn.fashn.ai') {
        return c.json(
          { status: 'error', error: 'Invalid imageUrl: domain must be cdn.fashn.ai' },
          400,
        );
      }
    } catch {
      return c.json({ status: 'error', error: 'Invalid imageUrl format' }, 400);
    }

    const startTime = Date.now();
    console.log(`[stylize] start styleId=${styleId}`);

    const result = await runReplicateStylize(
      c.env.REPLICATE_API_TOKEN,
      imageUrl,
      style.prompt,
    );

    const durationMs = Date.now() - startTime;
    if (result.success) {
      console.log(
        `[stylize] result styleId=${styleId} status=success durationMs=${durationMs}`,
      );
    } else {
      console.log(
        `[stylize] result styleId=${styleId} status=error error="${result.error || ''}" durationMs=${durationMs}`,
      );
    }

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
    console.error('Stylize Error:', err);
    return c.json(
      {
        status: 'error',
        error: err.message || 'Internal Server Error',
      },
      200,
    );
  }
});

// Kiosk API Endpoints

app.get('/kiosk/catalog', async (c) => {
  try {
    const { results: prendas } = await c.env.DB.prepare(
      'SELECT * FROM prendas WHERE activo = 1',
    ).all();

    const { results: tablas } = await c.env.DB.prepare(
      'SELECT * FROM tablas_tallas',
    ).all();

    return c.json({ status: 'success', prendas, tablas });
  } catch (err) {
    return c.json(
      { status: 'error', error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

app.post('/kiosk/sessions', async (c) => {
  try {
    const body = await c.req.json();
    const session_id = crypto.randomUUID();

    await c.env.DB.prepare(
      `INSERT INTO sesiones (session_id, ubicacion_evento, dispositivo_id, talla_habitual, preferencia_fit, pecho_ar, cintura_ar, altura_ar, ar_confianza)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        session_id,
        body.ubicacion_evento || null,
        body.dispositivo_id || null,
        body.talla_habitual || null,
        body.preferencia_fit || null,
        body.pecho_ar || null,
        body.cintura_ar || null,
        body.altura_ar || null,
        body.ar_confianza || null,
      )
      .run();

    return c.json({ status: 'success', session_id });
  } catch (err) {
    return c.json(
      { status: 'error', error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

app.post('/kiosk/interactions', async (c) => {
  try {
    const body = await c.req.json();
    const interaccion_id = crypto.randomUUID();

    await c.env.DB.prepare(
      `INSERT INTO interacciones (interaccion_id, session_id, sku, accion, talla_recomendada, talla_elegida, tabla_origen_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        interaccion_id,
        body.session_id,
        body.sku,
        body.accion,
        body.talla_recomendada || null,
        body.talla_elegida || null,
        body.tabla_origen_id,
      )
      .run();

    return c.json({ status: 'success' });
  } catch (err) {
    return c.json(
      { status: 'error', error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

app.get('/kiosk/reports', async (c) => {
  try {
    const token = c.req.query('token');
    if (token !== (c.env.KIOSK_REPORTS_TOKEN || 'suzuki-kiosk-2026')) {
      return c.json({ status: 'error', error: 'Unauthorized' }, 401);
    }

    // Top prendas por interacción
    const { results: ranking } = await c.env.DB.prepare(
      `
      SELECT sku, talla_elegida, COUNT(*) as count
      FROM interacciones
      WHERE accion = 'probo' AND talla_elegida IS NOT NULL
      GROUP BY sku, talla_elegida
      ORDER BY count DESC
    `,
    ).all();

    // Distribución de medidas (solo sesiones con AR confiable)
    const { results: distribucion } = await c.env.DB.prepare(
      `
      SELECT i.sku, s.pecho_ar, s.cintura_ar
      FROM interacciones i
      JOIN sesiones s ON i.session_id = s.session_id
      WHERE s.ar_confianza > 0.8 AND s.pecho_ar IS NOT NULL AND s.cintura_ar IS NOT NULL
    `,
    ).all();

    // Top favoritos
    const { results: favoritos } = await c.env.DB.prepare(
      `
      SELECT sku, COUNT(*) as count
      FROM interacciones
      WHERE accion = 'favorito'
      GROUP BY sku
      ORDER BY count DESC
      LIMIT 10
    `,
    ).all();

    // Calibración AR vs Talla
    const { results: calibracion } = await c.env.DB.prepare(
      `
      SELECT i.tabla_origen_id, i.talla_elegida, AVG(s.pecho_ar) as avg_pecho, AVG(s.cintura_ar) as avg_cintura, COUNT(*) as count
      FROM interacciones i
      JOIN sesiones s ON i.session_id = s.session_id
      WHERE i.accion = 'probo' AND s.ar_confianza > 0.8 AND i.talla_elegida IS NOT NULL
      GROUP BY i.tabla_origen_id, i.talla_elegida
    `,
    ).all();

    return c.json({ status: 'success', ranking, distribucion, favoritos, calibracion });
  } catch (err) {
    return c.json(
      { status: 'error', error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

export default app;
