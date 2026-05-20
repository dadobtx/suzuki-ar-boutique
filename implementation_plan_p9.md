# Fase F9: Generative AI Backend (Replicate)

El objetivo de esta fase es implementar un flujo fotorrealista de "Virtual Try-On" que reemplaza el rudimentario overlay 2D usando el modelo de inteligencia artificial alojado en Replicate (ej. CAT-VTON). Para no exponer los secretos de la API en el frontend, introducimos un proxy backend en un Cloudflare Worker utilizando Hono.

## User Review Required

> [!WARNING] > **Modelo Replicate:** Se asumirá el uso de un modelo como `yisol/idm-vton` o `cuqin/cat-vton`. Necesitaré que confirmes cuál es el nombre y la versión/hash exactos del modelo a usar en Replicate. Por defecto usaré una estructura genérica lista para recibir el hash final.
> **Cloudflare KV:** El Rate Limiting propuesto (10 requests/IP/minuto) requiere configurar un namespace KV en Cloudflare (`wrangler kv:namespace create RATE_LIMITER`). Debes estar de acuerdo con crear este recurso en tu cuenta.

## Open Questions

1. ¿Deseas que el proxy retorne la imagen directamente en Base64 o preferimos enviar la URL temporal (TTL 24h) generada por Replicate para que el cliente la descargue directamente de su CDN ahorrando ancho de banda en el Worker? (Asumiré enviar la URL pública).
2. ¿Hay algún fallo que deba generar reintento automático silencioso (ej. HTTP 500 desde Replicate), o fallamos rápido al fallback 2D para no superar los 30s? (Asumiré fallar rápido al 2D).

## Proposed Changes

---

### Backend (Cloudflare Worker)

Implementación de la infraestructura serveless proxy.

#### [NEW] `backend/package.json`

- Configuración básica para `wrangler` y `hono`.

#### [NEW] `backend/wrangler.toml`

- Configuración del Worker `suzuki-ar-ai-proxy`.
- Variable `ALLOWED_ORIGIN` y binding para KV (Rate Limiting).

#### [NEW] `backend/src/index.ts`

- Servidor Hono.
- CORS middleware estricto (`ALLOWED_ORIGIN`).
- Rate Limiting Middleware apoyado en KV (trackeo de IPs).
- Endpoint `POST /tryon` que parsea los body JSON (imagen base64, prenda base64/url), lanza el proceso en Replicate y hace polling sincrónico.

#### [NEW] `backend/src/replicate.ts`

- Llamada a `https://api.replicate.com/v1/predictions`.
- Loop de polling cada 1s hasta status `succeeded` o timeout (25s para dejar margen).

#### [NEW] `backend/.gitignore` & `backend/.dev.vars.example`

- Ignorar node_modules, .dev.vars, .wrangler.

#### [NEW] `backend/README.md`

- Documentación de uso, deploy y setup local.

---

### Frontend API Client

#### [NEW] `src/lib/ai-tryon-client.ts`

- Cliente con función `generateTryOnPhoto(personImage, garmentImage)`.
- Manejo de Timeout en frontend (30s) abortando el fetch.

#### [NEW] `tests/unit/ai-tryon-client.test.ts`

- Mockeado de fetch para casos `success`, `error`, y `timeout`.

---

### Frontend Kiosk UI & State

#### [MODIFY] `src/store/kiosk.ts`

- Nuevos estados: `AI_PROCESSING` y `SHARE_QR_FALLBACK`.

#### [MODIFY] `src/store/photo.ts`

- Añadir metadata de IA: `aiGeneratedUrl`, `aiGenerationStatus`, `aiGenerationError`, `durationMs`.

#### [NEW] `src/components/kiosk/AIProcessing.tsx`

- Animación de "Generando tu look con IA...".
- Overlay sobre el video crudo de la persona.
- Frases dinámicas cambiantes cada 2 segundos.
- Control de timeout (fallback si demora mucho).

#### [MODIFY] `src/components/kiosk/PhotoShare.tsx`

- Condición de renderizado: Mostrar `photo.aiGeneratedUrl` en gran resolución si existe.
- Si no, usar `photoComposed` (con subtítulo "Vista Previa Demo").
- Embed de la duración de generación.

#### [MODIFY] `src/App.tsx` & `src/pages/HomePage.tsx`

- Mostrar `AIProcessing` si el estado es `AI_PROCESSING`.
- Mostrar `PhotoShare` también en `SHARE_QR_FALLBACK`.

#### [MODIFY] `src/components/camera/CameraStage.tsx`

- En lugar de ir directo de `PHOTO_COUNTDOWN` a `SHARE_QR`, transicionar a `AI_PROCESSING`.

---

### Diagnostics & Translation

#### [MODIFY] `src/i18n/es.json` & `en.json`

- Textos y frases para la vista de AI Processing.

#### [MODIFY] `src/pages/DiagPage.tsx`

- Añadir sección "AI BACKEND" para visualizar endpoint, salud (ping) y estadísticas de sesión.
- Botón "Test endpoint".

#### [MODIFY] `README.md`

- Documentar el componente Backend y `VITE_AI_BACKEND_URL`.

## Verification Plan

### Automated Tests

- Unit test del `ai-tryon-client.ts` para timeouts y errores de HTTP.

### Manual Verification

- Levantar `wrangler dev` y enviar un cURL válido simulado.
- Detener servidor `wrangler` (forzar timeout/red caída) para comprobar transición exitosa al Fallback 2D (`SHARE_QR_FALLBACK`).
- Completar flujo en `/kiosk=1`, ver pantalla de carga girando frases, observar imagen fotorrealista llegar y código QR apuntar a Replicate CDN.
