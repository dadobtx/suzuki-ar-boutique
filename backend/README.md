# Suzuki AR AI Proxy

Proxy serverless en Cloudflare Workers para consumir la API de Replicate. Protege el token de API y provee Rate Limiting.

## Setup Local

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Login a Cloudflare:
   ```bash
   npx wrangler login
   ```
3. Configurar tu token de Replicate:
   Crea un archivo `.dev.vars` (ver `.dev.vars.example`) o usa secrets para producción:
   ```bash
   npx wrangler secret put REPLICATE_API_TOKEN
   ```
4. Crear namespace para Rate Limiting:
   ```bash
   npx wrangler kv:namespace create RATE_LIMITER
   ```
   _Copia el `id` resultante en el `wrangler.toml`._

## Dev

Para ejecutar en local (usualmente puerto 8787):

```bash
npm run dev
```

## Deploy

Para publicar en Cloudflare:

```bash
npm run deploy
```

## Cambiar Modelo de Replicate

Abre `src/replicate.ts` y actualiza la constante `CATVTON_VERSION` con el hash deseado. Puedes encontrar este hash en la documentación del modelo en Replicate (ej. en la pestaña API -> Node.js).

## Rate Limiting

Está hardcodeado en `src/index.ts` a 10 requests por minuto por IP. Se almacena en la KV configurada. Para ajustarlo, modifica el middleware en `index.ts`.
